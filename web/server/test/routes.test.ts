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
const args = process.argv.slice(2);
if (args.includes("remove") && !args.includes("--dry-run") && !args.includes("--yes")) {
  console.error(JSON.stringify({ ok: false, error: "missing --yes" }));
  process.exit(1);
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

  it("persists web project registry records and exposes project agent targets", async () => {
    const app = await createServer(makeConfig());

    const created = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { path: "/tmp/example-project" },
    });
    expect(created.statusCode).toBe(200);
    const project = created.json().data;
    expect(project.name).toBe("example-project");
    expect(project.workspace_type).toBe("project");

    const list = await app.inject({ method: "GET", url: "/api/projects" });
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toHaveLength(1);
    expect(list.json().data[0].id).toBe(project.id);

    const targets = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/agent-targets`,
    });
    await app.close();

    expect(targets.statusCode).toBe(200);
    expect(targets.json().data).toEqual([
      expect.objectContaining({ key: "codex", display_name: "Codex" }),
    ]);
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

  it("scans a root directory for project workspaces with agent skills directories", async () => {
    const config = makeConfig();
    const root = path.join(config.dataDir, "scan-root");
    const project = path.join(root, "project-one");
    const ignored = path.join(root, "not-a-project");
    mkdirSync(path.join(project, ".codex", "skills"), { recursive: true });
    mkdirSync(ignored, { recursive: true });

    const app = await createServer(config);
    const response = await app.inject({
      method: "GET",
      url: `/api/projects/scan?root=${encodeURIComponent(root)}`,
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual([project]);
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

  it("exports a managed skill into the selected project agent directory", async () => {
    const config = makeDbBackedCliConfig();
    const projectPath = path.join(config.dataDir, "project");
    const app = await createServer(config);
    const created = await app.inject({
      method: "POST",
      url: "/api/projects",
      payload: { path: projectPath },
    });
    const project = created.json().data;
    const response = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/skills/export`,
      payload: { skill: "alpha", agents: ["codex"] },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    const targetPath = response.json().data.targets[0].target_path;
    expect(targetPath).toBe(path.join(projectPath, ".codex", "skills", "alpha-skill"));
    expect(existsSync(path.join(targetPath, "SKILL.md"))).toBe(true);
  });
});
