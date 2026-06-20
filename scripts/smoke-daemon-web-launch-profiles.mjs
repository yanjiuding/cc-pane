export async function verifyWebLaunchProfileApis({
  webBaseUrl,
  requestJson,
  requestNoContent,
  assertEquals,
  fail,
  log,
}) {
  log("verifying web launch profile APIs");

  const created = await requestJson(webBaseUrl, "/api/launch-profiles", {
    method: "POST",
    body: JSON.stringify({
      name: "Codex Local",
      alias: "Codex Local",
      description: "Smoke launch profile",
      providerId: null,
      targetTools: ["codex"],
      targetRuntime: "local",
      yoloMode: true,
      mcpPolicy: {
        mode: "default",
        enabledServerIds: [],
        disabledServerIds: [],
        includeCcpanesMcp: true,
        includeSharedMcp: true,
      },
      skillPolicy: {
        mode: "core",
        enabledSkillIds: [],
        disabledSkillIds: [],
        profileSkills: [],
        includeProjectSkills: true,
        includeExternalClaudeSkills: true,
        includeExternalCodexSkills: true,
        includeExternalPluginSkills: true,
        target: "session",
      },
      isDefault: true,
    }),
  });
  if (!created.id) {
    fail(`launch profile create returned invalid payload: ${JSON.stringify(created)}`);
  }

  const profiles = await requestJson(webBaseUrl, "/api/launch-profiles");
  assertEquals(profiles.length, 1, "launch profiles length");
  assertEquals(profiles[0].name, "Codex Local", "launch profile list name");

  const fetched = await requestJson(
    webBaseUrl,
    `/api/launch-profiles/${encodeURIComponent(created.id)}`,
  );
  assertEquals(fetched.alias, "Codex Local", "launch profile fetched alias");

  const updated = await requestJson(
    webBaseUrl,
    `/api/launch-profiles/${encodeURIComponent(created.id)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        ...created,
        name: "Codex Strict",
        alias: "Codex Strict",
        isDefault: false,
      }),
    },
  );
  assertEquals(updated.name, "Codex Strict", "launch profile updated name");

  await requestNoContent(
    webBaseUrl,
    `/api/launch-profiles/${encodeURIComponent(created.id)}/default`,
    { method: "POST" },
  );

  const preview = await requestJson(webBaseUrl, "/api/launch-profiles/preview", {
    method: "POST",
    body: JSON.stringify({
      profileId: created.id,
      useSystemDefault: false,
      providerSelection: "inherit",
      cliTool: "codex",
      runtimeKind: "local",
    }),
  });
  assertEquals(preview.profileName, "Codex Strict", "launch profile preview name");
  if (!preview.mcpServers.some((server) => server.id === "ccpanes")) {
    fail(`launch profile preview missing ccpanes MCP: ${JSON.stringify(preview)}`);
  }
  if (!preview.skills.some((skill) => skill.id === "builtin:ccpanes-launch-task")) {
    fail(`launch profile preview missing builtin skill: ${JSON.stringify(preview)}`);
  }

  return created.id;
}
