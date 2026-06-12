use crate::repository::{HistoryRepository, LaunchRecord};
use std::sync::Arc;

/// 启动历史 Service - 封装对 HistoryRepository 的操作
pub struct LaunchHistoryService {
    repo: Arc<HistoryRepository>,
}

impl LaunchHistoryService {
    pub fn new(repo: Arc<HistoryRepository>) -> Self {
        Self { repo }
    }

    /// 添加启动记录，返回记录 ID
    #[allow(clippy::too_many_arguments)]
    pub fn add(
        &self,
        project_id: &str,
        project_name: &str,
        project_path: &str,
        cli_tool: &str,
        runtime_kind: &str,
        wsl_distro: Option<&str>,
        workspace_name: Option<&str>,
        workspace_path: Option<&str>,
        launch_cwd: Option<&str>,
        provider_id: Option<&str>,
        provider_selection: Option<&str>,
        launch_profile_id: Option<&str>,
        workspace_snapshot_id: Option<&str>,
    ) -> Result<i64, String> {
        self.repo.add(
            project_id,
            project_name,
            project_path,
            cli_tool,
            runtime_kind,
            wsl_distro,
            workspace_name,
            workspace_path,
            launch_cwd,
            provider_id,
            provider_selection,
            launch_profile_id,
            workspace_snapshot_id,
        )
    }

    /// 获取最近的启动记录
    pub fn list(&self, limit: usize) -> Result<Vec<LaunchRecord>, String> {
        self.repo.list(limit)
    }

    /// 同 `add`，但在写入时就把 `pty_session_id` 设上。
    /// 用于 MCP `launch_task` 由后端直接创建 PTY 的路径，避免 hook 上报前
    /// `find_by_launch_id` 拿到 `pty_session_id = NULL` 的竞态。
    #[allow(clippy::too_many_arguments)]
    pub fn add_with_pty_session(
        &self,
        project_id: &str,
        project_name: &str,
        project_path: &str,
        pty_session_id: &str,
        cli_tool: &str,
        runtime_kind: &str,
        wsl_distro: Option<&str>,
        workspace_name: Option<&str>,
        workspace_path: Option<&str>,
        launch_cwd: Option<&str>,
        provider_id: Option<&str>,
        provider_selection: Option<&str>,
        launch_profile_id: Option<&str>,
        workspace_snapshot_id: Option<&str>,
    ) -> Result<i64, String> {
        self.repo.add_with_pty_session(
            project_id,
            project_name,
            project_path,
            pty_session_id,
            cli_tool,
            runtime_kind,
            wsl_distro,
            workspace_name,
            workspace_path,
            launch_cwd,
            provider_id,
            provider_selection,
            launch_profile_id,
            workspace_snapshot_id,
        )
    }

    /// 按项目路径获取启动记录（SQL 层路径规范化过滤）
    pub fn list_by_project(
        &self,
        project_path: &str,
        limit: usize,
    ) -> Result<Vec<LaunchRecord>, String> {
        self.repo.list_by_project(project_path, limit)
    }

    /// 更新 Claude Session ID
    pub fn update_session_id(&self, id: i64, resume_session_id: &str) -> Result<(), String> {
        self.repo.update_session_id(id, resume_session_id)
    }

    /// 标记 resume id 的来源（issued / osc-title / backfill / rescue / manual）
    pub fn update_resume_source(&self, id: i64, source: &str) -> Result<(), String> {
        self.repo.update_resume_source(id, source)
    }

    /// 按 pty_session_id 写入 resume id 及来源（OSC 标题捕获等确定性通道）
    pub fn update_resume_session_with_source_by_pty(
        &self,
        pty_session_id: &str,
        resume_session_id: &str,
        source: &str,
    ) -> Result<Option<i64>, String> {
        self.repo.update_resume_session_with_source_by_pty(
            pty_session_id,
            resume_session_id,
            source,
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn update_session_started(
        &self,
        launch_id: &str,
        pty_session_id: &str,
        resume_session_id: &str,
        cli_tool: &str,
        runtime_kind: &str,
        wsl_distro: Option<&str>,
        launch_cwd: Option<&str>,
    ) -> Result<Option<i64>, String> {
        self.repo.update_session_started(
            launch_id,
            pty_session_id,
            resume_session_id,
            cli_tool,
            runtime_kind,
            wsl_distro,
            launch_cwd,
        )
    }

    /// 回填会话启动信息（upsert）：有记录则更新，无记录则创建带 pty+resume 的完整记录。
    /// 用于 GUI 经 TabBar 新建等不写 launch_history 的启动路径，使 Codex 也能 reload 恢复。
    #[allow(clippy::too_many_arguments)]
    pub fn upsert_session_started(
        &self,
        launch_id: &str,
        pty_session_id: &str,
        resume_session_id: &str,
        cli_tool: &str,
        runtime_kind: &str,
        wsl_distro: Option<&str>,
        launch_cwd: Option<&str>,
        project_path: &str,
        project_name: &str,
        workspace_path: Option<&str>,
    ) -> Result<i64, String> {
        self.repo.upsert_session_started(
            launch_id,
            pty_session_id,
            resume_session_id,
            cli_tool,
            runtime_kind,
            wsl_distro,
            launch_cwd,
            project_path,
            project_name,
            workspace_path,
        )
    }

    /// 更新最后 Prompt
    pub fn update_last_prompt(&self, id: i64, last_prompt: &str) -> Result<(), String> {
        self.repo.update_last_prompt(id, last_prompt)
    }

    pub fn update_last_prompt_by_pty_session_id(
        &self,
        pty_session_id: &str,
        last_prompt: &str,
    ) -> Result<Option<i64>, String> {
        self.repo
            .update_last_prompt_by_pty_session_id(pty_session_id, last_prompt)
    }

    /// 更新已有会话记录的时间戳，返回记录 ID（不存在则返回 None）
    pub fn touch_by_session_id(&self, resume_session_id: &str) -> Result<Option<i64>, String> {
        self.repo.touch_by_session_id(resume_session_id)
    }

    pub fn find_by_pty_session_id(
        &self,
        pty_session_id: &str,
    ) -> Result<Option<crate::repository::LaunchRecord>, String> {
        self.repo.find_by_pty_session_id(pty_session_id)
    }

    pub fn find_by_resume_session_id(
        &self,
        resume_session_id: &str,
    ) -> Result<Option<crate::repository::LaunchRecord>, String> {
        self.repo.find_by_resume_session_id(resume_session_id)
    }

    pub fn find_by_launch_id(
        &self,
        launch_id: &str,
    ) -> Result<Option<crate::repository::LaunchRecord>, String> {
        self.repo.find_by_launch_id(launch_id)
    }

    /// 删除单条启动记录
    pub fn delete(&self, id: i64) -> Result<(), String> {
        self.repo.delete_by_id(id)
    }

    /// 清空启动记录
    pub fn clear(&self) -> Result<(), String> {
        self.repo.clear()
    }
}
