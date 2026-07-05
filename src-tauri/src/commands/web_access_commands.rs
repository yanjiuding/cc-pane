use std::sync::Arc;

use tauri::{AppHandle, Manager, State};
use tracing::debug;

use crate::services::{SettingsService, WebAccessLifecycle, WebAccessStatus};
use crate::utils::{AppPaths, AppResult};

#[tauri::command]
pub fn get_web_access_status(
    settings_service: State<'_, Arc<SettingsService>>,
    web_access: State<'_, Arc<WebAccessLifecycle>>,
) -> AppResult<WebAccessStatus> {
    let settings = settings_service.get_settings().web_access;
    Ok(web_access.status(&settings))
}

#[tauri::command]
pub fn start_web_access(
    app: AppHandle,
    app_paths: State<'_, Arc<AppPaths>>,
    settings_service: State<'_, Arc<SettingsService>>,
    web_access: State<'_, Arc<WebAccessLifecycle>>,
) -> AppResult<WebAccessStatus> {
    debug!("cmd::start_web_access");
    let all_settings = settings_service.get_settings();
    let resource_dir = app.path().resource_dir().ok();
    web_access.start(
        app_paths.inner().as_ref(),
        resource_dir.as_deref(),
        &all_settings.web_access,
        all_settings.terminal.daemon_enabled,
    )
}

#[tauri::command]
pub fn restart_web_access(
    app: AppHandle,
    app_paths: State<'_, Arc<AppPaths>>,
    settings_service: State<'_, Arc<SettingsService>>,
    web_access: State<'_, Arc<WebAccessLifecycle>>,
) -> AppResult<WebAccessStatus> {
    debug!("cmd::restart_web_access");
    let all_settings = settings_service.get_settings();
    let resource_dir = app.path().resource_dir().ok();
    web_access.restart(
        app_paths.inner().as_ref(),
        resource_dir.as_deref(),
        &all_settings.web_access,
        all_settings.terminal.daemon_enabled,
    )
}

#[tauri::command]
pub fn stop_web_access(
    settings_service: State<'_, Arc<SettingsService>>,
    web_access: State<'_, Arc<WebAccessLifecycle>>,
) -> AppResult<WebAccessStatus> {
    debug!("cmd::stop_web_access");
    web_access.stop();
    let settings = settings_service.get_settings().web_access;
    Ok(web_access.status(&settings))
}

#[tauri::command]
pub fn open_web_access(
    app: AppHandle,
    settings_service: State<'_, Arc<SettingsService>>,
) -> AppResult<()> {
    debug!("cmd::open_web_access");
    use tauri_plugin_opener::OpenerExt;

    let settings = settings_service.get_settings().web_access;
    let url = crate::services::web_access_local_url(settings.port);
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn set_web_access_password(
    settings_service: State<'_, Arc<SettingsService>>,
    password: String,
) -> AppResult<()> {
    debug!("cmd::set_web_access_password");
    let mut settings = settings_service.get_settings();
    settings.web_access.set_password(&password)?;
    settings_service.update_settings(settings)?;
    Ok(())
}
