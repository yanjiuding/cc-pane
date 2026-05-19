use crate::models::plan::{Plan, PlanListItem, UpsertPlanRequest};
use crate::repository::Database;
use rusqlite::{params, OptionalExtension};
use serde_json::Value;
use std::sync::Arc;
use tracing::{error, warn};

const SELECT_FIELDS: &str = "\
    id, task_binding_id, workspace_name, project_path, session_id, plan_path, archived_path, \
    intent, tags_json, scope_json, risk, followups, recall_count, last_recalled_at, archived, \
    created_at";

const LIST_FIELDS: &str = "\
    id, workspace_name, project_path, plan_path, archived_path, intent, tags_json, scope_json, \
    risk, followups, recall_count, last_recalled_at, created_at";

pub struct PlanRepository {
    db: Arc<Database>,
}

impl PlanRepository {
    pub fn new(db: Arc<Database>) -> Self {
        Self { db }
    }

    /// Upsert by `archived_path`（同 plan 反复写入只保留一行，但允许字段更新）。
    /// 返回写入后的 plan id。
    pub fn upsert(&self, req: &UpsertPlanRequest, now_ms: i64) -> Result<i64, String> {
        let conn = self.db.connection().map_err(|e| e.to_string())?;
        let tags_json = serialize_json_array(&req.tag.tags);
        let scope_json = serialize_json_array(&req.tag.scope);

        // 先 upsert（archived_path 唯一约束触发 DO UPDATE）
        conn.execute(
            "INSERT INTO plans (
                task_binding_id, workspace_name, project_path, session_id,
                plan_path, archived_path, intent, tags_json, scope_json,
                risk, followups, created_at
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
             ON CONFLICT(archived_path) DO UPDATE SET
                task_binding_id = excluded.task_binding_id,
                workspace_name  = excluded.workspace_name,
                project_path    = excluded.project_path,
                session_id      = excluded.session_id,
                plan_path       = excluded.plan_path,
                intent          = excluded.intent,
                tags_json       = excluded.tags_json,
                scope_json      = excluded.scope_json,
                risk            = excluded.risk,
                followups       = excluded.followups",
            params![
                req.task_binding_id,
                req.workspace_name,
                req.project_path,
                req.session_id,
                req.plan_path,
                req.archived_path,
                req.tag.intent,
                tags_json,
                scope_json,
                req.tag.risk,
                req.tag.followups,
                now_ms,
            ],
        )
        .map_err(|e| {
            error!(table = "plans", path = %req.archived_path, err = %e, "SQL upsert failed");
            e.to_string()
        })?;

        // 再查回 id
        let id: i64 = conn
            .query_row(
                "SELECT id FROM plans WHERE archived_path = ?1",
                params![req.archived_path],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        Ok(id)
    }

    /// 通过 id 获取一条完整 plan。
    pub fn get(&self, id: i64) -> Result<Option<Plan>, String> {
        let conn = self.db.connection().map_err(|e| e.to_string())?;
        let sql = format!("SELECT {SELECT_FIELDS} FROM plans WHERE id = ?1");
        conn.query_row(&sql, params![id], Self::row_to_plan)
            .optional()
            .map_err(|e| e.to_string())
    }

    /// SessionStart 注入用：按 `(workspace_name OR project_path)` 取最近 N 条。
    pub fn list_recent_by_scope(
        &self,
        workspace_name: Option<&str>,
        project_path: &str,
        limit: i64,
    ) -> Result<Vec<PlanListItem>, String> {
        let conn = self.db.connection().map_err(|e| e.to_string())?;
        let sql = format!(
            "SELECT {LIST_FIELDS} FROM plans \
             WHERE archived = 0 \
               AND ((?1 IS NOT NULL AND workspace_name = ?1) \
                    OR (?1 IS NULL AND project_path = ?2)) \
             ORDER BY created_at DESC \
             LIMIT ?3"
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(
                params![workspace_name, project_path, limit],
                Self::row_to_list_item,
            )
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    /// recall skill 搜索：关键词在 intent/followups/tags_json 任一匹配，按热度排序。
    ///
    /// 安全性：
    /// - 用绑定参数避免 SQL 注入
    /// - 转义 LIKE 通配符 `%` / `_` / `\`，配合 SQL `ESCAPE '\\'`
    /// - 关键词为空 / trim 后为空 → 返回空集（不允许"匹配所有"造成无意义 bump）
    pub fn search(
        &self,
        workspace_name: Option<&str>,
        project_path: &str,
        keyword: &str,
        limit: i64,
    ) -> Result<Vec<PlanListItem>, String> {
        let trimmed = keyword.trim();
        if trimmed.is_empty() {
            return Ok(Vec::new());
        }
        let conn = self.db.connection().map_err(|e| e.to_string())?;
        let escaped = escape_like(trimmed);
        let pattern = format!("%{}%", escaped);
        let sql = format!(
            "SELECT {LIST_FIELDS} FROM plans \
             WHERE archived = 0 \
               AND ((?1 IS NOT NULL AND workspace_name = ?1) \
                    OR (?1 IS NULL AND project_path = ?2)) \
               AND (intent     LIKE ?3 ESCAPE '\\' \
                 OR followups  LIKE ?3 ESCAPE '\\' \
                 OR tags_json  LIKE ?3 ESCAPE '\\') \
             ORDER BY recall_count DESC, created_at DESC \
             LIMIT ?4"
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(
                params![workspace_name, project_path, pattern, limit],
                Self::row_to_list_item,
            )
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }

    /// 命中后递增 recall_count（同 plan + 同 session 去重）。
    ///
    /// 实现：
    /// 1. 在事务内 INSERT 到 `plan_recall_dedup`（主键 `(session_id, plan_id)`，冲突忽略），
    ///    用 SQLite 3.35+ 的 `RETURNING plan_id` 拿到**本次实际新插入的** id。
    /// 2. 仅对这些 id 执行 `recall_count = recall_count + 1`。
    ///
    /// 比"用 `first_recalled_at == now_ms` 反查 dedup 表"更严格：
    /// 即使同毫秒同 session 同 plan 被调用两次，RETURNING 只会返回第一次新增的行，
    /// 后续调用 RETURNING 为空，update 不会再加。
    pub fn bump_recall(
        &self,
        session_id: &str,
        plan_ids: &[i64],
        now_ms: i64,
    ) -> Result<usize, String> {
        if plan_ids.is_empty() {
            return Ok(0);
        }
        let mut conn = self.db.connection().map_err(|e| e.to_string())?;
        let tx = conn.transaction().map_err(|e| e.to_string())?;

        // 1) 插入 dedup（冲突忽略）；RETURNING 拿真正新增的 plan_id。
        let placeholders = plan_ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
        let insert_sql = format!(
            "INSERT INTO plan_recall_dedup (session_id, plan_id, first_recalled_at) \
             SELECT ?1, id, ?2 FROM plans WHERE id IN ({placeholders}) \
             ON CONFLICT(session_id, plan_id) DO NOTHING \
             RETURNING plan_id"
        );
        let mut insert_params: Vec<Box<dyn rusqlite::ToSql>> =
            Vec::with_capacity(2 + plan_ids.len());
        insert_params.push(Box::new(session_id.to_string()));
        insert_params.push(Box::new(now_ms));
        for id in plan_ids {
            insert_params.push(Box::new(*id));
        }
        let insert_refs: Vec<&dyn rusqlite::ToSql> =
            insert_params.iter().map(|b| b.as_ref()).collect();

        let inserted_ids: Vec<i64> = {
            let mut stmt = tx.prepare(&insert_sql).map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(insert_refs.as_slice(), |row| row.get::<_, i64>(0))
                .map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>()
                .map_err(|e| e.to_string())?
        };

        if inserted_ids.is_empty() {
            tx.commit().map_err(|e| e.to_string())?;
            return Ok(0);
        }

        // 2) 仅对真正新增的 id 做 +1
        let upd_placeholders = inserted_ids
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(", ");
        let update_sql = format!(
            "UPDATE plans \
             SET recall_count = recall_count + 1, last_recalled_at = ?1 \
             WHERE id IN ({upd_placeholders})"
        );
        let mut update_params: Vec<Box<dyn rusqlite::ToSql>> =
            Vec::with_capacity(1 + inserted_ids.len());
        update_params.push(Box::new(now_ms));
        for id in &inserted_ids {
            update_params.push(Box::new(*id));
        }
        let update_refs: Vec<&dyn rusqlite::ToSql> =
            update_params.iter().map(|b| b.as_ref()).collect();
        let updated = tx
            .execute(&update_sql, update_refs.as_slice())
            .map_err(|e| e.to_string())?;
        tx.commit().map_err(|e| e.to_string())?;
        Ok(updated)
    }

    /// 手动归档 / 恢复一条 plan。
    pub fn set_archived(&self, id: i64, archived: bool) -> Result<(), String> {
        let conn = self.db.connection().map_err(|e| e.to_string())?;
        let v = if archived { 1 } else { 0 };
        conn.execute(
            "UPDATE plans SET archived = ?1 WHERE id = ?2",
            params![v, id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    }

    fn row_to_plan(row: &rusqlite::Row) -> rusqlite::Result<Plan> {
        let archived_int: i64 = row.get(14)?;
        Ok(Plan {
            id: row.get(0)?,
            task_binding_id: row.get(1)?,
            workspace_name: row.get(2)?,
            project_path: row.get(3)?,
            session_id: row.get(4)?,
            plan_path: row.get(5)?,
            archived_path: row.get(6)?,
            intent: row.get(7)?,
            tags_json: row.get(8)?,
            scope_json: row.get(9)?,
            risk: row.get(10)?,
            followups: row.get(11)?,
            recall_count: row.get(12)?,
            last_recalled_at: row.get(13)?,
            archived: archived_int != 0,
            created_at: row.get(15)?,
        })
    }

    fn row_to_list_item(row: &rusqlite::Row) -> rusqlite::Result<PlanListItem> {
        Ok(PlanListItem {
            id: row.get(0)?,
            workspace_name: row.get(1)?,
            project_path: row.get(2)?,
            plan_path: row.get(3)?,
            archived_path: row.get(4)?,
            intent: row.get(5)?,
            tags_json: row.get(6)?,
            scope_json: row.get(7)?,
            risk: row.get(8)?,
            followups: row.get(9)?,
            recall_count: row.get(10)?,
            last_recalled_at: row.get(11)?,
            created_at: row.get(12)?,
        })
    }
}

/// 把字符串里的 SQL LIKE 通配符（`%` / `_`）和反斜杠转义。
/// 配合 `LIKE ? ESCAPE '\\'` 使用，让用户输入里的通配符按字面匹配。
fn escape_like(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '\\' | '%' | '_' => {
                out.push('\\');
                out.push(c);
            }
            _ => out.push(c),
        }
    }
    out
}

fn serialize_json_array(items: &[String]) -> Option<String> {
    if items.is_empty() {
        return None;
    }
    match serde_json::to_string(&Value::Array(
        items.iter().map(|s| Value::String(s.clone())).collect(),
    )) {
        Ok(s) => Some(s),
        Err(e) => {
            warn!(err = %e, "Failed to serialize plan tags/scope JSON");
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::plan::PlanTag;
    use std::path::PathBuf;

    fn make_db() -> Arc<Database> {
        // 内存 DB；Database::new_fallback 会跑全部 migrations
        Arc::new(Database::new_fallback().expect("fallback db"))
    }

    fn sample_req(archived_path: &str, project: &str) -> UpsertPlanRequest {
        UpsertPlanRequest {
            task_binding_id: None,
            workspace_name: Some("cc-pane".to_string()),
            project_path: project.to_string(),
            session_id: Some("sess-1".to_string()),
            plan_path: "/tmp/plan.md".to_string(),
            archived_path: archived_path.to_string(),
            tag: PlanTag {
                intent: Some("test intent".to_string()),
                tags: vec!["a".into(), "b".into()],
                scope: vec!["x".into()],
                risk: Some("low".into()),
                followups: Some("fu".into()),
            },
        }
    }

    #[test]
    fn upsert_dedup_by_archived_path() {
        let db = make_db();
        let repo = PlanRepository::new(db.clone());
        let req = sample_req("/tmp/archived/p1.md", "/proj/a");

        let id1 = repo.upsert(&req, 1000).unwrap();
        let id2 = repo.upsert(&req, 2000).unwrap();
        assert_eq!(id1, id2, "same archived_path should not create new row");

        let p = repo.get(id1).unwrap().unwrap();
        assert_eq!(p.intent.as_deref(), Some("test intent"));
        assert_eq!(p.recall_count, 0);
        assert!(!p.archived);
    }

    #[test]
    fn list_recent_prefers_workspace() {
        let db = make_db();
        let repo = PlanRepository::new(db.clone());

        let mut r1 = sample_req("/tmp/p1.md", "/proj/a");
        r1.workspace_name = Some("ws".into());
        repo.upsert(&r1, 100).unwrap();

        let mut r2 = sample_req("/tmp/p2.md", "/proj/b");
        r2.workspace_name = Some("ws".into());
        repo.upsert(&r2, 200).unwrap();

        // 同 workspace 两条都应返回
        let items = repo
            .list_recent_by_scope(Some("ws"), "/proj/a", 10)
            .unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].archived_path, "/tmp/p2.md"); // 按 created_at DESC
    }

    #[test]
    fn list_recent_falls_back_to_project_when_no_workspace() {
        let db = make_db();
        let repo = PlanRepository::new(db.clone());

        let mut r1 = sample_req("/tmp/p1.md", "/proj/a");
        r1.workspace_name = None;
        repo.upsert(&r1, 100).unwrap();
        let mut r2 = sample_req("/tmp/p2.md", "/proj/b");
        r2.workspace_name = None;
        repo.upsert(&r2, 200).unwrap();

        let items = repo.list_recent_by_scope(None, "/proj/a", 10).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].project_path, "/proj/a");
    }

    #[test]
    fn search_matches_intent_and_orders_by_recall_count() {
        let db = make_db();
        let repo = PlanRepository::new(db.clone());

        let mut r1 = sample_req("/tmp/p1.md", "/proj/a");
        r1.tag.intent = Some("hook plan db".into());
        let id1 = repo.upsert(&r1, 100).unwrap();

        let mut r2 = sample_req("/tmp/p2.md", "/proj/a");
        r2.tag.intent = Some("hook plan db".into());
        let id2 = repo.upsert(&r2, 200).unwrap();

        // p1 被多次召回（不同 session 各一次）
        repo.bump_recall("s1", &[id1], 1000).unwrap();
        repo.bump_recall("s2", &[id1], 2000).unwrap();
        repo.bump_recall("s3", &[id2], 3000).unwrap();

        let items = repo.search(Some("cc-pane"), "/proj/a", "hook", 10).unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].id, id1, "p1 has higher recall_count");
        assert_eq!(items[0].recall_count, 2);
        assert_eq!(items[1].recall_count, 1);
    }

