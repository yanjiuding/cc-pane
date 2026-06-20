export async function verifyWebSshMachineApis({
  webBaseUrl,
  requestJson,
  requestNoContent,
  assertEquals,
  fail,
  log,
}) {
  log("verifying web ssh machine APIs");

  const machine = {
    id: "ssh-smoke-machine",
    name: "SSH Smoke Machine",
    host: "smoke.example.local",
    port: 22,
    user: "smoke",
    authMethod: "key",
    identityFile: "~/.ssh/id_smoke",
    description: "Smoke SSH machine",
    defaultPath: "~/workspace",
    tags: ["smoke", "ssh"],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };

  const created = await requestJson(webBaseUrl, "/api/ssh-machines", {
    method: "POST",
    body: JSON.stringify({
      machine,
      rememberPassword: false,
      clearStoredPassword: false,
    }),
  });
  assertEquals(created.id, machine.id, "ssh machine create id");
  assertEquals(created.authMethod, "key", "ssh machine create auth method");
  assertEquals(
    created.hasStoredPassword ?? false,
    false,
    "ssh machine create has stored password",
  );

  const listed = await requestJson(webBaseUrl, "/api/ssh-machines");
  if (!Array.isArray(listed) || listed.length !== 1) {
    fail(`ssh machine list returned invalid payload: ${JSON.stringify(listed)}`);
  }
  assertEquals(listed[0].id, machine.id, "ssh machine list id");

  const fetched = await requestJson(
    webBaseUrl,
    `/api/ssh-machines/${encodeURIComponent(machine.id)}`,
  );
  assertEquals(fetched.name, machine.name, "ssh machine fetched name");
  assertEquals(fetched.defaultPath, "~/workspace", "ssh machine fetched default path");

  const updated = await requestJson(webBaseUrl, "/api/ssh-machines", {
    method: "PUT",
    body: JSON.stringify({
      machine: {
        ...machine,
        name: "SSH Smoke Machine Updated",
        port: 2222,
        updatedAt: "2026-01-01T00:01:00Z",
      },
      rememberPassword: false,
      clearStoredPassword: false,
    }),
  });
  assertEquals(updated.name, "SSH Smoke Machine Updated", "ssh machine update name");
  assertEquals(updated.port, 2222, "ssh machine update port");

  await requestNoContent(webBaseUrl, `/api/ssh-machines/${encodeURIComponent(machine.id)}`, {
    method: "DELETE",
  });

  const afterDelete = await requestJson(webBaseUrl, "/api/ssh-machines");
  assertEquals(afterDelete.length, 0, "ssh machine list after delete");
}
