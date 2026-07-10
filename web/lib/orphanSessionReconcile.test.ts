import { describe, expect, it } from "vitest";
import type { TerminalStatusInfo } from "@/types";
import {
  DEFAULT_GRACE_MS,
  DEFAULT_MAX_KILLS_PER_SWEEP,
  selectOrphanSessions,
} from "./orphanSessionReconcile";

const NOW = 1_700_000_000_000;

function info(overrides: Partial<TerminalStatusInfo> & { sessionId: string }): TerminalStatusInfo {
  return {
    status: "idle",
    lastOutputAt: NOW - DEFAULT_GRACE_MS - 60_000,
    updatedAt: NOW - DEFAULT_GRACE_MS - 60_000,
    ...overrides,
  };
}

describe("selectOrphanSessions", () => {
  it("selects unreferenced idle sessions past the grace period", () => {
    const statuses = [info({ sessionId: "orphan" })];
    expect(selectOrphanSessions(statuses, new Set(), NOW)).toEqual(["orphan"]);
  });

  it("keeps sessions referenced by any source", () => {
    const statuses = [info({ sessionId: "referenced" })];
    expect(selectOrphanSessions(statuses, new Set(["referenced"]), NOW)).toEqual([]);
  });

  it("keeps busy, initializing and waitingInput sessions (aligned with daemon reaper)", () => {
    const statuses: TerminalStatusInfo[] = [
      info({ sessionId: "s-active", status: "active" }),
      info({ sessionId: "s-thinking", status: "thinking" }),
      info({ sessionId: "s-tool", status: "toolRunning" }),
      info({ sessionId: "s-compacting", status: "compacting" }),
      info({ sessionId: "s-init", status: "initializing" }),
      info({ sessionId: "s-waiting", status: "waitingInput" }),
    ];
    expect(selectOrphanSessions(statuses, new Set(), NOW)).toEqual([]);
  });

  it("reclaims exited sessions", () => {
    const statuses = [info({ sessionId: "gone", status: "exited" })];
    expect(selectOrphanSessions(statuses, new Set(), NOW)).toEqual(["gone"]);
  });

  it("keeps sessions with recent activity on either timestamp (grace window)", () => {
    const statuses: TerminalStatusInfo[] = [
      info({ sessionId: "fresh-output", lastOutputAt: NOW - 1000 }),
      info({ sessionId: "fresh-update", updatedAt: NOW - 1000 }),
    ];
    expect(selectOrphanSessions(statuses, new Set(), NOW)).toEqual([]);
  });

  it("returns oldest sessions first and caps the batch size", () => {
    const statuses = Array.from({ length: DEFAULT_MAX_KILLS_PER_SWEEP + 5 }, (_, i) =>
      info({
        sessionId: `s-${i}`,
        lastOutputAt: NOW - DEFAULT_GRACE_MS - (i + 1) * 60_000,
        updatedAt: NOW - DEFAULT_GRACE_MS - (i + 1) * 60_000,
      }),
    );
    const selected = selectOrphanSessions(statuses, new Set(), NOW);
    expect(selected).toHaveLength(DEFAULT_MAX_KILLS_PER_SWEEP);
    // 最老的（lastOutputAt 最小 = 下标最大）排最前
    expect(selected[0]).toBe(`s-${statuses.length - 1}`);
  });

  it("honors custom grace and cap options", () => {
    const statuses = [
      info({ sessionId: "a", lastOutputAt: NOW - 5000, updatedAt: NOW - 5000 }),
      info({ sessionId: "b", lastOutputAt: NOW - 9000, updatedAt: NOW - 9000 }),
    ];
    const selected = selectOrphanSessions(statuses, new Set(), NOW, {
      graceMs: 1000,
      maxKillsPerSweep: 1,
    });
    expect(selected).toEqual(["b"]);
  });
});
