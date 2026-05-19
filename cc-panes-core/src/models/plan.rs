use serde::{Deserialize, Serialize};

/// Plan-as-memory 标签字段（5 个语义字段）。
///
/// 来源：plan 文件顶部的 `<!-- ccpanes-plan ... -->` HTML 注释，钩子
/// 用正则解析后通过 `/api/plan/tag` 端点写入。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanTag {
    pub intent: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub scope: Vec<String>,
    pub risk: Option<String>,
    pub followups: Option<String>,
}

// 字段限长常量（钩子端和服务端使用同一份；服务端在 upsert 前会做二次 clamp，
// 防止本地持 API token 的调用绕过钩子限长）。
pub const INTENT_MAX_CHARS: usize = 200;
pub const FOLLOWUPS_MAX_CHARS: usize = 300;
pub const TAG_MAX_ITEMS: usize = 8;
pub const TAG_ITEM_MAX_CHARS: usize = 40;
pub const SCOPE_MAX_ITEMS: usize = 8;
pub const SCOPE_ITEM_MAX_CHARS: usize = 80;

impl PlanTag {
    /// 应用所有字段限长 + risk 白名单。可被钩子和服务端同样调用。
    /// 不破坏 UTF-8 字符边界（按 char 截断）。
    pub fn clamp(&mut self) {
        if let Some(intent) = self.intent.take() {
            self.intent = Some(truncate_chars(&intent, INTENT_MAX_CHARS));
        }
        if let Some(followups) = self.followups.take() {
            self.followups = Some(truncate_chars(&followups, FOLLOWUPS_MAX_CHARS));
        }
        self.tags = clamp_array(
            std::mem::take(&mut self.tags),
            TAG_MAX_ITEMS,
            TAG_ITEM_MAX_CHARS,
        );
        self.scope = clamp_array(
            std::mem::take(&mut self.scope),
            SCOPE_MAX_ITEMS,
            SCOPE_ITEM_MAX_CHARS,
        );
        self.risk = self.risk.take().and_then(|s| {
            let lower = s.trim().to_ascii_lowercase();
            if matches!(lower.as_str(), "low" | "med" | "high") {
                Some(lower)
            } else {
                None
            }
        });
    }
}

fn truncate_chars(s: &str, max_chars: usize) -> String {
    if s.chars().count() <= max_chars {
        s.to_string()
    } else {
        s.chars().take(max_chars).collect()
    }
}

fn clamp_array(items: Vec<String>, max_items: usize, max_item_chars: usize) -> Vec<String> {
    items
        .into_iter()
        .take(max_items)
        .map(|s| truncate_chars(s.trim(), max_item_chars))
        .filter(|s| !s.is_empty())
        .collect()
}

/// 数据库中的一条 plan 记录（与 `plans` 表对齐）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub id: i64,
    pub task_binding_id: Option<String>,
    pub workspace_name: Option<String>,
    pub project_path: String,
    pub session_id: Option<String>,
    pub plan_path: String,
    pub archived_path: String,
    pub intent: Option<String>,
    /// 原始 JSON 文本（避免重复 parse），UI 端按需 deserialize。
    pub tags_json: Option<String>,
    pub scope_json: Option<String>,
    pub risk: Option<String>,
    pub followups: Option<String>,
    pub recall_count: i64,
    pub last_recalled_at: Option<i64>,
    pub archived: bool,
    /// unix ms
    pub created_at: i64,
}

/// 插入 / upsert 时的请求载荷。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertPlanRequest {
    pub task_binding_id: Option<String>,
    pub workspace_name: Option<String>,
    pub project_path: String,
    pub session_id: Option<String>,
    pub plan_path: String,
    pub archived_path: String,
    pub tag: PlanTag,
}

/// 列表 / 搜索接口返回的轻量条目。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanListItem {
    pub id: i64,
    pub workspace_name: Option<String>,
    pub project_path: String,
    pub plan_path: String,
    pub archived_path: String,
    pub intent: Option<String>,
    pub tags_json: Option<String>,
    pub scope_json: Option<String>,
    pub risk: Option<String>,
    pub followups: Option<String>,
    pub recall_count: i64,
    pub last_recalled_at: Option<i64>,
    pub created_at: i64,
}

impl Plan {
    pub fn to_list_item(&self) -> PlanListItem {
        PlanListItem {
            id: self.id,
            workspace_name: self.workspace_name.clone(),
            project_path: self.project_path.clone(),
            plan_path: self.plan_path.clone(),
            archived_path: self.archived_path.clone(),
            intent: self.intent.clone(),
            tags_json: self.tags_json.clone(),
            scope_json: self.scope_json.clone(),
            risk: self.risk.clone(),
            followups: self.followups.clone(),
            recall_count: self.recall_count,
            last_recalled_at: self.last_recalled_at,
            created_at: self.created_at,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clamp_truncates_intent_followups() {
        let mut tag = PlanTag {
            intent: Some("x".repeat(500)),
            followups: Some("y".repeat(800)),
            ..Default::default()
        };
        tag.clamp();
        assert_eq!(tag.intent.unwrap().chars().count(), INTENT_MAX_CHARS);
        assert_eq!(tag.followups.unwrap().chars().count(), FOLLOWUPS_MAX_CHARS);
    }

    #[test]
    fn clamp_caps_tags_and_scope_count() {
        let mut tag = PlanTag {
            tags: (0..20).map(|i| format!("tag{}", i)).collect(),
            scope: (0..20).map(|i| format!("scope{}", i)).collect(),
            ..Default::default()
        };
        tag.clamp();
        assert_eq!(tag.tags.len(), TAG_MAX_ITEMS);
        assert_eq!(tag.scope.len(), SCOPE_MAX_ITEMS);
    }

    #[test]
    fn clamp_caps_tag_item_length() {
        let mut tag = PlanTag {
            tags: vec!["x".repeat(200)],
            scope: vec!["y".repeat(200)],
            ..Default::default()
        };
        tag.clamp();
        assert_eq!(tag.tags[0].chars().count(), TAG_ITEM_MAX_CHARS);
        assert_eq!(tag.scope[0].chars().count(), SCOPE_ITEM_MAX_CHARS);
    }

    #[test]
    fn clamp_rejects_unknown_risk() {
        let mut tag = PlanTag {
            risk: Some("extreme".to_string()),
            ..Default::default()
        };
        tag.clamp();
        assert!(tag.risk.is_none());
    }

    #[test]
    fn clamp_normalizes_risk_case() {
        let mut tag = PlanTag {
            risk: Some("  HIGH  ".to_string()),
            ..Default::default()
        };
        tag.clamp();
        assert_eq!(tag.risk.as_deref(), Some("high"));
    }
}
