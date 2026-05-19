use crate::models::plan::{PlanListItem, UpsertPlanRequest};
use crate::repository::PlanRepository;
use crate::utils::error::AppResult;
use std::sync::Arc;
use tracing::debug;

/// Plan-as-memory 业务逻辑层。
///
/// 与现有 `plan_service.rs`（管"列已归档 plan 文件"）的职责完全分离：
/// 此处管 db 端的 plan 标签记录、召回查询、热度统计。
pub struct PlanArchiveService {
    repo: Arc<PlanRepository>,
}

impl PlanArchiveService {
    pub fn new(repo: Arc<PlanRepository>) -> Self {
        Self { repo }
    }

    /// 写入 / 更新一条 plan 标签记录（由 /api/plan/tag 调用）。
    /// 返回 plan id。
    ///
    /// 入口处统一做：(1) PlanTag 二次 clamp（防止持本机 token 的调用绕过钩子限长）
    /// (2) workspace_name 空白归一化为 None。
    pub fn upsert_plan(&self, mut req: UpsertPlanRequest) -> AppResult<i64> {
        req.tag.clamp();
        req.workspace_name = req.workspace_name.and_then(|s| {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        });
        debug!(
            archived_path = %req.archived_path,
            project_path = %req.project_path,
            workspace = ?req.workspace_name,
            "plan_archive_service::upsert_plan"
        );
        let now_ms = chrono::Utc::now().timestamp_millis();
        let id = self.repo.upsert(&req, now_ms)?;
        Ok(id)
    }

    /// SessionStart 注入用：按 scope 取最近 N 条；不递增 recall_count。
    pub fn list_recent_for_session_start(
        &self,
        workspace_name: Option<&str>,
        project_path: &str,
        limit: i64,
    ) -> AppResult<Vec<PlanListItem>> {
        let workspace_name = normalize_workspace_name(workspace_name);
        debug!(workspace = ?workspace_name, project = %project_path, limit, "list_recent_for_session_start");
        Ok(self
            .repo
            .list_recent_by_scope(workspace_name.as_deref(), project_path, limit)?)
    }

    /// recall skill 关键词搜索；命中后**自动递增** recall_count（同 plan + 同 session 去重）。
    pub fn search_for_recall(
        &self,
        session_id: &str,
        workspace_name: Option<&str>,
        project_path: &str,
        keyword: &str,
        limit: i64,
    ) -> AppResult<Vec<PlanListItem>> {
        let workspace_name = normalize_workspace_name(workspace_name);
        debug!(session = %session_id, workspace = ?workspace_name, project = %project_path, keyword, "search_for_recall");
        let items = self
            .repo
            .search(workspace_name.as_deref(), project_path, keyword, limit)?;
        if !items.is_empty() {
            let ids: Vec<i64> = items.iter().map(|p| p.id).collect();
            let now_ms = chrono::Utc::now().timestamp_millis();
            // bump 失败不要打断召回返回（数据写失败比拿不到数据后果轻）
            if let Err(e) = self.repo.bump_recall(session_id, &ids, now_ms) {
                tracing::warn!(err = %e, "bump_recall failed (non-fatal)");
            }
        }
        Ok(items)
    }

    /// UI 手动归档 / 恢复。
    pub fn set_archived(&self, id: i64, archived: bool) -> AppResult<()> {
        debug!(id, archived, "plan_archive_service::set_archived");
        self.repo.set_archived(id, archived)?;
        Ok(())
    }
}

/// 把 `Some("")` / `Some("   ")` 归一为 `None`。
fn normalize_workspace_name(value: Option<&str>) -> Option<String> {
    value.and_then(|s| {
        let trimmed = s.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

#[cfg(test)]
mod tests {
    use super::normalize_workspace_name;

    #[test]
    fn normalize_returns_none_for_empty() {
        assert_eq!(normalize_workspace_name(None), None);
        assert_eq!(normalize_workspace_name(Some("")), None);
        assert_eq!(normalize_workspace_name(Some("   ")), None);
        assert_eq!(normalize_workspace_name(Some("\t\n")), None);
    }

    #[test]
    fn normalize_trims_and_keeps_value() {
        assert_eq!(normalize_workspace_name(Some("ws")).as_deref(), Some("ws"));
        assert_eq!(
            normalize_workspace_name(Some("  cc-pane  ")).as_deref(),
            Some("cc-pane")
        );
    }
}
