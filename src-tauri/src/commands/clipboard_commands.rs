use crate::utils::AppResult;

#[tauri::command]
pub async fn read_clipboard_file_paths() -> AppResult<Vec<String>> {
    tauri::async_runtime::spawn_blocking(read_clipboard_file_paths_blocking)
        .await
        .map_err(|error| format!("Failed to join clipboard file path task: {}", error))?
}

fn read_clipboard_file_paths_blocking() -> AppResult<Vec<String>> {
    let mut clipboard = match arboard::Clipboard::new() {
        Ok(clipboard) => clipboard,
        Err(arboard::Error::ClipboardNotSupported) => return Ok(Vec::new()),
        Err(error) => {
            return Err(format!("Failed to access clipboard: {}", error).into());
        }
    };

    let paths = match clipboard.get().file_list() {
        Ok(paths) => paths,
        Err(arboard::Error::ContentNotAvailable | arboard::Error::ClipboardNotSupported) => {
            return Ok(Vec::new());
        }
        Err(error) => {
            return Err(format!("Failed to read clipboard file paths: {}", error).into());
        }
    };

    Ok(paths
        .into_iter()
        .map(|path| path.to_string_lossy().into_owned())
        .filter(|path| !path.is_empty())
        .collect())
}
