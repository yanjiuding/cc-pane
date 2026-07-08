//! cli-hook 公共模块
//!
//! 抽取 session_start.rs / notify.rs / plan_archive.rs 中重复的：
//! - HTTP 客户端（ureq + Bearer token + 超时）
//! - stdin JSON 解析
//! - env 读取（必填/可选 + CLI 工具与运行环境探测）
//! - stdout / 日志统一格式
//!
//! 设计原则：
//! - 现有子命令逐步迁移到 common::*，迁移完成前两份代码可共存
//! - 模块本身不做业务决策，只提供薄的工具函数
//!
//! 阶段 1 只引入 API；阶段 2 在新子命令落地时会真正消费。
//! 此处统一 #[allow(dead_code)] 抑制未使用警告。

#![allow(dead_code)]

pub mod env;
pub mod http;
pub mod orchestrator;
pub mod stdin;
