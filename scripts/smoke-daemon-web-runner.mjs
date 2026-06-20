import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";

async function getListeningPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("failed to allocate runner smoke port")));
        return;
      }
      resolve({ server, port: address.port });
    });
  });
}

export async function verifyWebRunnerApis({
  webBaseUrl,
  rootDir,
  requestJson,
  requestNoContent,
  assertEquals,
  fail,
  log,
}) {
  log("verifying web runner APIs");
  const projectDir = path.join(rootDir, "runner-project");
  await mkdir(projectDir, { recursive: true });

  const profile = await requestJson(webBaseUrl, "/api/runner/profiles", {
    method: "PUT",
    body: JSON.stringify({
      projectPath: projectDir,
      workspaceName: "smoke-runner-workspace",
      name: "dev",
      command: "npm run dev",
      cwd: projectDir,
      runtimeKind: "local",
      expectedPorts: [],
      toolHint: "npm",
    }),
  });
  if (!profile.id) {
    fail(`runner profile create returned invalid payload: ${JSON.stringify(profile)}`);
  }

  const profiles = await requestJson(
    webBaseUrl,
    `/api/runner/profiles?projectPath=${encodeURIComponent(projectDir)}`,
  );
  assertEquals(profiles.length, 1, "runner profiles length");

  const fetched = await requestJson(webBaseUrl, `/api/runner/profiles/${encodeURIComponent(profile.id)}`);
  assertEquals(fetched?.command, "npm run dev", "runner fetched profile command");

  const plan = await requestJson(
    webBaseUrl,
    `/api/runner/profiles/${encodeURIComponent(profile.id)}/launch-plan`,
  );
  assertEquals(plan.suggestedActions[0], "start_direct", "runner launch plan action");

  const { server, port } = await getListeningPort();
  try {
    const conflicts = await requestJson(webBaseUrl, "/api/runner/ports/conflicts", {
      method: "POST",
      body: JSON.stringify({ ports: [port] }),
    });
    if (!conflicts.some((conflict) => conflict.port === port)) {
      fail(`runner port conflicts missing ${port}: ${JSON.stringify(conflicts)}`);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  const instance = await requestJson(webBaseUrl, "/api/runner/instances/register-implicit", {
    method: "POST",
    body: JSON.stringify({
      projectPath: projectDir,
      workspaceName: "smoke-runner-workspace",
      sessionId: "runner-smoke-session",
      rootPid: process.pid,
      runtimeKind: "local",
      command: "manual dev",
      cwd: projectDir,
    }),
  });
  if (!instance.id || instance.status !== "running") {
    fail(`runner implicit instance returned invalid payload: ${JSON.stringify(instance)}`);
  }

  const active = await requestJson(
    webBaseUrl,
    `/api/runner/instances/active?projectPath=${encodeURIComponent(projectDir)}`,
  );
  assertEquals(active.length, 1, "runner active instances length");

  await requestJson(
    webBaseUrl,
    `/api/runner/instances/${encodeURIComponent(instance.id)}/port-claims`,
    { method: "POST" },
  );

  const killedSelf = await requestJson(webBaseUrl, "/api/runner/pids/kill", {
    method: "POST",
    body: JSON.stringify({ pid: 4_294_967_000 }),
  });
  assertEquals(killedSelf, false, "runner kill missing pid result");

  await requestNoContent(
    webBaseUrl,
    `/api/runner/instances/${encodeURIComponent(instance.id)}/mark-exited`,
    {
      method: "POST",
      body: JSON.stringify({ exitCode: 0 }),
    },
  );
  const activeAfterExit = await requestJson(
    webBaseUrl,
    `/api/runner/instances/active?projectPath=${encodeURIComponent(projectDir)}`,
  );
  assertEquals(activeAfterExit.length, 0, "runner active instances after exit");

  await requestNoContent(webBaseUrl, `/api/runner/profiles/${encodeURIComponent(profile.id)}`, {
    method: "DELETE",
  });
}
