import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer } from "../src/server.js";
import type { ServerConfig } from "../src/types.js";

let dir = "";

function makeConfig(): ServerConfig {
  dir = mkdtempSync(path.join(tmpdir(), "skills-manager-web-routes-"));
  const codexSkillsDir = path.join(dir, "codex-skills");
  mkdirSync(codexSkillsDir, { recursive: true });
  const cli = path.join(dir, "fake-cli.mjs");
  writeFileSync(
    cli,
    `#!/usr/bin/env node
import { existsSync, renameSync } from "node:fs";
const args = process.argv.slice(2);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
if (args.includes("skills") && args.includes("remove") && !args.includes("--dry-run") && !args.includes("--yes")) {
  console.error(JSON.stringify({ ok: false, error: "missing --yes" }));
  process.exit(1);
}
if (args.includes("workspaces") && args.includes("import-registry")) {
  const registryPath = args.at(-1);
  if (registryPath && existsSync(registryPath)) {
    renameSync(registryPath, registryPath.replace(/projects\\.json$/, "projects.migrated-test.json"));
  }
  console.log(JSON.stringify({ args, imported: true }));
  process.exit(0);
}
if (args.includes("workspaces") && ["add", "add-linked", "reorder", "remove"].some((command) => args.includes(command))) {
  await sleep(100);
  if (args.includes("remove") && args.includes("fail-workspace")) {
    console.error(JSON.stringify({ ok: false, error: "workspace not found" }));
    process.exit(1);
  }
  console.log(JSON.stringify({ args }));
  process.exit(0);
}
if (args.includes("tools") && args.includes("list")) {
  console.log(JSON.stringify([{
    key: "codex",
    display_name: "Codex",
    installed: true,
    skills_dir: ${JSON.stringify(codexSkillsDir)},
    enabled: true,
    is_custom: false,
    project_relative_skills_dir: ".codex/skills"
  }]));
  process.exit(0);
}
console.log(JSON.stringify({ args }));
`,
    { mode: 0o755 },
  );
  return {
    cliPath: cli,
    host: "127.0.0.1",
    port: 0,
    token: null,
    skillsRoot: "/tmp/skills root",
    dataDir: dir,
    auditLogPath: path.join(dir, "audit.jsonl"),
    commandLogPath: path.join(dir, "commands.jsonl"),
  };
}

