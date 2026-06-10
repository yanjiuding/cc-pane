import { describe, it, expect } from "vitest";
import { pickCreateSessionResumeId } from "./terminalResume";

describe("pickCreateSessionResumeId", () => {
  it("returns the explicit resumeId from props", () => {
    expect(pickCreateSessionResumeId({ resumeId: "sess-123" })).toBe("sess-123");
  });

  it("never falls back to launch history when resumeId is absent", () => {
    // 回归断言：缺 resumeId 时必须按"新建"处理（undefined），
    // 不得按目录从 launch history 续接上次会话（commit 65c9a2f 的 bug）。
    expect(pickCreateSessionResumeId({ resumeId: undefined })).toBeUndefined();
    expect(pickCreateSessionResumeId({})).toBeUndefined();
  });
});
