use crate::ccchan_service::{clamp_position_to_visible, CCChanService, CCChanWindowMode, PetMeta};
use crate::models::settings::CCChanSettings;
use crate::services::TerminalService;
use crate::utils::{AppError, AppResult};
use std::sync::Arc;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, State, WebviewWindow};
use tracing::debug;

#[tauri::command]
pub async fn show_ccchan(app: AppHandle) -> AppResult<()> {
    debug!("cmd::show_ccchan");
    let service = app
        .try_state::<Arc<CCChanService>>()
        .ok_or_else(|| AppError::from("CCChanService is not registered"))?;
    service.show_window(&app)?;
    service.set_window_visible(true)
}

#[tauri::command]
pub async fn hide_ccchan(app: AppHandle) -> AppResult<()> {
    debug!("cmd::hide_ccchan");
    let service = app
        .try_state::<Arc<CCChanService>>()
        .ok_or_else(|| AppError::from("CCChanService is not registered"))?;
    service.hide_window(&app)?;
    service.set_window_visible(false)
}

fn resize_ccchan_window(window: &WebviewWindow, mode: CCChanWindowMode) -> AppResult<()> {
    let service = window
        .app_handle()
        .try_state::<Arc<CCChanService>>()
        .ok_or_else(|| AppError::from("CCChanService is not registered"))?;
    let (width, height) = service.window_size(mode);
    window
        .set_size(LogicalSize::new(width, height))
        .map_err(|error| AppError::from(error.to_string()))
}

#[tauri::command]
pub async fn resize_ccchan_for_chat(window: WebviewWindow, expanded: bool) -> AppResult<()> {
    debug!(expanded, "cmd::resize_ccchan_for_chat");
    let mode = if expanded {
        CCChanWindowMode::Chat
    } else {
        CCChanWindowMode::Collapsed
    };
    resize_ccchan_window(&window, mode)
}

#[tauri::command]
pub async fn resize_ccchan_for_menu(window: WebviewWindow, expanded: bool) -> AppResult<()> {
    debug!(expanded, "cmd::resize_ccchan_for_menu");
    let mode = if expanded {
        CCChanWindowMode::Menu
    } else {
        CCChanWindowMode::Collapsed
    };
    resize_ccchan_window(&window, mode)
}

#[tauri::command]
pub async fn resize_ccchan_for_bubble(window: WebviewWindow, expanded: bool) -> AppResult<()> {
    debug!(expanded, "cmd::resize_ccchan_for_bubble");
    let mode = if expanded {
        CCChanWindowMode::Bubble
    } else {
        CCChanWindowMode::Collapsed
    };
    resize_ccchan_window(&window, mode)
}

#[tauri::command]
pub async fn move_ccchan_window(
    window: WebviewWindow,
    x: f64,
    y: f64,
    persist: Option<bool>,
) -> AppResult<()> {
    debug!(x, y, persist, "cmd::move_ccchan_window");
    let pet_size = window
        .app_handle()
        .try_state::<Arc<CCChanService>>()
        .map(|service| service.pet_size())
        .unwrap_or(120.0);
    let (cx, cy) = clamp_position_to_visible(&window, x, y, pet_size);
    window
        .set_position(LogicalPosition::new(cx, cy))
        .map_err(|error| AppError::from(error.to_string()))?;
    if persist.unwrap_or(true) {
        if let Some(service) = window.app_handle().try_state::<Arc<CCChanService>>() {
            service.save_window_position(cx, cy)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn start_ccchan_chat(
    app: AppHandle,
    terminal_service: State<'_, Arc<TerminalService>>,
    ai_engine: String,
) -> AppResult<String> {
    debug!(ai_engine = %ai_engine, "cmd::start_ccchan_chat");
    let service = app
        .try_state::<Arc<CCChanService>>()
        .ok_or_else(|| AppError::from("CCChanService is not registered"))?
        .inner()
        .clone();
    let terminal_service = terminal_service.inner().clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        service.start_chat(terminal_service, ai_engine)
    })
    .await
    .map_err(|error| AppError::from(error.to_string()))?;
    result
}

#[tauri::command]
pub async fn send_to_ccchan(
    service: State<'_, Arc<CCChanService>>,
    terminal_service: State<'_, Arc<TerminalService>>,
    session_id: String,
    text: String,
) -> AppResult<()> {
    debug!(session_id = %session_id, "cmd::send_to_ccchan");
    let service = service.inner().clone();
    let terminal_service = terminal_service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        service.send_to_chat(terminal_service, &session_id, &text)
    })
    .await
    .map_err(|error| AppError::from(error.to_string()))?
}

#[tauri::command]
pub async fn stop_ccchan_chat(
    app: AppHandle,
    terminal_service: State<'_, Arc<TerminalService>>,
    session_id: String,
) -> AppResult<()> {
    debug!(session_id = %session_id, "cmd::stop_ccchan_chat");
    let service = app
        .try_state::<Arc<CCChanService>>()
        .ok_or_else(|| AppError::from("CCChanService is not registered"))?
        .inner()
        .clone();
    let terminal_service = terminal_service.inner().clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        service.stop_chat(terminal_service, &session_id)
    })
    .await
    .map_err(|error| AppError::from(error.to_string()))?;
    result
}

#[tauri::command]
pub fn is_ccchan_chat_session_alive(
    app: AppHandle,
    terminal_service: State<'_, Arc<TerminalService>>,
    session_id: String,
) -> AppResult<bool> {
    debug!(session_id = %session_id, "cmd::is_ccchan_chat_session_alive");
    let service = app
        .try_state::<Arc<CCChanService>>()
        .ok_or_else(|| AppError::from("CCChanService is not registered"))?
        .inner()
        .clone();
    service.is_chat_session_alive(terminal_service.inner().clone(), &session_id)
}

#[tauri::command]
pub fn get_ccchan_pets(app: AppHandle) -> AppResult<Vec<PetMeta>> {
    debug!("cmd::get_ccchan_pets");
    let service = app
        .try_state::<Arc<CCChanService>>()
        .ok_or_else(|| AppError::from("CCChanService is not registered"))?;
    service.get_pets(&app)
}

#[tauri::command]
pub fn get_ccchan_settings(service: State<'_, Arc<CCChanService>>) -> AppResult<CCChanSettings> {
    debug!("cmd::get_ccchan_settings");
    Ok(service.settings())
}

#[tauri::command]
pub fn save_ccchan_settings(
    service: State<'_, Arc<CCChanService>>,
    settings: CCChanSettings,
) -> AppResult<()> {
    debug!("cmd::save_ccchan_settings");
    service.save_settings(settings)
}

#[tauri::command]
pub fn get_ccchan_pets_dir(service: State<'_, Arc<CCChanService>>) -> AppResult<String> {
    debug!("cmd::get_ccchan_pets_dir");
    Ok(service.user_pets_dir().to_string_lossy().to_string())
}

#[tauri::command]
pub fn open_ccchan_pets_dir(
    app: AppHandle,
    service: State<'_, Arc<CCChanService>>,
) -> AppResult<()> {
    debug!("cmd::open_ccchan_pets_dir");
    use tauri_plugin_opener::OpenerExt;
    let dir = service.ensure_user_pets_dir_scaffold()?;
    app.opener()
        .open_path(dir.to_string_lossy().as_ref(), None::<&str>)
        .map_err(|e| e.to_string())?;
    Ok(())
}
