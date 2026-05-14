use crate::models::task_binding::*;
use crate::repository::TaskBindingRepository;
use crate::utils::error::{AppError, AppResult};
use std::collections::HashMap;
use std::sync::Arc;
use tracing::debug;

/// TaskBinding 业务逻辑层
pub struct TaskBindingService {
    repo: Arc<TaskBindingRepository>,
}

impl TaskBindingService {
    pub fn new(repo: Arc<TaskBindingRepository>) -> Self {
        Self { repo }
    }

    /// 创建 TaskBinding
    pub fn create(&self, req: CreateTaskBindingRequest) -> AppResult<TaskBinding> {
        debug!("svc::create_task_binding");
        let title = req.title.trim().to_string();
        if title.is_empty() {
            return Err(AppError::from("TaskBinding title cannot be empty"));
        }

        let plan_path = clean_optional(req.plan_path);
        let normalized_plan_path = clean_optional(req.normalized_plan_path)
            .or_else(|| plan_path.as_deref().map(normalize_plan_path));

        let now = chrono::Utc::now().to_rfc3339();
        let binding = TaskBinding {
            id: uuid::Uuid::new_v4().to_string(),
            title,
            role: req.role.unwrap_or(TaskBindingRole::Task),
            parent_id: clean_optional(req.parent_id),
            plan_path,
            normalized_plan_path,
            prompt: req.prompt,
            session_id: clean_optional(req.session_id),
            resume_id: clean_optional(req.resume_id),
            pane_id: clean_optional(req.pane_id),
            tab_id: clean_optional(req.tab_id),
            todo_id: clean_optional(req.todo_id),
            project_path: req.project_path,
            workspace_name: clean_optional(req.workspace_name),
            cli_tool: clean_optional(req.cli_tool).unwrap_or_else(|| "claude".to_string()),
            status: TaskBindingStatus::Pending,
            progress: 0,
            completion_summary: None,
            exit_code: None,
            sort_order: 0,
            metadata: req.metadata,
            created_at: now.clone(),
            updated_at: now,
        };

        self.repo.insert(&binding)?;
        Ok(binding)
    }

    /// 获取 TaskBinding
    pub fn get(&self, id: &str) -> AppResult<Option<TaskBinding>> {
        Ok(self.repo.get(id)?)
    }

    /// 根据 session_id 查找
    pub fn find_by_session_id(&self, session_id: &str) -> AppResult<Option<TaskBinding>> {
        Ok(self.repo.find_by_session_id(session_id)?)
    }

    /// 更新 TaskBinding
    pub fn update(&self, id: &str, mut req: UpdateTaskBindingRequest) -> AppResult<TaskBinding> {
        debug!("svc::update_task_binding");
        if let Some(ref title) = req.title {
            if title.trim().is_empty() {
                return Err(AppError::from("TaskBinding title cannot be empty"));
            }
        }

        // 验证 progress 范围
        if let Some(progress) = req.progress {
            if !(0..=100).contains(&progress) {
                return Err(AppError::from("Progress must be between 0 and 100"));
            }
        }

        if req.normalized_plan_path.is_none() {
            req.normalized_plan_path = req.plan_path.as_deref().map(normalize_plan_path);
        }

        self.repo.update(id, &req)?;
        self.repo
            .get(id)?
            .ok_or_else(|| AppError::from(format!("TaskBinding '{}' not found", id)))
    }

    /// 删除 TaskBinding
    pub fn delete(&self, id: &str) -> AppResult<bool> {
        Ok(self.repo.delete(id)?)
    }

    /// 查询 TaskBindings
    pub fn query(&self, mut query: TaskBindingQuery) -> AppResult<TaskBindingQueryResult> {
        if query.normalized_plan_path.is_none() {
            query.normalized_plan_path = query.plan_path.as_deref().map(normalize_plan_path);
            if query.normalized_plan_path.is_some() {
                query.plan_path = None;
            }
        }
        Ok(self.repo.query(&query)?)
    }