    #[test]
    fn bump_recall_session_dedup() {
        let db = make_db();
        let repo = PlanRepository::new(db.clone());
        let req = sample_req("/tmp/p1.md", "/proj/a");
        let id = repo.upsert(&req, 100).unwrap();

        // 同 session 重复调用，只 +1 一次
        let n1 = repo.bump_recall("sess-X", &[id], 1000).unwrap();
        let n2 = repo.bump_recall("sess-X", &[id], 2000).unwrap();
        assert_eq!(n1, 1);
        assert_eq!(n2, 0);

        let p = repo.get(id).unwrap().unwrap();
        assert_eq!(p.recall_count, 1);
        assert_eq!(p.last_recalled_at, Some(1000));

        // 换个 session，应再 +1
        let n3 = repo.bump_recall("sess-Y", &[id], 3000).unwrap();
        assert_eq!(n3, 1);
        let p = repo.get(id).unwrap().unwrap();
        assert_eq!(p.recall_count, 2);
        assert_eq!(p.last_recalled_at, Some(3000));
    }

    /// 关键回归：同毫秒同 session 同 plan 重复调用 bump_recall，必须只 +1 一次。
    /// 旧实现用 `WHERE first_recalled_at == now_ms` 反查 dedup 表，会撕开去重。
    /// 新实现走事务 + INSERT RETURNING，第二次 RETURNING 为空，update 不会再加。
    #[test]
    fn bump_recall_same_millisecond_dedup() {
        let db = make_db();
        let repo = PlanRepository::new(db.clone());
        let req = sample_req("/tmp/p1.md", "/proj/a");
        let id = repo.upsert(&req, 100).unwrap();

        let now = 5_000_000i64;
        let n1 = repo.bump_recall("sess-X", &[id], now).unwrap();
        let n2 = repo.bump_recall("sess-X", &[id], now).unwrap(); // 同毫秒
        let n3 = repo.bump_recall("sess-X", &[id], now).unwrap(); // 再来一次
        assert_eq!(n1, 1);
        assert_eq!(n2, 0);
        assert_eq!(n3, 0);

        let p = repo.get(id).unwrap().unwrap();
        assert_eq!(p.recall_count, 1, "must NOT double-count on same ms");
        assert_eq!(p.last_recalled_at, Some(now));
    }

