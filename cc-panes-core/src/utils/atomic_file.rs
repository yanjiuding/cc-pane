use std::ffi::OsStr;
use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::{fs, io};

use anyhow::{Context, Result};

/// 写临时文件并 `sync_all()`——rename 前确保数据真正落盘，避免断电后目标为 0 字节。
fn write_and_sync(temp_path: &Path, content: &[u8]) -> Result<()> {
    let mut file = File::create(temp_path)
        .with_context(|| format!("failed to create temp file {}", temp_path.display()))?;
    file.write_all(content)
        .with_context(|| format!("failed to write temp file {}", temp_path.display()))?;
    file.sync_all()
        .with_context(|| format!("failed to fsync temp file {}", temp_path.display()))?;
    Ok(())
}

pub fn write_atomic(path: &Path, content: impl AsRef<[u8]>) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create parent directory {}", parent.display()))?;
    }

    let temp_path = sibling_temp_path(path);
    if let Err(error) = write_and_sync(&temp_path, content.as_ref()) {
        let _ = fs::remove_file(&temp_path);
        return Err(error);
    }

    let result = replace_file(&temp_path, path);
    if result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }
    result
}

fn sibling_temp_path(path: &Path) -> PathBuf {
    let mut file_name = path
        .file_name()
        .unwrap_or_else(|| OsStr::new("cc-panes"))
        .to_os_string();
    file_name.push(format!(
        ".tmp-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or_default()
    ));
    path.with_file_name(file_name)
}

fn replace_file(temp_path: &Path, path: &Path) -> Result<()> {
    match fs::rename(temp_path, path) {
        Ok(()) => Ok(()),
        Err(error) => replace_file_after_rename_error(temp_path, path, error),
    }
}

#[cfg(windows)]
fn replace_file_after_rename_error(temp_path: &Path, path: &Path, error: io::Error) -> Result<()> {
    match fs::remove_file(path) {
        Ok(()) => {}
        Err(remove_error) if remove_error.kind() == io::ErrorKind::NotFound => {}
        Err(remove_error) => {
            return Err(remove_error)
                .with_context(|| format!("failed to replace existing file {}", path.display()));
        }
    }

    fs::rename(temp_path, path).with_context(|| {
        format!(
            "failed to rename temp file {} after replace error: {}",
            temp_path.display(),
            error
        )
    })
}

#[cfg(not(windows))]
fn replace_file_after_rename_error(temp_path: &Path, _path: &Path, error: io::Error) -> Result<()> {
    Err(error).with_context(|| format!("failed to rename temp file {}", temp_path.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_atomic_creates_new_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");

        write_atomic(&path, "a = 1\n").unwrap();

        assert_eq!(fs::read_to_string(path).unwrap(), "a = 1\n");
    }

    #[test]
    fn write_atomic_replaces_existing_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        fs::write(&path, "old\n").unwrap();

        write_atomic(&path, "new\n").unwrap();

        assert_eq!(fs::read_to_string(path).unwrap(), "new\n");
    }
}