    pub fn register_plan_leader(&self, req: RegisterPlanLeaderRequest) -> AppResult<TaskBinding> {
        let plan_path = req.plan_path.trim().to_string();
        if plan_path.is_empty() {
            return Err(AppError::from("planPath cannot be empty"));
        }
        let normalized_plan_path = normalize_plan_path(&plan_path);
        let project_path = req.project_path.trim().to_string();
        if project_path.is_empty() {
            return Err(AppError::from("projectPath cannot be empty"));
        }

        if let Some(existing) = self
            .repo
            .find_leader_by_plan(&normalized_plan_path, Some(&project_path))?
        {
            return self.update(
                &existing.id,
                UpdateTaskBindingRequest {
                    title: req.title,
                    role: Some(TaskBindingRole::Leader),
                    plan_path: Some(plan_path),
                    normalized_plan_path: Some(normalized_plan_path),
                    prompt: req.prompt,
                    session_id: req.session_id,
                    resume_id: req.resume_id,
                    pane_id: req.pane_id,
                    tab_id: req.tab_id,
                    metadata: req.metadata,
                    ..Default::default()
                },
            );
        }

        let title = req
            .title
            .unwrap_or_else(|| format!("Plan: {}", plan_file_name(&plan_path)));
        let created = self.create(CreateTaskBindingRequest {
            title,
            role: Some(TaskBindingRole::Leader),
            parent_id: None,
            plan_path: Some(plan_path),
            normalized_plan_path: Some(normalized_plan_path),
            prompt: req.prompt,
            session_id: req.session_id,
            resume_id: req.resume_id,
            pane_id: req.pane_id,
            tab_id: req.tab_id,
            todo_id: None,
            project_path,
            workspace_name: req.workspace_name,
            cli_tool: req.cli_tool.or_else(|| Some("claude".to_string())),
            metadata: req.metadata,
        })?;
        self.update(
            &created.id,
            UpdateTaskBindingRequest {
                status: Some(TaskBindingStatus::Running),
                ..Default::default()
            },
        )
    }

    pub fn register_plan_worker(&self, req: RegisterPlanWorkerRequest) -> AppResult<TaskBinding> {
        let leader = self.resolve_leader(&PlanCollaborationKey {
            leader_id: req.leader_id.clone(),
            plan_path: req.plan_path.clone(),
            normalized_plan_path: req.plan_path.as_deref().map(normalize_plan_path),
        })?;

        let plan_path = req
            .plan_path
            .or_else(|| leader.plan_path.clone())
            .ok_or_else(|| {
                AppError::from("Plan worker requires planPath or a leader with planPath")
            })?;
        let normalized_plan_path = normalize_plan_path(&plan_path);
        let cli_tool = clean_optional(req.cli_tool).unwrap_or_else(|| "codex".to_string());
        let title = req.title.unwrap_or_else(|| format!("Worker: {}", cli_tool));

        if let Some(existing) = self.repo.find_worker_for_registration(
            &leader.id,
            &req.session_id,
            req.resume_id.as_deref(),
        )? {
            return self.update(
                &existing.id,
                UpdateTaskBindingRequest {
                    title: Some(title),
                    role: Some(TaskBindingRole::Worker),
                    parent_id: Some(leader.id),
                    plan_path: Some(plan_path),
                    normalized_plan_path: Some(normalized_plan_path),
                    prompt: req.prompt,
                    session_id: Some(req.session_id),
                    resume_id: req.resume_id,
                    pane_id: req.pane_id,
                    tab_id: req.tab_id,
                    status: Some(TaskBindingStatus::Running),
                    metadata: req.metadata,
                    ..Default::default()
                },
            );
        }

        let created = self.create(CreateTaskBindingRequest {
            title,
            role: Some(TaskBindingRole::Worker),
            parent_id: Some(leader.id),
            plan_path: Some(plan_path),
            normalized_plan_path: Some(normalized_plan_path),
            prompt: req.prompt,
            session_id: Some(req.session_id),
            resume_id: req.resume_id,
            pane_id: req.pane_id,
            tab_id: req.tab_id,
            todo_id: None,
            project_path: req.project_path,
            workspace_name: req.workspace_name,
            cli_tool: Some(cli_tool),
            metadata: req.metadata,
        })?;
        self.update(
            &created.id,
            UpdateTaskBindingRequest {
                status: Some(TaskBindingStatus::Running),
                ..Default::default()
            },
        )
    }