    #[test]
    fn archived_plans_excluded_from_list_and_search() {
        let db = make_db();
        let repo = PlanRepository::new(db.clone());
        let req = sample_req("/tmp/p1.md", "/proj/a");
        let id = repo.upsert(&req, 100).unwrap();

        repo.set_archived(id, true).unwrap();
        assert_eq!(
            repo.list_recent_by_scope(Some("cc-pane"), "/proj/a", 10)
                .unwrap()
                .len(),
            0
        );
        assert_eq!(
            repo.search(Some("cc-pane"), "/proj/a", "test", 10)
                .unwrap()
                .len(),
            0
        );

        // 恢复后又可见
        repo.set_archived(id, false).unwrap();
        assert_eq!(
            repo.list_recent_by_scope(Some("cc-pane"), "/proj/a", 10)
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn empty_tags_and_scope_yield_null_json() {
        let db = make_db();
        let repo = PlanRepository::new(db.clone());
        let mut req = sample_req("/tmp/p1.md", "/proj/a");
        req.tag.tags = vec![];
        req.tag.scope = vec![];
        let id = repo.upsert(&req, 100).unwrap();
        let p = repo.get(id).unwrap().unwrap();
        assert!(p.tags_json.is_none());
        assert!(p.scope_json.is_none());
    }

    /// 关键回归：keyword 含 LIKE 通配符（% / _）时应被转义为字面字符，
    /// 不能匹配 scope 内所有 plan、不能造成 recall_count 污染。
    #[test]
    fn search_escapes_like_wildcards() {
        let db = make_db();
        let repo = PlanRepository::new(db.clone());

        let mut a = sample_req("/tmp/a.md", "/proj/p");
        a.tag.intent = Some("hook plan db".into());
        repo.upsert(&a, 100).unwrap();
        let mut b = sample_req("/tmp/b.md", "/proj/p");
        b.tag.intent = Some("contains 50% discount".into()); // 真有 % 字面
        repo.upsert(&b, 200).unwrap();

        // 关键词 "%" 字面应只匹配 b（"50% discount" 含 % 字面），不该匹配 a
        let items = repo.search(Some("cc-pane"), "/proj/p", "%", 10).unwrap();
        assert_eq!(items.len(), 1);
        assert!(items[0]
            .intent
            .as_deref()
            .unwrap_or_default()
            .contains("50%"));

        // 关键词 "_" 字面应不匹配任何（两条 intent 里都没下划线）
        let items = repo.search(Some("cc-pane"), "/proj/p", "_", 10).unwrap();
        assert_eq!(items.len(), 0);
    }

    /// 关键回归：空 / 纯 trim 后空的 keyword 直接返回空集，
    /// 不允许"匹配所有"造成无意义 bump。
    #[test]
    fn search_rejects_empty_keyword() {
        let db = make_db();
        let repo = PlanRepository::new(db.clone());
        repo.upsert(&sample_req("/tmp/a.md", "/proj/p"), 100)
            .unwrap();
        assert_eq!(repo.search(None, "/proj/p", "", 10).unwrap().len(), 0);
        assert_eq!(repo.search(None, "/proj/p", "   ", 10).unwrap().len(), 0);
    }

    #[test]
    fn escape_like_replaces_wildcards() {
        assert_eq!(escape_like("ab"), "ab");
        assert_eq!(escape_like("a%b"), "a\\%b");
        assert_eq!(escape_like("a_b"), "a\\_b");
        assert_eq!(escape_like("a\\b"), "a\\\\b");
        assert_eq!(escape_like("%_\\"), "\\%\\_\\\\");
    }

    // 避免 unused import warning
    #[allow(dead_code)]
    fn _suppress() -> PathBuf {
        PathBuf::new()
    }
}
