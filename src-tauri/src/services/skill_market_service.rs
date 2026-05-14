use crate::utils::{AppError, AppResult};
use cc_panes_core::services::{InstalledUserSkill, UserSkillService};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::time::Duration;
use tracing::{debug, warn};

const DEFAULT_SKILL_MARKET_INDEX_URL: &str =
    "https://raw.githubusercontent.com/wuxiran/cc-panes/main/skill-market/index.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillMarketEntry {
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
    pub content_url: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    #[serde(default)]
    pub recommended: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillMarketIndex {
    #[serde(default = "default_schema_version")]
    schema_version: u32,
    #[serde(default, alias = "skills")]
    entries: Vec<SkillMarketEntry>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
enum SkillMarketIndexPayload {
    Index(SkillMarketIndex),
    Entries(Vec<SkillMarketEntry>),
}

pub struct SkillMarketService {
    index_url: String,
    cache_path: PathBuf,
    user_skill_service: UserSkillService,
    client: reqwest::Client,
}

impl SkillMarketService {
    pub fn new(skills_dir: PathBuf, user_skills_dir: PathBuf) -> Self {
        let index_url = std::env::var("CCPANES_SKILL_MARKET_INDEX_URL")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_SKILL_MARKET_INDEX_URL.to_string());
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(15))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        Self {
            index_url,
            cache_path: skills_dir.join("market-index-cache.json"),
            user_skill_service: UserSkillService::new(user_skills_dir),
            client,
        }
    }

    pub async fn list_market_entries(&self) -> AppResult<Vec<SkillMarketEntry>> {
        match self.fetch_index().await {
            Ok(index) => {
                self.write_cache(&index)?;
                Ok(Self::sorted_entries(index.entries))
            }
            Err(error) => {
                warn!("[skill_market] Failed to fetch market index: {}", error);
                match self.read_cache() {
                    Ok(Some(index)) => Ok(Self::sorted_entries(index.entries)),
                    Ok(None) => Ok(Vec::new()),
                    Err(cache_error) => Err(cache_error),
                }
            }
        }
    }

    pub fn list_user_skills(&self) -> AppResult<Vec<InstalledUserSkill>> {
        self.user_skill_service.list_skills()
    }

    pub async fn install_market_skill(&self, skill_id: &str) -> AppResult<InstalledUserSkill> {
        UserSkillService::validate_skill_id(skill_id)?;
        let index = self.fetch_index_or_cache().await?;
        let entry = index
            .entries
            .into_iter()
            .find(|entry| entry.id == skill_id)
            .ok_or_else(|| {
                AppError::from(format!("Skill '{}' was not found in the market", skill_id))
            })?;
        Self::validate_installable_entry(&entry)?;

        let content_url = entry.content_url.as_deref().unwrap_or_default();
        let content = self
            .client
            .get(content_url)
            .send()
            .await
            .map_err(|err| AppError::from(format!("Failed to download skill: {}", err)))?
            .error_for_status()
            .map_err(|err| AppError::from(format!("Failed to download skill: {}", err)))?
            .text()
            .await
            .map_err(|err| AppError::from(format!("Failed to read skill content: {}", err)))?;
        if content.trim().is_empty() {
            return Err(AppError::from("Downloaded skill content is empty"));
        }

        let actual_sha = hex_sha256(&content);
        let expected_sha = entry.sha256.as_deref().unwrap_or_default();
        if !actual_sha.eq_ignore_ascii_case(expected_sha) {
            return Err(AppError::from(format!(
                "Skill checksum mismatch: expected {}, got {}",
                expected_sha, actual_sha
            )));
        }

        let installed = InstalledUserSkill {
            id: entry.id,
            name: entry.name,
            description: entry.description,
            category: entry.category,
            tags: entry.tags,
            version: entry.version,
            license: entry.license,
            homepage_url: entry.homepage_url,
            source_url: entry.content_url,
            content_sha256: actual_sha,
            installed_at: chrono::Utc::now().to_rfc3339(),
            file_path: None,
        };
        self.user_skill_service.write_skill(&installed, &content)?;
        self.user_skill_service
            .read_skill(&installed.id)?
            .map(|content| content.skill)
            .ok_or_else(|| AppError::from("Installed skill could not be read back"))
    }

    pub fn remove_user_skill(&self, skill_id: &str) -> AppResult<bool> {
        self.user_skill_service.remove_skill(skill_id)
    }

    async fn fetch_index_or_cache(&self) -> AppResult<SkillMarketIndex> {
        match self.fetch_index().await {
            Ok(index) => {
                self.write_cache(&index)?;
                Ok(index)
            }
            Err(error) => {
                debug!(
                    "[skill_market] Fetch failed during install, using cache: {}",
                    error
                );
                self.read_cache()?.ok_or_else(|| {
                    AppError::from(format!("Skill market index is unavailable: {}", error))
                })
            }
        }
    }

    async fn fetch_index(&self) -> AppResult<SkillMarketIndex> {
        let text = self
            .client
            .get(&self.index_url)
            .send()
            .await
            .map_err(|err| AppError::from(format!("Failed to fetch skill market index: {}", err)))?
            .error_for_status()
            .map_err(|err| AppError::from(format!("Failed to fetch skill market index: {}", err)))?
            .text()
            .await
            .map_err(|err| AppError::from(format!("Failed to read skill market index: {}", err)))?;
        Self::parse_index(&text)
    }

    fn parse_index(content: &str) -> AppResult<SkillMarketIndex> {
        let payload: SkillMarketIndexPayload = serde_json::from_str(content)
            .map_err(|err| AppError::from(format!("Invalid skill market index: {}", err)))?;
        let index = match payload {
            SkillMarketIndexPayload::Index(index) => index,
            SkillMarketIndexPayload::Entries(entries) => SkillMarketIndex {
                schema_version: default_schema_version(),
                entries,
            },
        };
        Ok(index)
    }

    fn read_cache(&self) -> AppResult<Option<SkillMarketIndex>> {
        if !self.cache_path.is_file() {
            return Ok(None);
        }
        let content = std::fs::read_to_string(&self.cache_path)?;
        Self::parse_index(&content).map(Some)
    }

    fn write_cache(&self, index: &SkillMarketIndex) -> AppResult<()> {
        if let Some(parent) = self.cache_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let content = serde_json::to_string_pretty(index).map_err(|err| {
            AppError::from(format!("Failed to serialize skill market cache: {}", err))
        })?;
        std::fs::write(&self.cache_path, content)?;
        Ok(())
    }

    fn validate_installable_entry(entry: &SkillMarketEntry) -> AppResult<()> {
        UserSkillService::validate_skill_id(&entry.id)?;
        if entry.name.trim().is_empty() {
            return Err(AppError::from("Market skill name cannot be empty"));
        }
        if entry.version.trim().is_empty() {
            return Err(AppError::from("Market skill version cannot be empty"));
        }
        for (label, value) in [
            ("license", entry.license.as_deref()),
            ("contentUrl", entry.content_url.as_deref()),
            ("sha256", entry.sha256.as_deref()),
        ] {
            if value
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .is_none()
            {
                return Err(AppError::from(format!(
                    "Market skill '{}' is missing {}",
                    entry.id, label
                )));
            }
        }
        Ok(())
    }

    fn sorted_entries(mut entries: Vec<SkillMarketEntry>) -> Vec<SkillMarketEntry> {
        entries.sort_by(|left, right| {
            right
                .recommended
                .cmp(&left.recommended)
                .then_with(|| {
                    left.category
                        .as_deref()
                        .unwrap_or_default()
                        .cmp(right.category.as_deref().unwrap_or_default())
                })
                .then_with(|| {
                    left.name
                        .to_ascii_lowercase()
                        .cmp(&right.name.to_ascii_lowercase())
                })
        });
        entries
    }
}

fn default_schema_version() -> u32 {
    1
}

fn hex_sha256(content: &str) -> String {
    let digest = Sha256::digest(content.as_bytes());
    digest.iter().map(|byte| format!("{:02x}", byte)).collect()
}
