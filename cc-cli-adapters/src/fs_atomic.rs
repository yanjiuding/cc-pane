//! 加固的原子文件写入：temp + fsync + 带重试的 rename。
//!
//! 关键用户配置（`~/.claude.json`、`~/.codex/config.toml`）必须避免两类损坏：
//! 1. 写入中途崩溃/断电导致目标文件被截断为半截或 0 字节；
//! 2. Windows 上 AV/索引器瞬时持锁使 rename 失败、目标文件消失且无恢复。
//!
//! 做法：先把内容写进同目录临时文件并 `sync_all()`（数据真正落盘），再原子 rename
//! 到目标；rename 带小退避重试以吞掉瞬时锁；任何失败都清理临时文件。

use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::Duration;

use anyhow::{Context, Result};

const RENAME_RETRIES: u32 = 5;
const RENAME_BACKOFF: Duration = Duration::from_millis(40);

/// 原子写：写临时文件 → fsync → rename 到 `path`（带重试）。失败时清理临时文件。
pub fn write_atomic(path: &Path, content: impl AsRef<[u8]>) -> Result<()> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).with_context(|| {
                format!("failed to create parent directory {}", parent.display())
            })?;
        }
    }

    let temp_path = sibling_temp_path(path);
    if let Err(error) = write_and_sync(&temp_path, content.as_ref()) {
        let _ = fs::remove_file(&temp_path);
        return Err(error);
    }

    if let Err(error) = rename_with_retry(&temp_path, path) {
        let _ = fs::remove_file(&temp_path);
        return Err(error);
    }
    Ok(())
}

fn write_and_sync(temp_path: &Path, content: &[u8]) -> Result<()> {
    let mut file = File::create(temp_path)
        .with_context(|| format!("failed to create temp file {}", temp_path.display()))?;
    file.write_all(content)
        .with_context(|| format!("failed to write temp file {}", temp_path.display()))?;
    // fsync：确保数据在 rename 前真正落盘，避免断电后目标为 0 字节。
    file.sync_all()
        .with_context(|| format!("failed to fsync temp file {}", temp_path.display()))?;
    Ok(())
}

fn rename_with_retry(temp_path: &Path, path: &Path) -> Result<()> {
    let mut last_err = None;
    for attempt in 0..RENAME_RETRIES {
        match fs::rename(temp_path, path) {
            Ok(()) => return Ok(()),
            Err(error) => {
                last_err = Some(error);
                if attempt + 1 < RENAME_RETRIES {
                    std::thread::sleep(RENAME_BACKOFF);
                }
            }
        }
    }

    // Windows 上 rename 覆盖已存在文件在被持锁时可能持续失败；退回 remove+rename，
    // 同样带重试，尽量缩短「目标已删、新文件未就位」的窗口。
    #[cfg(windows)]
    {
        for attempt in 0..RENAME_RETRIES {
            match fs::remove_file(path).and_then(|_| fs::rename(temp_path, path)) {
                Ok(()) => return Ok(()),
                Err(error) => {
                    last_err = Some(error);
                    if attempt + 1 < RENAME_RETRIES {
                        std::thread::sleep(RENAME_BACKOFF);
                    }
                }
            }
        }
    }

    Err(last_err.expect("rename failed without an error"))
        .with_context(|| format!("failed to atomically replace {}", path.display()))
}

fn sibling_temp_path(path: &Path) -> PathBuf {
    let mut file_name = path
        .file_name()
        .map(|name| name.to_os_string())
        .unwrap_or_else(|| std::ffi::OsString::from("cc-panes"));
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_new_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        write_atomic(&path, "a = 1\n").unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "a = 1\n");
    }

    #[test]
    fn replaces_existing_file_and_leaves_no_temp() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.toml");
        fs::write(&path, "old\n").unwrap();

        write_atomic(&path, "new\n").unwrap();

        assert_eq!(fs::read_to_string(&path).unwrap(), "new\n");
        // 目录里除目标文件外不应残留临时文件。
        let leftovers: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|entry| entry.ok())
            .filter(|entry| entry.file_name() != std::ffi::OsStr::new("config.toml"))
            .collect();
        assert!(leftovers.is_empty(), "unexpected leftover temp files");
    }
}