    /// Backward-compatible wrapper for callers still using the old child name.
    pub fn register_plan_child(&self, req: RegisterPlanChildRequest) -> AppResult<TaskBinding> {
        self.register_plan_worker(req)
    }

    pub fn get_plan_collaboration(
        &self,
        key: PlanCollaborationKey,
        verbose: bool,
    ) -> AppResult<PlanCollaboration> {
        let leader = self.resolve_leader(&key)?;
        let workers = self.repo.find_workers_of(&leader.id)?;
        Ok(collaboration_from_bindings(
            leader,
            workers,
            &HashMap::new(),
            verbose,
        ))
    }

    pub fn reconcile_plan_collaboration(
        &self,
        key: PlanCollaborationKey,
        live_sessions: Vec<PlanLiveSession>,
        verbose: bool,
    ) -> AppResult<PlanCollaboration> {
        let live_map = live_sessions
            .into_iter()
            .map(|session| (session.session_id.clone(), session))
            .collect::<HashMap<_, _>>();

        let leader = self.resolve_leader(&key)?;
        let workers = self.repo.find_workers_of(&leader.id)?;

        for binding in std::iter::once(&leader).chain(workers.iter()) {
            let Some(session_id) = binding.session_id.as_deref() else {
                continue;
            };
            let live = live_map.get(session_id);
            if let Some(live) = live {
                if live.pane_id != binding.pane_id || live.tab_id != binding.tab_id {
                    self.repo.update(
                        &binding.id,
                        &UpdateTaskBindingRequest {
                            pane_id: live.pane_id.clone(),
                            tab_id: live.tab_id.clone(),
                            ..Default::default()
                        },
                    )?;
                }
                continue;
            }

            if binding.role == TaskBindingRole::Worker
                && binding.status == TaskBindingStatus::Running
            {
                self.repo.update(
                    &binding.id,
                    &UpdateTaskBindingRequest {
                        status: Some(TaskBindingStatus::Waiting),
                        ..Default::default()
                    },
                )?;
            }
        }

        let refreshed_leader = self
            .repo
            .get(&leader.id)?
            .ok_or_else(|| AppError::from("Plan leader disappeared during reconcile"))?;
        let refreshed_workers = self.repo.find_workers_of(&refreshed_leader.id)?;
        Ok(collaboration_from_bindings(
            refreshed_leader,
            refreshed_workers,
            &live_map,
            verbose,
        ))
    }

    fn resolve_leader(&self, key: &PlanCollaborationKey) -> AppResult<TaskBinding> {
        if let Some(leader_id) = key.leader_id.as_deref().filter(|id| !id.trim().is_empty()) {
            let binding = self
                .repo
                .get(leader_id)?
                .ok_or_else(|| AppError::from(format!("Plan leader '{}' not found", leader_id)))?;
            if binding.role != TaskBindingRole::Leader {
                return Err(AppError::from(format!(
                    "TaskBinding '{}' is not a plan leader",
                    leader_id
                )));
            }
            return Ok(binding);
        }

        let normalized_plan_path = key
            .normalized_plan_path
            .clone()
            .or_else(|| key.plan_path.as_deref().map(normalize_plan_path))
            .ok_or_else(|| AppError::from("leaderId or planPath is required"))?;

        self.repo
            .find_leader_by_plan(&normalized_plan_path, None)?
            .ok_or_else(|| {
                AppError::from(format!(
                    "Plan leader for '{}' not found",
                    key.plan_path.as_deref().unwrap_or(&normalized_plan_path)
                ))
            })
    }
}

