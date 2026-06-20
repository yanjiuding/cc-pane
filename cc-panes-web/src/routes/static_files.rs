use axum::{
    http::{header, StatusCode, Uri},
    response::{Html, IntoResponse, Response},
};
use rust_embed::Embed;
use std::borrow::Cow;
use std::path::{Path, PathBuf};

#[derive(Embed)]
#[folder = "static/"]
struct StaticAssets;

/// Serve the built React client from `dist/` when available.
/// Falls back to the embedded legacy terminal page for older standalone builds.
pub async fn static_handler(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    let requested_path = if path.is_empty() { "index.html" } else { path };

    if let Some(response) = serve_dist_file(requested_path) {
        return response;
    }

    if is_spa_route(requested_path) {
        if let Some(response) = serve_dist_file("index.html") {
            return response;
        }
    }

    if let Some(response) = serve_embedded_file(requested_path) {
        return response;
    }

    match StaticAssets::get("index.html") {
        Some(file) => Html(String::from_utf8_lossy(&file.data).to_string()).into_response(),
        None => (StatusCode::NOT_FOUND, "Not Found").into_response(),
    }
}

fn serve_dist_file(path: &str) -> Option<Response> {
    let dist_root = dist_root();
    let file_path = safe_join(&dist_root, path)?;
    let bytes = std::fs::read(&file_path).ok()?;
    Some(file_response(path, bytes))
}

fn serve_embedded_file(path: &str) -> Option<Response> {
    let file = StaticAssets::get(path)?;
    Some(file_response(path, file.data))
}

fn file_response(path: &str, bytes: impl Into<Cow<'static, [u8]>>) -> Response {
    let mime = mime_guess::from_path(path).first_or_octet_stream();
    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, mime.as_ref())],
        bytes.into().into_owned(),
    )
        .into_response()
}

fn dist_root() -> PathBuf {
    std::env::var_os("CCPANES_WEB_DIST_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("dist"))
}

fn safe_join(root: &Path, request_path: &str) -> Option<PathBuf> {
    let mut path = root.to_path_buf();
    for component in Path::new(request_path).components() {
        match component {
            std::path::Component::Normal(segment) => path.push(segment),
            _ => return None,
        }
    }
    Some(path)
}

fn is_spa_route(path: &str) -> bool {
    !path.starts_with("api/") && !path.starts_with("ws/") && !path.contains('.')
}
