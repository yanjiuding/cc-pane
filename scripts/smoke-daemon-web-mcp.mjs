import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function verifyWebMcpApis({
  webBaseUrl,
  rootDir,
  requestJson,
  requestNoContent,
  assertEquals,
  fail,
  log,
}) {
  log("verifying web MCP APIs");
  const projectDir = path.join(rootDir, "mcp-project");
  const claudeDir = path.join(projectDir, ".claude");
  await mkdir(claudeDir, { recursive: true });
  await writeFile(
    path.join(claudeDir, "settings.local.json"),
    JSON.stringify({ mcpServers: {}, customField: "preserved" }),
  );

  await requestNoContent(webBaseUrl, "/api/mcp/servers", {
    method: "PUT",
    body: JSON.stringify({
      projectPath: projectDir,
      name: "context7",
      command: "npx",
      args: ["-y", "@upstash/context7-mcp"],
      env: { API_KEY: "smoke" },
    }),
  });

  const servers = await requestJson(
    webBaseUrl,
    `/api/mcp/servers?projectPath=${encodeURIComponent(projectDir)}`,
  );
  assertEquals(servers.context7.command, "npx", "project MCP command");

  const server = await requestJson(
    webBaseUrl,
    `/api/mcp/servers/context7?projectPath=${encodeURIComponent(projectDir)}`,
  );
  assertEquals(server.args.length, 2, "project MCP args length");

  const rawSettings = JSON.parse(await readFile(path.join(claudeDir, "settings.local.json"), "utf8"));
  assertEquals(rawSettings.customField, "preserved", "project MCP preserved custom field");

  const removed = await requestJson(
    webBaseUrl,
    `/api/mcp/servers?projectPath=${encodeURIComponent(projectDir)}&name=context7`,
    { method: "DELETE" },
  );
  assertEquals(removed, true, "project MCP remove result");

  await requestNoContent(webBaseUrl, "/api/shared-mcp/servers", {
    method: "PUT",
    body: JSON.stringify({
      name: "fetch",
      config: {
        command: "npx",
        args: ["-y", "mcp-proxy"],
        env: {},
        shared: true,
        port: 3131,
        bridgeMode: "mcp-proxy",
      },
    }),
  });
  let sharedConfig = await requestJson(webBaseUrl, "/api/shared-mcp/config");
  assertEquals(sharedConfig.servers.fetch.port, 3131, "shared MCP server port");

  const sharedStatus = await requestJson(webBaseUrl, "/api/shared-mcp/status");
  if (!sharedStatus.some((entry) => entry.name === "fetch" && entry.pid == null)) {
    fail(`shared MCP status missing stopped fetch server: ${JSON.stringify(sharedStatus)}`);
  }

  await requestNoContent(webBaseUrl, "/api/shared-mcp/config", {
    method: "PATCH",
    body: JSON.stringify({
      portRangeStart: 3200,
      portRangeEnd: 3299,
      healthCheckIntervalSecs: 10,
      maxRestarts: 5,
    }),
  });
  sharedConfig = await requestJson(webBaseUrl, "/api/shared-mcp/config");
  assertEquals(sharedConfig.portRangeStart, 3200, "shared MCP port range start");
  assertEquals(sharedConfig.maxRestarts, 5, "shared MCP max restarts");

  await requestNoContent(webBaseUrl, "/api/shared-mcp/servers/fetch", { method: "DELETE" });
  sharedConfig = await requestJson(webBaseUrl, "/api/shared-mcp/config");
  assertEquals(Object.keys(sharedConfig.servers).length, 0, "shared MCP removed server count");
}
