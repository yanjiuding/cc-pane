import { mkdir } from "node:fs/promises";
import path from "node:path";

export async function verifyWebLocalHistoryApis({
  webBaseUrl,
  rootDir,
  requestJson,
  requestNoContent,
  assertEquals,
  fail,
  log,
}) {
  log("verifying web local history APIs");
  const projectDir = path.join(rootDir, "local-history-project");
  await mkdir(projectDir, { recursive: true });

  await requestNoContent(webBaseUrl, "/api/local-history/init", {
    method: "POST",
    body: JSON.stringify({ projectPath: projectDir }),
  });

  const config = await requestJson(
    webBaseUrl,
    `/api/local-history/config?projectPath=${encodeURIComponent(projectDir)}`,
  );
  assertEquals(config.enabled, true, "local history config enabled");

  await requestNoContent(webBaseUrl, "/api/local-history/config", {
    method: "PUT",
    body: JSON.stringify({
      projectPath: projectDir,
      config: {
        ...config,
        enabled: false,
        ignorePatterns: ["tmp/**"],
        maxVersionsPerFile: 9,
      },
    }),
  });
  const updatedConfig = await requestJson(
    webBaseUrl,
    `/api/local-history/config?projectPath=${encodeURIComponent(projectDir)}`,
  );
  assertEquals(updatedConfig.enabled, false, "local history updated enabled");
  assertEquals(updatedConfig.maxVersionsPerFile, 9, "local history updated max versions");

  await requestNoContent(webBaseUrl, "/api/local-history/labels", {
    method: "PUT",
    body: JSON.stringify({
      projectPath: projectDir,
      label: {
        id: "manual-smoke",
        name: "Manual Smoke",
        labelType: "manual",
        source: "user",
        timestamp: "2026-06-20T00:00:00Z",
        fileSnapshots: [],
        branch: "",
      },
    }),
  });
  let labels = await requestJson(
    webBaseUrl,
    `/api/local-history/labels?projectPath=${encodeURIComponent(projectDir)}`,
  );
  assertEquals(labels.length, 1, "local history manual labels length");

  const restored = await requestJson(webBaseUrl, "/api/local-history/labels/restore", {
    method: "POST",
    body: JSON.stringify({ projectPath: projectDir, labelId: "manual-smoke" }),
  });
  assertEquals(restored.length, 0, "local history empty label restore");

  const autoLabelId = await requestJson(webBaseUrl, "/api/local-history/labels/auto", {
    method: "POST",
    body: JSON.stringify({ projectPath: projectDir, name: "Auto Smoke", source: "build" }),
  });
  if (typeof autoLabelId !== "string" || autoLabelId.length === 0) {
    fail(`local history auto label returned invalid payload: ${JSON.stringify(autoLabelId)}`);
  }
  labels = await requestJson(
    webBaseUrl,
    `/api/local-history/labels?projectPath=${encodeURIComponent(projectDir)}`,
  );
  assertEquals(labels.length, 2, "local history labels after auto");

  const versions = await requestJson(
    webBaseUrl,
    `/api/local-history/files/versions?projectPath=${encodeURIComponent(projectDir)}&filePath=src%2Fmain.rs`,
  );
  assertEquals(versions.length, 0, "local history empty file versions");

  const recent = await requestJson(
    webBaseUrl,
    `/api/local-history/recent-changes?projectPath=${encodeURIComponent(projectDir)}&limit=5`,
  );
  assertEquals(recent.length, 0, "local history recent changes");

  const dirChanges = await requestJson(
    webBaseUrl,
    `/api/local-history/directory-changes?projectPath=${encodeURIComponent(projectDir)}&dirPath=src`,
  );
  assertEquals(dirChanges.length, 0, "local history directory changes");

  const deleted = await requestJson(
    webBaseUrl,
    `/api/local-history/deleted-files?projectPath=${encodeURIComponent(projectDir)}`,
  );
  assertEquals(deleted.length, 0, "local history deleted files");

  const branch = await requestJson(
    webBaseUrl,
    `/api/local-history/current-branch?projectPath=${encodeURIComponent(projectDir)}`,
  );
  assertEquals(branch, "", "local history non-git current branch");

  const fileBranches = await requestJson(
    webBaseUrl,
    `/api/local-history/file-branches?projectPath=${encodeURIComponent(projectDir)}&filePath=src%2Fmain.rs`,
  );
  assertEquals(fileBranches.length, 0, "local history file branches");

  const branchVersions = await requestJson(
    webBaseUrl,
    `/api/local-history/file-versions-by-branch?projectPath=${encodeURIComponent(projectDir)}&filePath=src%2Fmain.rs&branch=main`,
  );
  assertEquals(branchVersions.length, 0, "local history file versions by branch");

  const worktreeChanges = await requestJson(
    webBaseUrl,
    `/api/local-history/worktree-recent-changes?projectPath=${encodeURIComponent(projectDir)}&limit=5`,
  );
  assertEquals(worktreeChanges.length, 0, "local history worktree recent changes");

  const compressed = await requestJson(webBaseUrl, "/api/local-history/compress", {
    method: "POST",
    body: JSON.stringify({ projectPath: projectDir }),
  });
  assertEquals(compressed, 0, "local history compressed count");

  await requestNoContent(
    webBaseUrl,
    `/api/local-history/labels?projectPath=${encodeURIComponent(projectDir)}&labelId=manual-smoke`,
    { method: "DELETE" },
  );
  await requestNoContent(webBaseUrl, "/api/local-history/stop", {
    method: "POST",
    body: JSON.stringify({ projectPath: projectDir }),
  });
  await requestNoContent(webBaseUrl, "/api/local-history/cleanup", {
    method: "POST",
    body: JSON.stringify({ projectPath: projectDir }),
  });
}
