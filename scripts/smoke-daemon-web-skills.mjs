import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export async function verifyWebSkillsApis({
  webBaseUrl,
  rootDir,
  requestJson,
  requestNoContent,
  assertEquals,
  fail,
  log,
}) {
  log("verifying web skills APIs");
  const projectDir = path.join(rootDir, "skills-project");
  const targetDir = path.join(rootDir, "skills-target");
  await mkdir(projectDir, { recursive: true });
  await mkdir(targetDir, { recursive: true });

  const saved = await requestJson(webBaseUrl, "/api/skills", {
    method: "PUT",
    body: JSON.stringify({
      projectPath: projectDir,
      name: "make-component",
      content: "# Make Component\n\nBuild a component.",
    }),
  });
  assertEquals(saved.name, "make-component", "skills saved name");

  const skills = await requestJson(
    webBaseUrl,
    `/api/skills?projectPath=${encodeURIComponent(projectDir)}`,
  );
  assertEquals(skills.length, 1, "skills list length");
  assertEquals(skills[0].name, "make-component", "skills list name");

  const fetched = await requestJson(
    webBaseUrl,
    `/api/skills/make-component?projectPath=${encodeURIComponent(projectDir)}`,
  );
  assertEquals(fetched.content, "# Make Component\n\nBuild a component.", "skills fetched content");

  const copied = await requestJson(webBaseUrl, "/api/skills/copy", {
    method: "POST",
    body: JSON.stringify({
      sourceProject: projectDir,
      targetProject: targetDir,
      name: "make-component",
    }),
  });
  assertEquals(copied.name, "make-component", "skills copied name");

  const invalidResponse = await fetch(`${webBaseUrl}/api/skills`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      projectPath: projectDir,
      name: "../escape",
      content: "bad",
    }),
  });
  if (invalidResponse.ok) {
    fail("skills invalid name unexpectedly succeeded");
  }

  const external = await requestJson(webBaseUrl, "/api/external-skills?source=claude");
  if (!Array.isArray(external)) {
    fail(`external skills returned invalid payload: ${JSON.stringify(external)}`);
  }

  const dataDir = process.env.CCPANES_WEB_SMOKE_DATA_DIR;
  if (!dataDir) {
    fail("CCPANES_WEB_SMOKE_DATA_DIR was not provided to skills smoke");
  }
  const userSkillDir = path.join(dataDir, "skills", "user", "frontend-design");
  await mkdir(userSkillDir, { recursive: true });
  await writeFile(
    path.join(userSkillDir, "skill.json"),
    JSON.stringify({
      id: "frontend-design",
      name: "frontend-design",
      description: "Frontend design guidance",
      category: "design",
      tags: ["design"],
      version: "1.0.0",
      license: "MIT",
      homepageUrl: null,
      sourceUrl: null,
      contentSha256: "abc",
      installedAt: "2026-06-20T00:00:00Z",
    }),
  );
  await writeFile(path.join(userSkillDir, "SKILL.md"), "# Frontend Design\n");

  const userSkills = await requestJson(webBaseUrl, "/api/user-skills");
  assertEquals(userSkills.length, 1, "user skills length");
  assertEquals(userSkills[0].id, "frontend-design", "user skills id");

  const removed = await requestJson(webBaseUrl, "/api/user-skills/frontend-design", {
    method: "DELETE",
  });
  assertEquals(removed, true, "user skills removed result");

  const deleted = await requestJson(
    webBaseUrl,
    `/api/skills?projectPath=${encodeURIComponent(projectDir)}&name=make-component`,
    { method: "DELETE" },
  );
  assertEquals(deleted, true, "skills delete result");
  await requestNoContent(
    webBaseUrl,
    `/api/skills?projectPath=${encodeURIComponent(targetDir)}&name=make-component`,
    { method: "DELETE" },
  );
}