fn collaboration_from_bindings(
    leader: TaskBinding,
    workers: Vec<TaskBinding>,
    live_map: &HashMap<String, PlanLiveSession>,
    verbose: bool,
) -> PlanCollaboration {
    let leader = entry_from_binding(leader, live_map, verbose);
    let workers = workers
        .into_iter()
        .map(|binding| entry_from_binding(binding, live_map, verbose))
        .collect::<Vec<_>>();
    PlanCollaboration {
        total: workers.len() as u32,
        leader,
        workers,
    }
}

fn entry_from_binding(
    binding: TaskBinding,
    live_map: &HashMap<String, PlanLiveSession>,
    verbose: bool,
) -> PlanCollaborationEntry {
    let live = binding
        .session_id
        .as_deref()
        .and_then(|session_id| live_map.get(session_id));
    let is_live = live.is_some();
    let can_relaunch =
        binding.resume_id.is_some() || binding.plan_path.is_some() || binding.prompt.is_some();
    PlanCollaborationEntry {
        id: binding.id,
        title: binding.title,
        role: binding.role,
        parent_id: binding.parent_id,
        plan_path: binding.plan_path,
        normalized_plan_path: binding.normalized_plan_path,
        project_path: binding.project_path,
        workspace_name: binding.workspace_name,
        cli_tool: binding.cli_tool,
        status: binding.status,
        progress: binding.progress,
        session_id: binding.session_id,
        resume_id: binding.resume_id,
        pane_id: binding.pane_id,
        tab_id: binding.tab_id,
        is_live,
        can_relaunch,
        live_pane_id: live.and_then(|session| session.pane_id.clone()),
        live_tab_id: live.and_then(|session| session.tab_id.clone()),
        prompt: verbose.then_some(binding.prompt).flatten(),
        completion_summary: verbose.then_some(binding.completion_summary).flatten(),
        metadata: verbose.then_some(binding.metadata).flatten(),
        created_at: binding.created_at,
        updated_at: binding.updated_at,
    }
}

