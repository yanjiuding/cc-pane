import { mkdir } from "node:fs/promises";
import path from "node:path";

export async function verifyWebMemoryApis({
  webBaseUrl,
  rootDir,
  requestJson,
  assertEquals,
  fail,
  log,
}) {
  log("verifying web memory APIs");
  const projectDir = path.join(rootDir, "memory-project");
  await mkdir(projectDir, { recursive: true });

  const memory = await requestJson(webBaseUrl, "/api/memories", {
    method: "POST",
    body: JSON.stringify({
      title: "Web Memory Smoke",
      content: "Remember the daemon web memory API",
      scope: "project",
      category: "decision",
      importance: 5,
      workspace_name: "memory-workspace",
      project_path: projectDir,
      session_id: "memory-smoke-session",
      tags: ["web", "memory"],
      source: "smoke",
    }),
  });
  if (!memory.id) {
    fail(`memory create returned invalid payload: ${JSON.stringify(memory)}`);
  }

  const listed = await requestJson(
    webBaseUrl,
    `/api/memories?scope=project&projectPath=${encodeURIComponent(projectDir)}&limit=10&offset=0`,
  );
  assertEquals(listed.total, 1, "memory list total");

  const fetched = await requestJson(webBaseUrl, `/api/memories/${encodeURIComponent(memory.id)}`);
  assertEquals(fetched.title, "Web Memory Smoke", "memory fetched title");

  const searched = await requestJson(webBaseUrl, "/api/memories/search", {
    method: "POST",
    body: JSON.stringify({
      search: "daemon web memory",
      project_path: projectDir,
      limit: 10,
    }),
  });
  assertEquals(searched.total, 1, "memory search total");

  const updated = await requestJson(webBaseUrl, `/api/memories/${encodeURIComponent(memory.id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      title: "Updated Web Memory Smoke",
      importance: 4,
    }),
  });
  assertEquals(updated, true, "memory update result");

  const stats = await requestJson(
    webBaseUrl,
    `/api/memories/stats?projectPath=${encodeURIComponent(projectDir)}`,
  );
  assertEquals(stats.total, 1, "memory stats total");
  assertEquals(stats.by_scope.project, 1, "memory stats project scope");

  const formatted = await requestJson(webBaseUrl, "/api/memories/format", {
    method: "POST",
    body: JSON.stringify({ memoryIds: [memory.id] }),
  });
  if (!formatted.includes("Updated Web Memory Smoke")) {
    fail(`memory format missing updated title: ${JSON.stringify(formatted)}`);
  }

  const context = await requestJson(webBaseUrl, "/api/memories/session-context", {
    method: "POST",
    body: JSON.stringify({
      projectPath: projectDir,
      memoryIds: [memory.id],
    }),
  });
  if (!context.includes("Updated Web Memory Smoke")) {
    fail(`memory context missing updated title: ${JSON.stringify(context)}`);
  }

  const deleted = await requestJson(webBaseUrl, `/api/memories/${encodeURIComponent(memory.id)}`, {
    method: "DELETE",
  });
  assertEquals(deleted, true, "memory delete result");
}
