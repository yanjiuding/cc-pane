/** Skill 完整信息 */
export interface SkillInfo {
  name: string;
  content: string;
  filePath: string;
}

/** Skill 摘要（列表展示用） */
export interface SkillSummary {
  name: string;
  preview: string;
  filePath: string;
}

export interface SkillMarketEntry {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  tags: string[];
  version: string;
  license?: string | null;
  homepageUrl?: string | null;
  contentUrl?: string | null;
  sha256?: string | null;
  recommended: boolean;
}

export interface InstalledUserSkill {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  tags: string[];
  version: string;
  license?: string | null;
  homepageUrl?: string | null;
  sourceUrl?: string | null;
  contentSha256: string;
  installedAt: string;
  filePath?: string | null;
}

export type ExternalSkillSource =
  | { kind: "claude" }
  | { kind: "codex" }
  | { kind: "plugin"; pluginId: string };

export interface DiscoveredExternalSkill {
  id: string;
  name: string;
  description?: string | null;
  source: ExternalSkillSource;
  path: string;
  contentSha256: string;
  installedAt?: string | null;
}
