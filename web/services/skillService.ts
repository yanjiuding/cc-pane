/**
 * Skill 管理服务层 — 封装所有 Skill 相关的 Tauri invoke 调用
 */
import { invoke } from "@tauri-apps/api/core";
import type { DiscoveredExternalSkill, InstalledUserSkill, SkillInfo, SkillMarketEntry, SkillSummary } from "@/types";

export const skillService = {
  /** 列出项目的所有 Skill（摘要） */
  async listSkills(projectPath: string): Promise<SkillSummary[]> {
    return invoke<SkillSummary[]>("list_skills", { projectPath });
  },

  /** 获取单个 Skill 的完整内容 */
  async getSkill(
    projectPath: string,
    name: string
  ): Promise<SkillInfo | null> {
    return invoke<SkillInfo | null>("get_skill", { projectPath, name });
  },

  /** 创建或更新 Skill */
  async saveSkill(
    projectPath: string,
    name: string,
    content: string
  ): Promise<SkillInfo> {
    return invoke<SkillInfo>("save_skill", { projectPath, name, content });
  },

  /** 删除 Skill */
  async deleteSkill(projectPath: string, name: string): Promise<boolean> {
    return invoke<boolean>("delete_skill", { projectPath, name });
  },

  /** 跨项目复制 Skill */
  async copySkill(
    sourceProject: string,
    targetProject: string,
    name: string
  ): Promise<SkillInfo> {
    return invoke<SkillInfo>("copy_skill", {
      sourceProject,
      targetProject,
      name,
    });
  },

  /** 列出 Claude / Codex / plugin 外部 Skill */
  async listExternalSkills(source?: "claude" | "codex" | "plugin"): Promise<DiscoveredExternalSkill[]> {
    return invoke<DiscoveredExternalSkill[]>("list_external_skills", {
      source: source ?? null,
    });
  },

  /** 列出官方 Skill 市场条目 */
  async listSkillMarketEntries(): Promise<SkillMarketEntry[]> {
    return invoke<SkillMarketEntry[]>("list_skill_market_entries");
  },

  /** 列出已安装的用户级 Skill */
  async listUserSkills(): Promise<InstalledUserSkill[]> {
    return invoke<InstalledUserSkill[]>("list_user_skills");
  },

  /** 从官方市场安装 Skill */
  async installMarketSkill(skillId: string): Promise<InstalledUserSkill> {
    return invoke<InstalledUserSkill>("install_market_skill", { skillId });
  },

  /** 移除用户级 Skill */
  async removeUserSkill(skillId: string): Promise<boolean> {
    return invoke<boolean>("remove_user_skill", { skillId });
  },
};
