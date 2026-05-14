use crate::utils::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub const USER_SKILL_METADATA_FILE: &str = "skill.json";
pub const USER_SKILL_MARKDOWN_FILE: &str = "SKILL.md";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InstalledUserSkill {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub version: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub license: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub homepage_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_url: Option<String>,
    pub content_sha256: String,
    pub installed_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub file_path: Option<String>,
}

#[derive(Debug, Clone)]
pub struct UserSkillContent {
    pub skill: InstalledUserSkill,
    pub content: String,
}

pub struct UserSkillService {
    user_skills_dir: PathBuf,
}

impl UserSkillService {
    pub fn new(user_skills_dir: PathBuf) -> Self {
        Self { user_skills_dir }
    }

    pub fn user_skills_dir(&self) -> &Path {
        &self.user_skills_dir
    }

    pub fn validate_skill_id(id: &str) -> AppResult<()> {
        let trimmed = id.trim();
        if trimmed.is_empty() {
            return Err(AppError::from("Skill id cannot be empty"));
        }
        if trimmed.len() > 120 || trimmed.starts_with('.') || trimmed.contains("..") {
            return Err(AppError::from("Skill id is invalid"));
        }
        if !trimmed
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))
        {
            return Err(AppError::from("Skill id contains unsupported characters"));
        }
        Ok(())
    }

    pub fn skill_dir_for(root: &Path, id: &str) -> AppResult<PathBuf> {
        Self::validate_skill_id(id)?;
        Ok(root.join(id))
    }

    pub fn list_from_dir(root: &Path) -> AppResult<Vec<InstalledUserSkill>> {
        if !root.exists() {
            return Ok(Vec::new());
        }

        let mut skills = Vec::new();
        for entry in std::fs::read_dir(root)? {
            let entry = entry?;
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            let metadata_path = path.join(USER_SKILL_METADATA_FILE);
            let markdown_path = path.join(USER_SKILL_MARKDOWN_FILE);
            if !metadata_path.is_file() || !markdown_path.is_file() {
                continue;
            }
            let content = std::fs::read_to_string(&metadata_path)?;
            let mut skill: InstalledUserSkill = serde_json::from_str(&content)
                .map_err(|err| AppError::from(format!("Invalid user skill metadata: {}", err)))?;
            skill.file_path = Some(markdown_path.to_string_lossy().to_string());
            skills.push(skill);
        }

        skills.sort_by(|left, right| {
            left.name
                .to_ascii_lowercase()
                .cmp(&right.name.to_ascii_lowercase())
                .then_with(|| left.id.cmp(&right.id))
        });
        Ok(skills)
    }

    pub fn read_from_dir(root: &Path, id: &str) -> AppResult<Option<UserSkillContent>> {
        let skill_dir = Self::skill_dir_for(root, id)?;
        let metadata_path = skill_dir.join(USER_SKILL_METADATA_FILE);
        let markdown_path = skill_dir.join(USER_SKILL_MARKDOWN_FILE);
        if !metadata_path.is_file() || !markdown_path.is_file() {
            return Ok(None);
        }

        let metadata = std::fs::read_to_string(&metadata_path)?;
        let mut skill: InstalledUserSkill = serde_json::from_str(&metadata)
            .map_err(|err| AppError::from(format!("Invalid user skill metadata: {}", err)))?;
        let content = std::fs::read_to_string(&markdown_path)?;
        skill.file_path = Some(markdown_path.to_string_lossy().to_string());
        Ok(Some(UserSkillContent { skill, content }))
    }

    pub fn list_skills(&self) -> AppResult<Vec<InstalledUserSkill>> {
        Self::list_from_dir(&self.user_skills_dir)
    }

    pub fn read_skill(&self, id: &str) -> AppResult<Option<UserSkillContent>> {
        Self::read_from_dir(&self.user_skills_dir, id)
    }

    pub fn write_skill(&self, skill: &InstalledUserSkill, content: &str) -> AppResult<()> {
        let dir = Self::skill_dir_for(&self.user_skills_dir, &skill.id)?;
        std::fs::create_dir_all(&dir)?;

        let mut metadata = skill.clone();
        metadata.file_path = None;
        let metadata_json = serde_json::to_string_pretty(&metadata)
            .map_err(|err| AppError::from(format!("Failed to serialize user skill: {}", err)))?;
        std::fs::write(dir.join(USER_SKILL_METADATA_FILE), metadata_json)?;
        std::fs::write(dir.join(USER_SKILL_MARKDOWN_FILE), content)?;
        Ok(())
    }

    pub fn remove_skill(&self, id: &str) -> AppResult<bool> {
        let dir = Self::skill_dir_for(&self.user_skills_dir, id)?;
        if !dir.exists() {
            return Ok(false);
        }
        std::fs::remove_dir_all(dir)?;
        Ok(true)
    }
}
