import { describe, expect, it } from "vitest";
import { aggregatePaneStatus } from "./layoutStatus";
import type { TerminalStatusType } from "@/types";

describe("aggregatePaneStatus", () => {
  it("空数组和全 null 返回 null", () => {
    expect(aggregatePaneStatus([])).toBeNull();
    expect(aggregatePaneStatus([null, null])).toBeNull();
  });

  it("error 优先级最高", () => {
    expect(aggregatePaneStatus(["idle", "waitingInput", "error", "toolRunning"])).toBe("error");
  });

  it("waitingInput 优先于 busy 状态", () => {
    expect(aggregatePaneStatus(["toolRunning", "waitingInput", "idle"])).toBe("waitingInput");
  });

  it.each<TerminalStatusType>(["active", "thinking", "toolRunning", "compacting"])(
    "busy 状态 %s 优先于 idle/exited",
    (status) => {
      expect(aggregatePaneStatus(["idle", status, "exited"])).toBe(status);
    },
  );

  it("纯 idle/exited 返回首个非 null 状态", () => {
    expect(aggregatePaneStatus([null, "idle", "exited"])).toBe("idle");
    expect(aggregatePaneStatus([null, "exited", "idle"])).toBe("exited");
  });
});
