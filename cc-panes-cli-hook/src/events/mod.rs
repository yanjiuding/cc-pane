//! cc-pane 事件子命令实现。
//!
//! 每个子命令调用 `dispatch::report(event_name)` 上报状态机；
//! 部分子命令（session-init/resume、tool-after）在上报后还会调用原有业务逻辑
//! （context 注入 / plan 归档），保持 stdout 协议。

pub mod dispatch;
