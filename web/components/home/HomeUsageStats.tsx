import { useEffect, useMemo } from "react";
import { BarChart3, RefreshCw } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useUsageStatsStore, useWorkspacesStore } from "@/stores";
import { waitForTauri } from "@/utils";
import type { UsageTotals } from "@/types/usageStats";

const RANGE_OPTIONS = [7, 30, 90] as const;
const ALL_WORKSPACES = "__all__";

function formatNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

function tokenTotal(totals: UsageTotals | undefined): number {
  if (!totals) return 0;
  return (
    totals.tokenInput
    + totals.tokenOutput
    + totals.tokenCacheRead
    + totals.tokenCacheCreation
  );
}

export default function HomeUsageStats() {
  const {
    rangeDays,
    workspaceFilter,
    data,
    loading,
    refreshing,
    error,
    load,
    refresh,
    setRangeDays,
    setWorkspaceFilter,
  } = useUsageStatsStore();
  const workspaces = useWorkspacesStore((state) => state.workspaces);
  const loadWorkspaces = useWorkspacesStore((state) => state.load);

  useEffect(() => {
    let cancelled = false;
    waitForTauri().then(async (ready) => {
      if (cancelled || !ready) return;
      await load().catch(() => undefined);
      if (workspaces.length === 0) {
        await loadWorkspaces().catch(() => undefined);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [load, loadWorkspaces, workspaces.length]);

  const workspaceOptions = useMemo(() => {
    const names = new Set<string>();
    for (const workspace of workspaces) names.add(workspace.name);
    for (const workspace of data?.workspaces ?? []) names.add(workspace);
    return [...names].sort((a, b) => {
      if (a === "_global") return -1;
      if (b === "_global") return 1;
      return a.localeCompare(b);
    });
  }, [data?.workspaces, workspaces]);

  const chartData = useMemo(() => {
    return (data?.series ?? []).map((point) => {
      const claudeTokens = point.claudeTokensIn
        + point.claudeTokensOut
        + point.claudeCacheRead
        + point.claudeCacheCreation;
      const codexTokens = point.codexTokensIn
        + point.codexTokensOut
        + point.codexCacheRead
        + point.codexCacheCreation;
      return {
        ...point,
        chars: point.claudeChars + point.codexChars + point.unknownChars,
        claudeTokens,
        codexTokens,
      };
    });
  }, [data?.series]);

  const totals = data?.totals;
  const claudeTokens = tokenTotal(data?.byCli.claude);
  const codexTokens = tokenTotal(data?.byCli.codex);
  const cacheTokens = (totals?.tokenCacheRead ?? 0) + (totals?.tokenCacheCreation ?? 0);

  return (
    <section>
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4" style={{ color: "var(--app-accent)" }} />
          <h3
            className="text-sm font-semibold"
            style={{ color: "var(--app-text-primary)" }}
          >
            Usage Trends
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="h-8 rounded-lg border px-2 text-xs outline-none"
            style={{
              background: "var(--app-home-surface)",
              borderColor: "var(--app-home-border)",
              color: "var(--app-text-primary)",
            }}
            value={workspaceFilter ?? ALL_WORKSPACES}
            onChange={(event) => {
              const value = event.target.value;
              void setWorkspaceFilter(value === ALL_WORKSPACES ? null : value);
            }}
          >
            <option value={ALL_WORKSPACES}>All workspaces</option>
            {workspaceOptions.map((name) => (
              <option key={name} value={name}>
                {name === "_global" ? "Unmatched sessions" : name}
              </option>
            ))}
          </select>
          <div
            className="inline-flex h-8 overflow-hidden rounded-lg border"
            style={{ borderColor: "var(--app-home-border)" }}
          >
            {RANGE_OPTIONS.map((range) => (
              <button
                key={range}
                className="px-3 text-xs transition-colors"
                style={{
                  background: rangeDays === range
                    ? "var(--app-accent)"
                    : "var(--app-home-surface)",
                  color: rangeDays === range
                    ? "var(--primary-foreground)"
                    : "var(--app-text-secondary)",
                }}
                onClick={() => void setRangeDays(range)}
              >
                {range}d
              </button>
            ))}
          </div>
          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors hover:bg-[var(--app-home-surface-hover)]"
            style={{
              borderColor: "var(--app-home-border)",
              color: "var(--app-text-secondary)",
            }}
            onClick={() => void refresh()}
            disabled={refreshing}
            title="Refresh usage stats"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--app-home-border)] bg-[var(--app-home-surface)] p-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Input chars" value={formatNumber(totals?.charCount ?? 0)} />
          <Metric label="Claude tokens" value={formatNumber(claudeTokens)} />
          <Metric label="Codex tokens" value={formatNumber(codexTokens)} />
          <Metric label="Cache tokens" value={formatNumber(cacheTokens)} />
        </div>

        <div className="mt-4 h-[280px] min-w-0">
          {error ? (
            <div
              className="flex h-full items-center justify-center text-sm"
              style={{ color: "var(--destructive)" }}
            >
              {error}
            </div>
          ) : loading && !data ? (
            <div
              className="flex h-full items-center justify-center text-sm"
              style={{ color: "var(--app-text-tertiary)" }}
            >
              Loading usage stats...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--app-home-row-border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "var(--app-text-tertiary)", fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "var(--app-home-row-border)" }}
                />
                <YAxis
                  yAxisId="chars"
                  tick={{ fill: "var(--app-text-tertiary)", fontSize: 11 }}
                  tickFormatter={formatNumber}
                  width={56}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="tokens"
                  orientation="right"
                  tick={{ fill: "var(--app-text-tertiary)", fontSize: 11 }}
                  tickFormatter={formatNumber}
                  width={64}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value: unknown, name: string) => [
                    formatNumber(Number(value) || 0),
                    name,
                  ]}
                  contentStyle={{
                    background: "var(--app-home-surface)",
                    border: "1px solid var(--app-home-border)",
                    borderRadius: 8,
                    color: "var(--app-text-primary)",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  yAxisId="chars"
                  type="monotone"
                  dataKey="chars"
                  name="Chars"
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  yAxisId="tokens"
                  type="monotone"
                  dataKey="claudeTokens"
                  name="Claude tokens"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  yAxisId="tokens"
                  type="monotone"
                  dataKey="codexTokens"
                  name="Codex tokens"
                  stroke="var(--chart-3)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-b border-[var(--app-home-row-border)] pb-2">
      <div
        className="truncate text-[11px] uppercase tracking-normal"
        style={{ color: "var(--app-text-tertiary)" }}
      >
        {label}
      </div>
      <div
        className="mt-1 truncate text-lg font-semibold"
        style={{ color: "var(--app-text-primary)" }}
      >
        {value}
      </div>
    </div>
  );
}
