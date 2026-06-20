import { apiGet, apiJson, invokeOrApi } from "./apiClient";

export interface JournalIndex {
  activeFile: string;
  totalSessions: number;
  lastActive: string;
}

/**
 * Journal 服务 - 管理会话日志
 */
export const journalService = {
  /**
   * 添加会话摘要
   */
  async addSession(
    workspaceName: string,
    title: string,
    summary: string,
    commits: string[] = []
  ): Promise<number> {
    const body = {
      workspaceName,
      title,
      summary,
      commits,
    };
    return invokeOrApi<number>("add_journal_session", body, () =>
      apiJson<number>("/api/journal/session", "POST", body),
    );
  },

  /**
   * 获取 journal 索引信息
   */
  async getIndex(workspaceName: string): Promise<JournalIndex> {
    return invokeOrApi<JournalIndex>("get_journal_index", { workspaceName }, () =>
      apiGet<JournalIndex>("/api/journal/index", { workspaceName }),
    );
  },

  /**
   * 获取最近的 journal 内容
   */
  async getRecentJournal(workspaceName: string): Promise<string> {
    return invokeOrApi<string>("get_recent_journal", { workspaceName }, () =>
      apiGet<string>("/api/journal/recent", { workspaceName }),
    );
  },
};