function makeMissingWorkspaceCliConfig(): ServerConfig {
  dir = mkdtempSync(path.join(tmpdir(), "skills-manager-web-routes-"));
  const codexSkillsDir = path.join(dir, "codex-skills");
  mkdirSync(path.join(codexSkillsDir, "local-only"), { recursive: true });
  writeFileSync(path.join(codexSkillsDir, "local-only", "SKILL.md"), "# Local Only\n", "utf8");
  const cli = path.join(dir, "missing-workspaces-cli.mjs");
  writeFileSync(
    cli,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.includes("workspaces")) {
  console.error(JSON.stringify({ ok: false, error: "error: unrecognized subcommand 'workspaces'" }));
  process.exit(2);
}
if (args.includes("tools") && args.includes("list")) {
  console.log(JSON.stringify([{
    key: "codex",
    display_name: "Codex",
    installed: true,
    skills_dir: ${JSON.stringify(codexSkillsDir)},
    enabled: true,
    is_custom: false,
    project_relative_skills_dir: ".codex/skills"
  }]));
  process.exit(0);
}
console.log(JSON.stringify({ args }));
`,
    { mode: 0o755 },
  );
  return {
    cliPath: cli,
    host: "127.0.0.1",
    port: 0,
    token: null,
    skillsRoot: null,
    dataDir: dir,
    auditLogPath: path.join(dir, "audit.jsonl"),
    commandLogPath: path.join(dir, "commands.jsonl"),
  };
}

function makeLegacyCliConfig(): ServerConfig {
  dir = mkdtempSync(path.join(tmpdir(), "skills-manager-web-routes-"));
  const dbPath = path.join(dir, "skills-manager.db");
  const metadataDir = path.join(dir, "skills", ".skills-manager");
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE scenarios (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        icon TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at INTEGER,
        updated_at INTEGER
      );
      CREATE TABLE active_scenario (
        key TEXT PRIMARY KEY DEFAULT 'current',
        scenario_id TEXT REFERENCES scenarios(id) ON DELETE SET NULL
      );
    `);
  } finally {
    db.close();
  }
  const cli = path.join(dir, "legacy-cli.mjs");
  writeFileSync(
    cli,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.includes("presets") && args.includes("create")) {
  console.error(JSON.stringify({ ok: false, error: "error: unrecognized subcommand 'create'" }));
  process.exit(1);
}
if (args.includes("repo") && args.includes("status")) {
  console.log(JSON.stringify({
    db_path: ${JSON.stringify(dbPath)},
    metadata_dir: ${JSON.stringify(metadataDir)}
  }));
  process.exit(0);
}
console.log(JSON.stringify({ args }));
`,
    { mode: 0o755 },
  );
  return {
    cliPath: cli,
    host: "127.0.0.1",
    port: 0,
    token: null,
    skillsRoot: null,
    dataDir: dir,
    auditLogPath: path.join(dir, "audit.jsonl"),
    commandLogPath: path.join(dir, "commands.jsonl"),
  };
}

function makeDbBackedCliConfig(): ServerConfig {
  dir = mkdtempSync(path.join(tmpdir(), "skills-manager-web-routes-"));
  const dbPath = path.join(dir, "skills-manager.db");
  const metadataDir = path.join(dir, "skills", ".skills-manager");
  const centralSkillDir = path.join(dir, "skills", "alpha");
  const codexSkillsDir = path.join(dir, "codex-skills");
  mkdirSync(centralSkillDir, { recursive: true });
  mkdirSync(codexSkillsDir, { recursive: true });
  writeFileSync(path.join(centralSkillDir, "SKILL.md"), "# Alpha\n\nAlpha skill\n", "utf8");
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE skills (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        central_path TEXT NOT NULL,
        content_hash TEXT
      );
      CREATE TABLE skill_targets (
        id TEXT PRIMARY KEY,
        skill_id TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
        tool TEXT NOT NULL,
        target_path TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT DEFAULT 'ok',
        synced_at INTEGER,
        last_error TEXT,
        source_hash TEXT,
        UNIQUE(skill_id, tool)
      );
    `);
    db.prepare("INSERT INTO skills (id, name, description, central_path, content_hash) VALUES (?, ?, ?, ?, ?)").run(
      "alpha",
      "Alpha Skill",
      "Alpha skill",
      centralSkillDir,
      "hash-alpha",
    );
  } finally {
    db.close();
  }
  const cli = path.join(dir, "db-cli.mjs");
  writeFileSync(
    cli,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.includes("workspaces") && args.includes("list")) {
  console.log(JSON.stringify([{
    id: "project-1",
    name: "Project",
    path: ${JSON.stringify(path.join(dir, "project"))},
    workspace_type: "project",
    linked_agent_name: null,
    supports_skill_toggle: true,
    sort_order: 0,
    skill_count: 0,
    sync_health: { in_sync: 0, project_newer: 0, center_newer: 0, diverged: 0, project_only: 0 },
    created_at: 1,
    updated_at: 1
  }]));
  process.exit(0);
}
if (args.includes("repo") && args.includes("status")) {
  console.log(JSON.stringify({
    db_path: ${JSON.stringify(dbPath)},
    metadata_dir: ${JSON.stringify(metadataDir)}
  }));
  process.exit(0);
}
if (args.includes("tools") && args.includes("list")) {
  console.log(JSON.stringify([{
    key: "codex",
    display_name: "Codex",
    installed: true,
    skills_dir: ${JSON.stringify(codexSkillsDir)},
    enabled: true,
    is_custom: false,
    project_relative_skills_dir: ".codex/skills"
  }]));
  process.exit(0);
}
console.log(JSON.stringify({ args }));
`,
    { mode: 0o755 },
  );
  return {
    cliPath: cli,
    host: "127.0.0.1",
    port: 0,
    token: null,
    skillsRoot: null,
    dataDir: dir,
    auditLogPath: path.join(dir, "audit.jsonl"),
    commandLogPath: path.join(dir, "commands.jsonl"),
  };
}

async function waitForJob(app: Awaited<ReturnType<typeof createServer>>, id: string, status: string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await app.inject({ method: "GET", url: `/api/operations/jobs/${id}` });
    const job = response.json().data;
    if (job.status === status) return job;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const response = await app.inject({ method: "GET", url: `/api/operations/jobs/${id}` });
  return response.json().data;
}

async function waitForAnyJobStatus(app: Awaited<ReturnType<typeof createServer>>, id: string, statuses: string[]) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const response = await app.inject({ method: "GET", url: `/api/operations/jobs/${id}` });
    const job = response.json().data;
    if (statuses.includes(job.status)) return job;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  const response = await app.inject({ method: "GET", url: `/api/operations/jobs/${id}` });
  return response.json().data;
}

describe("routes", () => {
  beforeEach(() => {
    dir = "";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("runs read commands through the fixed argv builder", async () => {
    const app = await createServer(makeConfig());
    const response = await app.inject({ method: "GET", url: "/api/skills" });
    await app.close();

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.ok).toBe(true);
    expect(payload.data.args).toEqual([
      "--json",
      "--skills-root",
      "/tmp/skills root",
      "skills",
      "list",
    ]);
  });

  it("requires remove dry-run before delete", async () => {
    const app = await createServer(makeConfig());
    const rejected = await app.inject({
      method: "DELETE",
      url: "/api/skills",
      payload: { references: ["abc"], confirm: true },
    });
    expect(rejected.statusCode).toBe(409);

    const preview = await app.inject({
      method: "POST",
      url: "/api/skills/remove-dry-run",
      payload: { references: ["abc"] },
    });
    expect(preview.statusCode).toBe(200);

    const accepted = await app.inject({
      method: "DELETE",
      url: "/api/skills",
      payload: { references: ["abc"], confirm: true },
    });
    await app.close();

    expect(accepted.statusCode).toBe(202);
    expect(accepted.json().job.type).toBe("skills.remove");
  });

  it("enforces bearer auth when token is configured", async () => {
    const config = makeConfig();
    config.token = "secret";
    const app = await createServer(config);
    const missing = await app.inject({ method: "GET", url: "/api/skills" });
    const authed = await app.inject({
      method: "GET",
      url: "/api/skills",
      headers: { authorization: "Bearer secret" },
    });
    await app.close();

    expect(missing.statusCode).toBe(401);
    expect(authed.statusCode).toBe(200);
  });

  it("routes registered workspace reads through the workspaces CLI seam", async () => {
    const app = await createServer(makeConfig());
    const projectId = "project-1";

    const list = await app.inject({ method: "GET", url: "/api/projects" });
    expect(list.statusCode).toBe(200);
    expect(list.json().ok).toBe(true);
    expect(list.json().data.args).toEqual([
      "--json",
      "--skills-root",
      "/tmp/skills root",
      "workspaces",
      "list",
    ]);

    const targets = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/agent-targets`,
    });
    expect(targets.statusCode).toBe(200);
    expect(targets.json().data.args).toEqual([
      "--json",
      "--skills-root",
      "/tmp/skills root",
      "workspaces",
      "agent-targets",
      projectId,
    ]);

    const skills = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/skills`,
    });
    expect(skills.statusCode).toBe(200);
    expect(skills.json().data.args).toEqual([
      "--json",
      "--skills-root",
      "/tmp/skills root",
      "workspaces",
      "skills",
      projectId,
    ]);

    const document = await app.inject({
      method: "GET",
      url: `/api/projects/${projectId}/skills/codex/research%2Falpha/document`,
    });
    await app.close();

    expect(document.statusCode).toBe(200);
    expect(document.json().data.args).toEqual([
      "--json",
      "--skills-root",
      "/tmp/skills root",
      "workspaces",
      "document",
      projectId,
      "codex",
      "research/alpha",
    ]);
  });

  it("queues registered workspace writes through CLI-backed operations", async () => {
    const app = await createServer(makeConfig());

    const created = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { path: "/tmp/example-project" },
    });
    expect(created.statusCode).toBe(202);
    expect(created.json().job.status).toBe("queued");
    expect(created.json().job.type).toBe("workspaces.add");
    const running = await waitForAnyJobStatus(app, created.json().job.id, ["running"]);
    expect(running.status).toBe("running");

    const linked = await app.inject({
      method: "POST",
      url: "/api/projects/linked",
      payload: { name: "Shared Skills", path: "/tmp/shared-skills" },
    });
    const reordered = await app.inject({
      method: "POST",
      url: "/api/projects/reorder",
      payload: { ids: ["linked-1", "project-1"] },
    });
    const removed = await app.inject({
      method: "DELETE",
      url: "/api/projects/project-1",
    });

    expect(linked.statusCode).toBe(202);
    expect(linked.json().job.type).toBe("workspaces.add-linked");
    expect(reordered.statusCode).toBe(202);
    expect(reordered.json().job.type).toBe("workspaces.reorder");
    expect(removed.statusCode).toBe(202);
    expect(removed.json().job.type).toBe("workspaces.remove");

    const createdJob = await waitForJob(app, created.json().job.id, "succeeded");
    const removedJob = await waitForJob(app, removed.json().job.id, "succeeded");
    expect(createdJob.status).toBe("succeeded");
    expect(removedJob.status).toBe("succeeded");
    expect(createdJob.result.args).toEqual([
      "--json",
      "--skills-root",
      "/tmp/skills root",
      "workspaces",
      "add",
      "/tmp/example-project",
    ]);

    const commands = await app.inject({ method: "GET", url: "/api/operations/commands" });
    await app.close();

    const commandArgs = commands.json().data.map((command: { command: string[] }) => command.command);
    expect(commandArgs).toContainEqual([
      path.join(dir, "fake-cli.mjs"),
      "--json",
      "--skills-root",
      "/tmp/skills root",
      "workspaces",
      "add-linked",
      "Shared Skills",
      "/tmp/shared-skills",
    ]);
    expect(commandArgs).toContainEqual([
      path.join(dir, "fake-cli.mjs"),
      "--json",
      "--skills-root",
      "/tmp/skills root",
      "workspaces",
      "reorder",
      "linked-1",
      "project-1",
    ]);
    expect(commandArgs).toContainEqual([
      path.join(dir, "fake-cli.mjs"),
      "--json",
      "--skills-root",
      "/tmp/skills root",
      "workspaces",
      "remove",
      "project-1",
    ]);
  });

  it("records failed workspace registry write jobs", async () => {
    const app = await createServer(makeConfig());
    const response = await app.inject({
      method: "DELETE",
      url: "/api/projects/fail-workspace",
    });

    expect(response.statusCode).toBe(202);
    const failed = await waitForJob(app, response.json().job.id, "failed");
    await app.close();

    expect(failed.status).toBe("failed");
    expect(failed.error).toContain("workspace not found");
  });

  it("imports and renames the legacy web workspace registry before registered workspace reads", async () => {
    const config = makeConfig();
    const registryPath = path.join(config.dataDir, "projects.json");
    writeFileSync(registryPath, JSON.stringify({ projects: [] }), "utf8");
    const app = await createServer(config);

    const response = await app.inject({ method: "GET", url: "/api/projects" });
    const commands = await app.inject({ method: "GET", url: "/api/operations/commands" });
    const jobs = await app.inject({ method: "GET", url: "/api/operations/jobs" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(existsSync(registryPath)).toBe(false);
    expect(existsSync(path.join(config.dataDir, "projects.migrated-test.json"))).toBe(true);
    const commandArgs = commands.json().data.map((command: { command: string[] }) => command.command);
    expect(commandArgs).toContainEqual([
      path.join(dir, "fake-cli.mjs"),
      "--json",
      "--skills-root",
      "/tmp/skills root",
      "workspaces",
      "import-registry",
      registryPath,
    ]);
    expect(commandArgs).toContainEqual([
      path.join(dir, "fake-cli.mjs"),
      "--json",
      "--skills-root",
      "/tmp/skills root",
      "workspaces",
      "list",
    ]);
    const importJob = jobs.json().data.find((job: { type: string }) => job.type === "workspaces.import-registry");
    expect(importJob.status).toBe("succeeded");
  });

  it("browses local directories for browser-based path selection", async () => {
    const config = makeConfig();
    const root = path.join(config.dataDir, "browse-root");
    const alpha = path.join(root, "alpha");
    const beta = path.join(root, "beta");
    mkdirSync(alpha, { recursive: true });
    mkdirSync(beta, { recursive: true });
    writeFileSync(path.join(root, "note.txt"), "not a directory");

    const app = await createServer(config);
    const response = await app.inject({
      method: "GET",
      url: `/api/fs/directories?path=${encodeURIComponent(root)}`,
    });
    const rejected = await app.inject({
      method: "GET",
      url: "/api/fs/directories?path=relative",
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({
      path: root,
      parent: config.dataDir,
      entries: [
        { name: "alpha", path: alpha },
        { name: "beta", path: beta },
      ],
    });
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json().error).toContain("absolute Linux path");
  });

  it("routes project workspace scan through the workspaces CLI seam", async () => {
    const config = makeConfig();
    const root = path.join(config.dataDir, "scan-root");
    mkdirSync(root, { recursive: true });

    const app = await createServer(config);
    const response = await app.inject({
      method: "GET",
      url: `/api/projects/scan?root=${encodeURIComponent(root)}`,
    });
    const rejected = await app.inject({
      method: "GET",
      url: `/api/projects/scan?root=${encodeURIComponent(path.join(root, "missing"))}`,
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().data.args).toEqual([
      "--json",
      "--skills-root",
      "/tmp/skills root",
      "workspaces",
      "scan",
      root,
    ]);
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json().error).toContain("root must be a directory");
  });

  it("routes global workspace skill listing through the workspaces CLI seam", async () => {
    const app = await createServer(makeConfig());
    const response = await app.inject({
      method: "GET",
      url: "/api/workspaces/global/codex/skills",
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.ok).toBe(true);
    expect(payload.data.args).toEqual([
      "--json",
      "--skills-root",
      "/tmp/skills root",
      "workspaces",
      "global",
      "list-skills",
      "codex",
    ]);
  });

  it("routes global workspace document reads through the workspaces CLI seam", async () => {
    const app = await createServer(makeConfig());
    const response = await app.inject({
      method: "GET",
      url: "/api/workspaces/global/codex/skills/research%2Falpha/document",
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.ok).toBe(true);
    expect(payload.data.args).toEqual([
      "--json",
      "--skills-root",
      "/tmp/skills root",
      "workspaces",
      "global",
      "document",
      "codex",
      "research/alpha",
    ]);
  });

  it("reports missing workspace CLI capability for global workspace reads without filesystem fallback", async () => {
    const app = await createServer(makeMissingWorkspaceCliConfig());
    const response = await app.inject({
      method: "GET",
      url: "/api/workspaces/global/codex/skills",
    });
    await app.close();

    expect(response.statusCode).toBe(503);
    const payload = response.json();
    expect(payload.ok).toBe(false);
    expect(payload.error).toContain("Workspace CLI capability");
    expect(payload.data).toBeNull();
  });

  it("fetches skills.sh leaderboard pages instead of using CLI search wildcard", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        String.raw`<html><script>self.__next_f.push([1,"{\"initialSkills\":[{\"source\":\"demo/skills\",\"skillId\":\"alpha\",\"name\":\"Alpha\",\"installs\":42}]}"])</script></html>`,
        { status: 200 },
      ),
    );
    const app = await createServer(makeConfig());

    const response = await app.inject({
      method: "GET",
      url: "/api/skills/leaderboard?board=trending",
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([
      {
        id: "demo/skills/alpha",
        skill_id: "alpha",
        name: "Alpha",
        source: "demo/skills",
        installs: 42,
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://skills.sh/trending",
      expect.objectContaining({
        headers: { "User-Agent": "skills-manager-web" },
      }),
    );
  });

  it("creates presets through the CLI create command", async () => {
    const app = await createServer(makeConfig());
    const response = await app.inject({
      method: "POST",
      url: "/api/presets",
      payload: {
        name: "Research",
        description: "Research workflow",
        icon: "sparkles",
      },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.ok).toBe(true);
    expect(payload.data.args).toEqual([
      "--json",
      "--skills-root",
      "/tmp/skills root",
      "presets",
      "create",
      "Research",
      "--description",
      "Research workflow",
      "--icon",
      "sparkles",
    ]);
  });

  it("adds and removes preset skills synchronously instead of enqueueing jobs", async () => {
    const app = await createServer(makeConfig());
    const add = await app.inject({
      method: "POST",
      url: "/api/presets/preset-1/skills",
      payload: { skills: ["alpha"] },
    });
    const remove = await app.inject({
      method: "DELETE",
      url: "/api/presets/preset-1/skills",
      payload: { skills: ["alpha"] },
    });
    await app.close();

    expect(add.statusCode).toBe(200);
    expect(add.json().job).toBeUndefined();
    expect(add.json().data.args).toEqual([
      "--json",
      "--skills-root",
      "/tmp/skills root",
      "presets",
      "add-skill",
      "preset-1",
      "alpha",
    ]);

    expect(remove.statusCode).toBe(200);
    expect(remove.json().job).toBeUndefined();
    expect(remove.json().data.args).toEqual([
      "--json",
      "--skills-root",
      "/tmp/skills root",
      "presets",
      "remove-skill",
      "preset-1",
      "alpha",
    ]);
  });

  it("falls back to the repo database when installed CLI cannot create presets yet", async () => {
    const config = makeLegacyCliConfig();
    const app = await createServer(config);
    const response = await app.inject({
      method: "POST",
      url: "/api/presets",
      payload: {
        name: "Fallback",
        description: "Created through compatibility path",
        icon: "sparkles",
      },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const preset = response.json().data;
    expect(preset).toEqual(
      expect.objectContaining({
        name: "Fallback",
        description: "Created through compatibility path",
        icon: "sparkles",
        skill_count: 0,
        active: true,
      }),
    );

    const db = new DatabaseSync(path.join(config.dataDir, "skills-manager.db"));
    try {
      expect(
        db.prepare("SELECT name, description, icon, created_at, updated_at FROM scenarios WHERE id = ?").get(preset.id),
      ).toEqual({
        name: "Fallback",
        description: "Created through compatibility path",
        icon: "sparkles",
        created_at: preset.created_at,
        updated_at: preset.updated_at,
      });
      expect(db.prepare("SELECT scenario_id FROM active_scenario WHERE key = 'current'").get()).toEqual({
        scenario_id: preset.id,
      });
    } finally {
      db.close();
    }

    const metadataPath = path.join(config.dataDir, "skills", ".skills-manager", "scenarios", `${preset.id}.json`);
    expect(existsSync(metadataPath)).toBe(true);
    expect(JSON.parse(readFileSync(metadataPath, "utf8"))).toEqual(
      expect.objectContaining({
        scenario_id: preset.id,
        name: "Fallback",
        description: "Created through compatibility path",
        icon: "sparkles",
      }),
    );
  });

  it("syncs a managed skill into a global workspace before returning success", async () => {
    const config = makeDbBackedCliConfig();
    const app = await createServer(config);
    const response = await app.inject({
      method: "POST",
      url: "/api/skills/alpha/sync-tool",
      payload: { tool: "codex" },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const targetPath = response.json().data.target_path;
    expect(existsSync(path.join(targetPath, "SKILL.md"))).toBe(true);

    const db = new DatabaseSync(path.join(config.dataDir, "skills-manager.db"));
    try {
      expect(db.prepare("SELECT tool, target_path, mode, status, source_hash FROM skill_targets WHERE skill_id = ?").get("alpha")).toEqual({
        tool: "codex",
        target_path: targetPath,
        mode: "copy",
        status: "ok",
        source_hash: "hash-alpha",
      });
    } finally {
      db.close();
    }
  });

  it("unsyncs a managed skill from a global workspace before returning success", async () => {
    const config = makeDbBackedCliConfig();
    const app = await createServer(config);
    const syncResponse = await app.inject({
      method: "POST",
      url: "/api/skills/alpha/sync-tool",
      payload: { tool: "codex" },
    });
    const targetPath = syncResponse.json().data.target_path;
    expect(existsSync(path.join(targetPath, "SKILL.md"))).toBe(true);

    const response = await app.inject({
      method: "DELETE",
      url: "/api/skills/alpha/sync-tool",
      payload: { tool: "codex" },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(existsSync(targetPath)).toBe(false);

    const db = new DatabaseSync(path.join(config.dataDir, "skills-manager.db"));
    try {
      expect(db.prepare("SELECT COUNT(*) AS count FROM skill_targets WHERE skill_id = ?").get("alpha")).toEqual({
        count: 0,
      });
    } finally {
      db.close();
    }
  });

  it("exports a managed skill into the selected project agent directory", async () => {
    const config = makeDbBackedCliConfig();
    const projectPath = path.join(config.dataDir, "project");
    const app = await createServer(config);
    const response = await app.inject({
      method: "POST",
      url: "/api/projects/project-1/skills/export",
      payload: { skill: "alpha", agents: ["codex"] },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const targetPath = response.json().data.targets[0].target_path;
    expect(targetPath).toBe(path.join(projectPath, ".codex", "skills", "alpha-skill"));
    expect(existsSync(path.join(targetPath, "SKILL.md"))).toBe(true);
  });

  it("deletes a project workspace skill from the selected agent directory", async () => {
    const config = makeDbBackedCliConfig();
    const projectPath = path.join(config.dataDir, "project");
    const app = await createServer(config);
    await app.inject({
      method: "POST",
      url: "/api/projects/project-1/skills/export",
      payload: { skill: "alpha", agents: ["codex"] },
    });

    const targetPath = path.join(projectPath, ".codex", "skills", "alpha-skill");
    expect(existsSync(path.join(targetPath, "SKILL.md"))).toBe(true);

    const response = await app.inject({
      method: "DELETE",
      url: "/api/projects/project-1/skills/codex/alpha-skill",
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(existsSync(targetPath)).toBe(false);
  });
});
