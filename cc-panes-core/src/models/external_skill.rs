use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredExternalSkill {
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub source: ExternalSkillSource,
    pub path: PathBuf,
    pub content_sha256: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub installed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ExternalSkillSource {
    Claude,
    Codex,
    Plugin {
        #[serde(rename = "pluginId")]
        plugin_id: String,
    },
}

impl ExternalSkillSource {
    pub fn id_prefix(&self) -> String {
        match self {
            Self::Claude => "claude".to_string(),
            Self::Codex => "codex".to_string(),
            Self::Plugin { plugin_id } => format!("plugin:{}", plugin_id),
        }
    }

    pub fn resolved_source(&self) -> &'static str {
        match self {
            Self::Claude => "external_claude",
            Self::Codex => "external_codex",
            Self::Plugin { .. } => "external_plugin",
        }
    }

    pub fn matches_filter(&self, source: &str) -> bool {
        match source {
            "claude" => matches!(self, Self::Claude),
            "codex" => matches!(self, Self::Codex),
            "plugin" => matches!(self, Self::Plugin { .. }),
            _ => false,
        }
    }
}
