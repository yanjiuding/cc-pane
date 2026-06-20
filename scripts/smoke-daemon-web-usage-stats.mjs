export async function verifyWebUsageStatsApis({
  webBaseUrl,
  requestJson,
  requestNoContent,
  assertEquals,
  fail,
  log,
}) {
  log("verifying web usage stats APIs");

  const initial = await requestJson(webBaseUrl, "/api/usage-stats?rangeDays=7");
  assertEquals(initial.series.length, 7, "usage stats series length");
  if (typeof initial.totals?.charCount !== "number") {
    fail(`usage stats returned invalid totals: ${JSON.stringify(initial)}`);
  }
  if (!Array.isArray(initial.workspaces)) {
    fail(`usage stats returned invalid workspaces: ${JSON.stringify(initial)}`);
  }

  await requestNoContent(webBaseUrl, "/api/usage-stats/input", {
    method: "POST",
    body: JSON.stringify({
      sessionId: "missing-session",
      charCount: 123,
    }),
  });

  await requestNoContent(webBaseUrl, "/api/usage-stats/input", {
    method: "POST",
    body: JSON.stringify({
      sessionId: "missing-session",
      charCount: 0,
    }),
  });

  await requestNoContent(webBaseUrl, "/api/usage-stats/refresh", {
    method: "POST",
  });

  const filtered = await requestJson(
    webBaseUrl,
    `/api/usage-stats?rangeDays=1&workspaceFilter=${encodeURIComponent("_global")}`,
  );
  assertEquals(filtered.series.length, 1, "usage stats filtered series length");
  if (typeof filtered.byCli !== "object" || filtered.byCli == null) {
    fail(`usage stats returned invalid byCli: ${JSON.stringify(filtered)}`);
  }
}
