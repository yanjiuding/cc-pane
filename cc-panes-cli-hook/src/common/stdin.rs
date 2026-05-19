//! stdin JSON 解析
//!
//! 抽取 session_start.rs:432-441 / plan_archive.rs:27-35 的 stdin 读取。

use std::io::{self, Read};

use serde::de::DeserializeOwned;

/// 把 hook stdin 当作 JSON 解析为 `T`。
///
/// stdin 不可读 / JSON 不合法时返回 `None`，调用方决定如何降级。
pub fn read_hook_input<T: DeserializeOwned>() -> Option<T> {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).ok()?;
    serde_json::from_str(&input).ok()
}

/// 读取原始字符串 stdin（不做 JSON 解析），可用于调试 / 二次自定义解析。
pub fn read_raw_stdin() -> Option<String> {
    let mut input = String::new();
    io::stdin().read_to_string(&mut input).ok()?;
    Some(input)
}
