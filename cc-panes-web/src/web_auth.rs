use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use axum::body::Body;
use axum::extract::State;
use axum::http::header::{self, HeaderValue};
use axum::http::{Request, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use axum::Json;
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};

use crate::state::AppState;

const SESSION_COOKIE: &str = "ccp_web_session";
const SESSION_TTL: Duration = Duration::from_secs(60 * 60 * 24 * 7);

#[derive(Default)]
pub struct WebAuthStore {
    sessions: Mutex<HashMap<String, Instant>>,
}

impl WebAuthStore {
    pub fn create_session(&self) -> String {
        let token = generate_token();
        self.sessions
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .insert(token.clone(), Instant::now());
        token
    }

    pub fn validate_session(&self, token: &str, idle_timeout: Option<Duration>) -> bool {
        let mut sessions = self.sessions.lock().unwrap_or_else(|err| err.into_inner());
        let now = Instant::now();
        sessions.retain(|_, last_seen| now.duration_since(*last_seen) <= SESSION_TTL);

        let Some(last_seen) = sessions.get_mut(token) else {
            return false;
        };

        if idle_timeout.is_some_and(|timeout| now.duration_since(*last_seen) > timeout) {
            sessions.remove(token);
            return false;
        }

        *last_seen = now;
        true
    }

    pub fn revoke_session(&self, token: &str) {
        self.sessions
            .lock()
            .unwrap_or_else(|err| err.into_inner())
            .remove(token);
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthStatus {
    pub auth_required: bool,
    pub authenticated: bool,
    pub username: String,
    pub password_configured: bool,
    pub allow_lan: bool,
    pub lock_on_idle_minutes: u16,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginResponse {
    pub authenticated: bool,
}

pub async fn status(State(state): State<AppState>, request: Request<Body>) -> Json<AuthStatus> {
    let settings = state.settings_service.get_settings().web_access;
    let authenticated = !settings.auth_required()
        || session_from_request(&request).is_some_and(|token| {
            state
                .web_auth
                .validate_session(&token, idle_timeout(&settings))
        });
    let auth_required = settings.auth_required();
    let password_configured = settings.password_configured();

    Json(AuthStatus {
        auth_required,
        authenticated,
        username: settings.username,
        password_configured,
        allow_lan: settings.allow_lan,
        lock_on_idle_minutes: settings.lock_on_idle_minutes,
    })
}

pub async fn login(State(state): State<AppState>, Json(request): Json<LoginRequest>) -> Response {
    let settings = state.settings_service.get_settings().web_access;
    if !settings.auth_required() {
        return Json(LoginResponse {
            authenticated: true,
        })
        .into_response();
    }

    let username_matches = request.username.trim() == settings.username;
    if !username_matches || !settings.verify_password(&request.password) {
        return json_error(
            StatusCode::UNAUTHORIZED,
            "UNAUTHORIZED",
            "Invalid username or password",
        );
    }

    let token = state.web_auth.create_session();
    let mut response = Json(LoginResponse {
        authenticated: true,
    })
    .into_response();
    response.headers_mut().insert(
        header::SET_COOKIE,
        HeaderValue::from_str(&format!(
            "{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={}",
            SESSION_TTL.as_secs()
        ))
        .expect("valid cookie header"),
    );
    response
}

pub async fn logout(State(state): State<AppState>, request: Request<Body>) -> Response {
    if let Some(token) = session_from_request(&request) {
        state.web_auth.revoke_session(&token);
    }

    let mut response = Json(serde_json::json!({ "locked": true })).into_response();
    response.headers_mut().insert(
        header::SET_COOKIE,
        HeaderValue::from_static("ccp_web_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"),
    );
    response
}

pub async fn access_control(
    State(state): State<AppState>,
    request: Request<Body>,
    next: Next,
) -> Response {
    let settings = state.settings_service.get_settings().web_access;

    if let Some(remote_addr) = request
        .extensions()
        .get::<axum::extract::connect_info::ConnectInfo<SocketAddr>>()
        .map(|info| info.0)
    {
        if !remote_allowed(remote_addr.ip(), &settings) {
            return json_error(
                StatusCode::FORBIDDEN,
                "REMOTE_FORBIDDEN",
                "Remote access is not allowed by Web access settings",
            );
        }
    }

    if !settings.auth_required() {
        return next.run(request).await;
    }

    let authenticated = session_from_request(&request).is_some_and(|token| {
        state
            .web_auth
            .validate_session(&token, idle_timeout(&settings))
    });

    if authenticated {
        next.run(request).await
    } else {
        json_error(
            StatusCode::UNAUTHORIZED,
            "UNAUTHORIZED",
            "Web session is locked or not authenticated",
        )
    }
}

fn idle_timeout(settings: &cc_panes_core::models::settings::WebAccessSettings) -> Option<Duration> {
    (settings.lock_on_idle_minutes > 0)
        .then(|| Duration::from_secs(u64::from(settings.lock_on_idle_minutes) * 60))
}

fn remote_allowed(
    ip: IpAddr,
    settings: &cc_panes_core::models::settings::WebAccessSettings,
) -> bool {
    if ip.is_loopback() {
        return true;
    }
    if !settings.allow_lan || !settings.auth_required() {
        return false;
    }
    if settings.ip_whitelist.is_empty() {
        return true;
    }
    settings
        .ip_whitelist
        .iter()
        .filter_map(|value| value.parse::<IpAddr>().ok())
        .any(|allowed| allowed == ip)
}

fn session_from_request(request: &Request<Body>) -> Option<String> {
    let cookie = request.headers().get(header::COOKIE)?.to_str().ok()?;
    cookie.split(';').find_map(|part| {
        let (name, value) = part.trim().split_once('=')?;
        (name == SESSION_COOKIE && !value.is_empty()).then(|| value.to_string())
    })
}

fn generate_token() -> String {
    let mut bytes = [0_u8; 32];
    OsRng.fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn json_error(status: StatusCode, code: &str, message: &str) -> Response {
    (
        status,
        Json(serde_json::json!({
            "code": code,
            "message": message,
        })),
    )
        .into_response()
}

#[cfg(test)]
mod tests {
    use cc_panes_core::models::settings::WebAccessSettings;

    use super::*;

    #[test]
    fn remote_access_requires_lan_and_auth() {
        let mut settings = WebAccessSettings {
            allow_lan: true,
            auth_enabled: true,
            ..WebAccessSettings::default()
        };
        assert!(!remote_allowed("192.168.1.10".parse().unwrap(), &settings));

        settings.password_salt = Some("00".into());
        settings.password_hash = Some("hash".into());
        assert!(remote_allowed("192.168.1.10".parse().unwrap(), &settings));
    }

    #[test]
    fn whitelist_limits_remote_ips() {
        let settings = WebAccessSettings {
            allow_lan: true,
            auth_enabled: true,
            password_salt: Some("00".into()),
            password_hash: Some("hash".into()),
            ip_whitelist: vec!["192.168.1.20".into()],
            ..WebAccessSettings::default()
        };

        assert!(!remote_allowed("192.168.1.10".parse().unwrap(), &settings));
        assert!(remote_allowed("192.168.1.20".parse().unwrap(), &settings));
    }
}
