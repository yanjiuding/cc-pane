import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

async function run(command, args, cwd) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: "ignore",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
      }
    });
  });
}

export async function verifyWebWorkspaceMigrationApis({
  webBaseUrl,
  rootDir,
  requestJson,
  requestNoContent,
  assertEquals,
  fail,
  log,
}) {
  log("verifying web workspace migration APIs");

  const workspaceRoot = path.join(rootDir, "migration-workspace");
  const workspaceProject = path.join(workspaceRoot, "project-a");
  const workspaceTargetRoot = path.join(rootDir, "migration-target");
  await mkdir(workspaceProject, { recursive: true });
  await writeFile(path.join(workspaceProject, "note.txt"), "workspace migration smoke");

  const workspace = await requestJson(webBaseUrl, "/api/workspaces", {
    method: "POST",
    body: JSON.stringify({
      name: "migration-workspace",
      path: workspaceRoot,
    }),
  });
  assertEquals(workspace.name, "migration-workspace", "migration workspace create name");

  const updatedWorkspace = {
    ...workspace,
    pinned: true,
    hidden: true,
    launchProfileId: "smoke-profile",
  };
  await requestNoContent(
    webBaseUrl,
    `/api/workspaces/${encodeURIComponent(workspace.name)}`,
    {
      method: "PUT",
      body: JSON.stringify({ workspace: updatedWorkspace }),
    },
  );
  const savedWorkspace = await requestJson(
    webBaseUrl,
    `/api/workspaces/${encodeURIComponent(workspace.name)}`,
  );
  assertEquals(savedWorkspace.pinned, true, "workspace update pinned");
  assertEquals(savedWorkspace.hidden, true, "workspace update hidden");
  assertEquals(savedWorkspace.launchProfileId, "smoke-profile", "workspace update launch profile");

  const workspaceProjectEntry = await requestJson(
    webBaseUrl,
    `/api/workspaces/${encodeURIComponent(workspace.name)}/projects`,
    {
      method: "POST",
      body: JSON.stringify({ path: workspaceProject }),
    },
  );
  if (!workspaceProjectEntry.id) {
    fail(`workspace migration project create returned invalid payload: ${JSON.stringify(workspaceProjectEntry)}`);
  }

  const workspaceMigrationRequest = {
    workspaceName: workspace.name,
    targetKind: "local",
    targetRoot: workspaceTargetRoot,
  };
  const workspacePlan = await requestJson(webBaseUrl, "/api/workspace-migrations/preview", {
    method: "POST",
    body: JSON.stringify(workspaceMigrationRequest),
  });
  assertEquals(workspacePlan.items.length, 1, "workspace migration preview item count");

  const workspaceResult = await requestJson(webBaseUrl, "/api/workspace-migrations/execute", {
    method: "POST",
    body: JSON.stringify(workspaceMigrationRequest),
  });
  assertEquals(workspaceResult.status, "succeeded", "workspace migration status");
  assertEquals(
    workspaceResult.workspace.path,
    workspaceTargetRoot,
    "workspace migration updated path",
  );

  const workspaceRollback = await requestJson(
    webBaseUrl,
    `/api/workspace-migrations/${encodeURIComponent(workspace.name)}/${encodeURIComponent(workspaceResult.snapshotId)}/rollback`,
    { method: "POST" },
  );
  assertEquals(workspaceRollback.workspace.path, workspaceRoot, "workspace migration rollback path");

  const projectWorkspaceRoot = path.join(rootDir, "project-migration-workspace");
  const projectSource = path.join(projectWorkspaceRoot, "project-b");
  const projectTarget = path.join(rootDir, "project-migration-target");
  await mkdir(projectSource, { recursive: true });
  await writeFile(path.join(projectSource, "note.txt"), "project migration smoke");

  const projectWorkspace = await requestJson(webBaseUrl, "/api/workspaces", {
    method: "POST",
    body: JSON.stringify({
      name: "project-migration-workspace",
      path: projectWorkspaceRoot,
    }),
  });
  const projectEntry = await requestJson(
    webBaseUrl,
    `/api/workspaces/${encodeURIComponent(projectWorkspace.name)}/projects`,
    {
      method: "POST",
      body: JSON.stringify({ path: projectSource }),
    },
  );

  const projectMigrationRequest = {
    workspaceName: projectWorkspace.name,
    projectId: projectEntry.id,
    targetKind: "local",
    targetRoot: projectTarget,
  };
  const projectPlan = await requestJson(webBaseUrl, "/api/project-migrations/preview", {
    method: "POST",
    body: JSON.stringify(projectMigrationRequest),
  });
  assertEquals(projectPlan.projectId, projectEntry.id, "project migration preview project id");

  const projectResult = await requestJson(webBaseUrl, "/api/project-migrations/execute", {
    method: "POST",
    body: JSON.stringify(projectMigrationRequest),
  });
  assertEquals(projectResult.status, "succeeded", "project migration status");
  assertEquals(projectResult.workspace.projects[0].path, projectTarget, "project migration updated path");

  const projectRollback = await requestJson(
    webBaseUrl,
    `/api/project-migrations/${encodeURIComponent(projectWorkspace.name)}/${encodeURIComponent(projectResult.snapshotId)}/rollback`,
    { method: "POST" },
  );
  assertEquals(projectRollback.workspace.projects[0].path, projectSource, "project migration rollback path");

  const scanRoot = path.join(rootDir, "scan-root");
  const gitRepo = path.join(scanRoot, "repo-a");
  await mkdir(gitRepo, { recursive: true });
  await run("git", ["init", "-b", "main"], gitRepo);
  const scanned = await requestJson(
    webBaseUrl,
    `/api/workspace-scan?rootPath=${encodeURIComponent(scanRoot)}`,
  );
  if (!Array.isArray(scanned) || scanned.length !== 1) {
    fail(`workspace scan returned invalid payload: ${JSON.stringify(scanned)}`);
  }
  assertEquals(scanned[0].mainPath, gitRepo, "workspace scan main path");
  assertEquals(scanned[0].mainBranch, "main", "workspace scan main branch");
}