fn clean_optional(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub fn normalize_plan_path(path: &str) -> String {
    let mut normalized = path.trim().replace('\\', "/");
    while normalized.contains("//") {
        normalized = normalized.replace("//", "/");
    }
    normalized = normalized.trim_end_matches('/').to_string();

    let lower = normalized.to_ascii_lowercase();
    if let Some(rest) = lower.strip_prefix("/mnt/") {
        let mut parts = rest.splitn(2, '/');
        if let (Some(drive), Some(path_rest)) = (parts.next(), parts.next()) {
            if drive.len() == 1 && drive.as_bytes()[0].is_ascii_alphabetic() {
                return format!("{}:/{}", drive, path_rest);
            }
        }
    }

    if let Some(mnt_index) = lower.find("/mnt/") {
        let rest = &lower[mnt_index + "/mnt/".len()..];
        let mut parts = rest.splitn(2, '/');
        if let (Some(drive), Some(path_rest)) = (parts.next(), parts.next()) {
            if drive.len() == 1 && drive.as_bytes()[0].is_ascii_alphabetic() {
                return format!("{}:/{}", drive, path_rest);
            }
        }
    }

    if lower.len() >= 3 && lower.as_bytes()[1] == b':' && lower.as_bytes()[2] == b'/' {
        lower
    } else {
        normalized
    }
}

fn plan_file_name(path: &str) -> String {
    path.replace('\\', "/")
        .rsplit('/')
        .next()
        .filter(|value| !value.is_empty())
        .unwrap_or("plan.md")
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repository::{Database, TaskBindingRepository};

    fn service() -> TaskBindingService {
        let db = Arc::new(Database::new_in_memory().expect("should create db"));
        TaskBindingService::new(Arc::new(TaskBindingRepository::new(db)))
    }

    #[test]
    fn test_normalize_plan_path_unifies_windows_and_wsl_drive_paths() {
        assert_eq!(
            normalize_plan_path(r"D:\repo\.claude\plans\Plan.md"),
            "d:/repo/.claude/plans/plan.md"
        );
        assert_eq!(
            normalize_plan_path("/mnt/d/repo/.claude/plans/Plan.md"),
            "d:/repo/.claude/plans/plan.md"
        );
        assert_eq!(
            normalize_plan_path(r"\\wsl.localhost\Ubuntu\mnt\d\repo\.claude\plans\Plan.md"),
            "d:/repo/.claude/plans/plan.md"
        );
    }

    #[test]
    fn test_register_leader_is_idempotent_by_plan_and_project() {
        let service = service();
        let first = service
            .register_plan_leader(RegisterPlanLeaderRequest {
                plan_path: r"D:\repo\.claude\plans\plan.md".into(),
                project_path: "D:/repo".into(),
                title: Some("First".into()),
                prompt: None,
                session_id: Some("pty-1".into()),
                resume_id: None,
                pane_id: None,
                tab_id: None,
                workspace_name: None,
                cli_tool: None,
                metadata: None,
            })
            .expect("register first");
        let second = service
            .register_plan_leader(RegisterPlanLeaderRequest {
                plan_path: "/mnt/d/repo/.claude/plans/plan.md".into(),
                project_path: "D:/repo".into(),
                title: Some("Second".into()),
                prompt: None,
                session_id: Some("pty-2".into()),
                resume_id: Some("resume-2".into()),
                pane_id: None,
                tab_id: None,
                workspace_name: None,
                cli_tool: None,
                metadata: None,
            })
            .expect("register second");

        assert_eq!(first.id, second.id);
        assert_eq!(second.title, "Second");
        assert_eq!(second.session_id.as_deref(), Some("pty-2"));
        assert_eq!(second.resume_id.as_deref(), Some("resume-2"));
    }

    #[test]
    fn test_register_worker_requires_existing_leader() {
        let service = service();
        let result = service.register_plan_worker(RegisterPlanWorkerRequest {
            leader_id: Some("missing".into()),
            plan_path: None,
            session_id: "pty-worker".into(),
            project_path: "D:/repo".into(),
            title: None,
            prompt: None,
            resume_id: None,
            pane_id: None,
            tab_id: None,
            workspace_name: None,
            cli_tool: None,
            metadata: None,
        });

        assert!(result.is_err());
    }

    #[test]
    fn test_reconcile_marks_dead_running_worker_waiting_without_clearing_pane() {
        let service = service();
        let leader = service
            .register_plan_leader(RegisterPlanLeaderRequest {
                plan_path: "D:/repo/.claude/plans/plan.md".into(),
                project_path: "D:/repo".into(),
                title: None,
                prompt: None,
                session_id: Some("pty-leader".into()),
                resume_id: None,
                pane_id: Some("pane-leader".into()),
                tab_id: None,
                workspace_name: None,
                cli_tool: None,
                metadata: None,
            })
            .expect("leader");
        let worker = service
            .register_plan_worker(RegisterPlanWorkerRequest {
                leader_id: Some(leader.id.clone()),
                plan_path: None,
                session_id: "pty-worker".into(),
                project_path: "D:/repo".into(),
                title: None,
                prompt: None,
                resume_id: None,
                pane_id: Some("pane-worker".into()),
                tab_id: Some("tab-worker".into()),
                workspace_name: None,
                cli_tool: None,
                metadata: None,
            })
            .expect("worker");

        let result = service
            .reconcile_plan_collaboration(
                PlanCollaborationKey {
                    leader_id: Some(leader.id),
                    plan_path: None,
                    normalized_plan_path: None,
                },
                Vec::new(),
                false,
            )
            .expect("reconcile");

        let reconciled_worker = result
            .workers
            .iter()
            .find(|item| item.id == worker.id)
            .expect("worker result");
        assert_eq!(reconciled_worker.status, TaskBindingStatus::Waiting);
        assert_eq!(reconciled_worker.pane_id.as_deref(), Some("pane-worker"));
        assert!(!reconciled_worker.is_live);
    }
}
