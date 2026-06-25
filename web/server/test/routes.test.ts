import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
    `#!/bin/sh
has_arg() {
  needle=$1
  shift
  for arg in "$@"; do
    [ "$arg" = "$needle" ] && return 0
  done
  return 1
}
json_escape() {
  printf '%s' "$1" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g'
}
print_args() {
  printf '{"args":['
  sep=''
  for arg in "$@"; do
    escaped=$(json_escape "$arg")
    printf '%s"%s"' "$sep" "$escaped"
    sep=','
  done
  printf ']}\\n'
}
if has_arg skills "$@" && has_arg remove "$@" && ! has_arg --dry-run "$@" && ! has_arg --yes "$@"; then
  printf '{"ok":false,"error":"missing --yes"}\\n' >&2
  exit 1
fi
if has_arg workspaces "$@" && has_arg import-registry "$@"; then
  registry_path=''
  for arg in "$@"; do registry_path="$arg"; done
  if [ -f "$registry_path" ]; then
    mv "$registry_path" "\${registry_path%projects.json}projects.migrated-test.json"
  fi
  print_args "$@"
  exit 0
fi
if has_arg workspaces "$@" && { has_arg add "$@" || has_arg add-linked "$@" || has_arg reorder "$@" || has_arg remove "$@"; }; then
  sleep 0.1
  if has_arg remove "$@" && has_arg fail-workspace "$@"; then
    printf '{"ok":false,"error":"workspace not found"}\\n' >&2
    exit 1
  fi
  print_args "$@"
  exit 0
fi
if has_arg tools "$@" && has_arg list "$@"; then
  printf '%s\\n' '${JSON.stringify([
    {
      key: "codex",
      display_name: "Codex",
      installed: true,
      skills_dir: codexSkillsDir,
      enabled: true,
      is_custom: false,
      project_relative_skills_dir: ".codex/skills",
    },
  ])}'
  exit 0
fi
print_args "$@"
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
    `#!/bin/sh
has_arg() {
  needle=$1
  shift
  for arg in "$@"; do
    [ "$arg" = "$needle" ] && return 0
  done
  return 1
}
json_escape() {
  printf '%s' "$1" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g'
}
print_args() {
  printf '{"args":['
  sep=''
  for arg in "$@"; do
    escaped=$(json_escape "$arg")
    printf '%s"%s"' "$sep" "$escaped"
    sep=','
  done
  printf ']}\\n'
}
if has_arg workspaces "$@"; then
  printf '{"ok":false,"error":"error: unrecognized subcommand '\\''workspaces'\\''"}\\n' >&2
  exit 2
fi
if has_arg tools "$@" && has_arg list "$@"; then
  printf '%s\\n' '${JSON.stringify([
    {
      key: "codex",
      display_name: "Codex",
      installed: true,
      skills_dir: codexSkillsDir,
      enabled: true,
      is_custom: false,
      project_relative_skills_dir: ".codex/skills",
    },
  ])}'
  exit 0
fi
print_args "$@"
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
    `#!/bin/sh
has_arg() {
  needle=$1
  shift
  for arg in "$@"; do
    [ "$arg" = "$needle" ] && return 0
  done
  return 1
}
json_escape() {
  printf '%s' "$1" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g'
}
print_args() {
  printf '{"args":['
  sep=''
  for arg in "$@"; do
    escaped=$(json_escape "$arg")
    printf '%s"%s"' "$sep" "$escaped"
    sep=','
  done
  printf ']}\\n'
}
if has_arg presets "$@" && has_arg create "$@"; then
  printf '{"ok":false,"error":"error: unrecognized subcommand '\\''create'\\''"}\\n' >&2
  exit 1
fi
if has_arg repo "$@" && has_arg status "$@"; then
  printf '%s\\n' '${JSON.stringify({
    db_path: dbPath,
    metadata_dir: metadataDir,
  })}'
  exit 0
fi
print_args "$@"
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
  const projectPath = path.join(dir, "project");
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
    `#!/bin/sh
has_arg() {
  needle=$1
  shift
  for arg in "$@"; do
    [ "$arg" = "$needle" ] && return 0
  done
  return 1
}
json_escape() {
  printf '%s' "$1" | sed 's/\\\\/\\\\\\\\/g; s/"/\\\\"/g'
}
print_args() {
  printf '{"args":['
  sep=''
  for arg in "$@"; do
    escaped=$(json_escape "$arg")
    printf '%s"%s"' "$sep" "$escaped"
    sep=','
  done
  printf ']}\\n'
}
last_arg() {
  last=''
  for arg in "$@"; do last="$arg"; done
  printf '%s' "$last"
}
if has_arg workspaces "$@" && has_arg global "$@" && has_arg sync "$@"; then
  sleep 0.1
  if has_arg fail-skill "$@"; then
    printf '{"ok":false,"error":"skill not found: fail-skill"}\\n' >&2
    exit 1
  fi
  target_path=${JSON.stringify(codexSkillsDir + "/alpha")}
  mkdir -p "$target_path"
  printf '# Alpha\\n' > "$target_path/SKILL.md"
  print_args "$@"
  exit 0
fi
if has_arg workspaces "$@" && has_arg global "$@" && has_arg unsync "$@"; then
  sleep 0.1
  target_path=${JSON.stringify(codexSkillsDir + "/alpha")}
  rm -rf "$target_path"
  print_args "$@"
  exit 0
fi
if has_arg workspaces "$@" && has_arg global "$@" && has_arg delete-skill "$@"; then
  sleep 0.1
  relative_path=$(last_arg "$@")
  target_path=${JSON.stringify(codexSkillsDir)}"/$relative_path"
  rm -rf "$target_path"
  print_args "$@"
  exit 0
fi
if has_arg workspaces "$@" && has_arg export "$@"; then
  sleep 0.1
  if has_arg fail-skill "$@"; then
    printf '{"ok":false,"error":"skill not found: fail-skill"}\\n' >&2
    exit 1
  fi
  target_path=${JSON.stringify(projectPath + "/.codex/skills/alpha-skill")}
  mkdir -p "$target_path"
  printf '# Alpha\\n' > "$target_path/SKILL.md"
  print_args "$@"
  exit 0
fi
if has_arg workspaces "$@" && has_arg delete-skill "$@"; then
  sleep 0.1
  relative_path=$(last_arg "$@")
  target_path=${JSON.stringify(projectPath + "/.codex/skills")}"/$relative_path"
  rm -rf "$target_path"
  print_args "$@"
  exit 0
fi
if has_arg workspaces "$@" && has_arg list "$@"; then
  printf '%s\\n' '${JSON.stringify([
    {
      id: "project-1",
      name: "Project",
      path: projectPath,
      workspace_type: "project",
      linked_agent_name: null,
      supports_skill_toggle: true,
      sort_order: 0,
      skill_count: 0,
      sync_health: { in_sync: 0, project_newer: 0, center_newer: 0, diverged: 0, project_only: 0 },
      created_at: 1,
      updated_at: 1,
    },
  ])}'
  exit 0
fi
if has_arg repo "$@" && has_arg status "$@"; then
  printf '%s\\n' '${JSON.stringify({
    db_path: dbPath,
    metadata_dir: metadataDir,
  })}'
  exit 0
fi
if has_arg tools "$@" && has_arg list "$@"; then
  printf '%s\\n' '${JSON.stringify([
    {
      key: "codex",
      display_name: "Codex",
      installed: true,
      skills_dir: codexSkillsDir,
      enabled: true,
      is_custom: false,
      project_relative_skills_dir: ".codex/skills",
    },
  ])}'
  exit 0
fi
print_args "$@"
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

  it("reports workspace CLI capability in health", async () => {
    const app = await createServer(makeConfig());
    const response = await app.inject({ method: "GET", url: "/api/health" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        ok: true,
        cli: expect.objectContaining({
          workspaceCapable: true,
          workspaceCapabilityError: null,
          error: null,
        }),
      }),
    );
  });

  it("keeps health available and reports missing workspace CLI capability", async () => {
    const app = await createServer(makeMissingWorkspaceCliConfig());
    const response = await app.inject({ method: "GET", url: "/api/health" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        ok: true,
        cli: expect.objectContaining({
          ready: true,
          workspaceCapable: false,
          workspaceCapabilityError: expect.stringContaining("Workspace CLI capability"),
          error: expect.stringContaining("Workspace CLI capability"),
        }),
      }),
    );
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

  it("does not import the legacy web workspace registry before registered workspace reads", async () => {
    const config = makeConfig();
    const registryPath = path.join(config.dataDir, "projects.json");
    writeFileSync(registryPath, JSON.stringify({ projects: [] }), "utf8");
    const app = await createServer(config);

    const response = await app.inject({ method: "GET", url: "/api/projects" });
    const commands = await app.inject({ method: "GET", url: "/api/operations/commands" });
    const jobs = await app.inject({ method: "GET", url: "/api/operations/jobs" });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(existsSync(registryPath)).toBe(true);
    expect(existsSync(path.join(config.dataDir, "projects.migrated-test.json"))).toBe(false);
    expect(response.json().data.args).toEqual([
      "--json",
      "--skills-root",
      "/tmp/skills root",
      "workspaces",
      "list",
    ]);
    const commandArgs = commands.json().data.map((command: { command: string[] }) => command.command);
    expect(commandArgs).toContainEqual([
      path.join(dir, "fake-cli.mjs"),
      "--json",
      "--skills-root",
      "/tmp/skills root",
      "workspaces",
      "list",
    ]);
    expect(commandArgs.some((args: string[]) => args.includes("import-registry"))).toBe(false);
    expect(jobs.json().data.some((job: { type: string }) => job.type === "workspaces.import-registry")).toBe(false);
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

  it("rejects workspace writes when workspace CLI capability is missing without enqueueing jobs", async () => {
    const config = makeMissingWorkspaceCliConfig();
    const localSkill = path.join(config.dataDir, "codex-skills", "local-only", "SKILL.md");
    const app = await createServer(config);
    const response = await app.inject({
      method: "DELETE",
      url: "/api/workspaces/global/codex/skills/local-only",
    });
    const jobs = await app.inject({ method: "GET", url: "/api/operations/jobs" });
    await app.close();

    expect(response.statusCode).toBe(503);
    expect(response.json().ok).toBe(false);
    expect(response.json().error).toContain("Workspace CLI capability");
    expect(jobs.json().data).toEqual([]);
    expect(existsSync(localSkill)).toBe(true);
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

  it("reports preset create CLI errors without falling back to database writes", async () => {
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

    expect(response.statusCode).toBe(500);
    expect(response.json().ok).toBe(false);
    expect(response.json().error).toContain("unrecognized subcommand");

    const db = new DatabaseSync(path.join(config.dataDir, "skills-manager.db"));
    try {
      expect(db.prepare("SELECT COUNT(*) AS count FROM scenarios").get()).toEqual({ count: 0 });
      expect(db.prepare("SELECT COUNT(*) AS count FROM active_scenario").get()).toEqual({ count: 0 });
    } finally {
      db.close();
    }

    expect(existsSync(path.join(config.dataDir, "skills", ".skills-manager", "scenarios"))).toBe(false);
  });

  it("queues global workspace sync and unsync through CLI-backed operations", async () => {
    const config = makeDbBackedCliConfig();
    const app = await createServer(config);
    const targetPath = path.join(config.dataDir, "codex-skills", "alpha");

    const syncResponse = await app.inject({
      method: "POST",
      url: "/api/skills/alpha/sync-tool",
      payload: { tool: "codex" },
    });

    expect(syncResponse.statusCode).toBe(202);
    expect(syncResponse.json().job.type).toBe("workspaces.global.sync");
    expect(existsSync(targetPath)).toBe(false);
    const syncJob = await waitForJob(app, syncResponse.json().job.id, "succeeded");
    expect(syncJob.status).toBe("succeeded");
    expect(syncJob.result.args).toEqual([
      "--json",
      "workspaces",
      "global",
      "sync",
      "codex",
      "alpha",
    ]);
    expect(existsSync(path.join(targetPath, "SKILL.md"))).toBe(true);

    const db = new DatabaseSync(path.join(config.dataDir, "skills-manager.db"));
    try {
      expect(db.prepare("SELECT COUNT(*) AS count FROM skill_targets WHERE skill_id = ?").get("alpha")).toEqual({
        count: 0,
      });
    } finally {
      db.close();
    }

    const unsyncResponse = await app.inject({
      method: "DELETE",
      url: "/api/skills/alpha/sync-tool",
      payload: { tool: "codex" },
    });

    expect(unsyncResponse.statusCode).toBe(202);
    expect(unsyncResponse.json().job.type).toBe("workspaces.global.unsync");
    expect(existsSync(path.join(targetPath, "SKILL.md"))).toBe(true);
    const unsyncJob = await waitForJob(app, unsyncResponse.json().job.id, "succeeded");
    await app.close();

    expect(unsyncJob.status).toBe("succeeded");
    expect(unsyncJob.result.args).toEqual([
      "--json",
      "workspaces",
      "global",
      "unsync",
      "codex",
      "alpha",
    ]);
    expect(existsSync(targetPath)).toBe(false);
  });

  it("queues global workspace delete through CLI-backed operations", async () => {
    const config = makeDbBackedCliConfig();
    const targetPath = path.join(config.dataDir, "codex-skills", "local-only");
    mkdirSync(targetPath, { recursive: true });
    writeFileSync(path.join(targetPath, "SKILL.md"), "# Local Only\n", "utf8");
    const app = await createServer(config);

    const response = await app.inject({
      method: "DELETE",
      url: "/api/workspaces/global/codex/skills/local-only",
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().job.type).toBe("workspaces.global.delete-skill");
    expect(existsSync(path.join(targetPath, "SKILL.md"))).toBe(true);
    const job = await waitForJob(app, response.json().job.id, "succeeded");
    await app.close();

    expect(job.status).toBe("succeeded");
    expect(job.result.args).toEqual([
      "--json",
      "workspaces",
      "global",
      "delete-skill",
      "codex",
      "local-only",
    ]);
    expect(existsSync(targetPath)).toBe(false);
  });

  it("records failed global workspace write jobs", async () => {
    const config = makeDbBackedCliConfig();
    const app = await createServer(config);
    const response = await app.inject({
      method: "POST",
      url: "/api/skills/fail-skill/sync-tool",
      payload: { tool: "codex" },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().job.type).toBe("workspaces.global.sync");
    const failed = await waitForJob(app, response.json().job.id, "failed");
    await app.close();

    expect(failed.status).toBe("failed");
    expect(failed.error).toContain("skill not found: fail-skill");
  });

  it("queues project workspace export and delete through CLI-backed operations", async () => {
    const config = makeDbBackedCliConfig();
    const projectPath = path.join(config.dataDir, "project");
    const targetPath = path.join(projectPath, ".codex", "skills", "alpha-skill");
    const app = await createServer(config);
    const exportResponse = await app.inject({
      method: "POST",
      url: "/api/projects/project-1/skills/export",
      payload: { skill: "alpha", agents: ["codex"] },
    });

    expect(exportResponse.statusCode).toBe(202);
    expect(exportResponse.json().job.type).toBe("workspaces.export");
    expect(existsSync(targetPath)).toBe(false);
    const exportJob = await waitForJob(app, exportResponse.json().job.id, "succeeded");
    expect(exportJob.status).toBe("succeeded");
    expect(exportJob.result.args).toEqual([
      "--json",
      "workspaces",
      "export",
      "project-1",
      "alpha",
      "codex",
    ]);
    expect(existsSync(path.join(targetPath, "SKILL.md"))).toBe(true);

    const deleteResponse = await app.inject({
      method: "DELETE",
      url: "/api/projects/project-1/skills/codex/alpha-skill",
    });

    expect(deleteResponse.statusCode).toBe(202);
    expect(deleteResponse.json().job.type).toBe("workspaces.delete-skill");
    expect(existsSync(targetPath)).toBe(true);
    const deleteJob = await waitForJob(app, deleteResponse.json().job.id, "succeeded");
    await app.close();

    expect(deleteJob.status).toBe("succeeded");
    expect(deleteJob.result.args).toEqual([
      "--json",
      "workspaces",
      "delete-skill",
      "project-1",
      "codex",
      "alpha-skill",
    ]);
    expect(existsSync(targetPath)).toBe(false);
  });

  it("records failed project workspace export jobs", async () => {
    const config = makeDbBackedCliConfig();
    const app = await createServer(config);
    const response = await app.inject({
      method: "POST",
      url: "/api/projects/project-1/skills/export",
      payload: { skill: "fail-skill", agents: ["codex"] },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json().job.type).toBe("workspaces.export");
    const failed = await waitForJob(app, response.json().job.id, "failed");
    await app.close();

    expect(failed.status).toBe("failed");
    expect(failed.error).toContain("skill not found: fail-skill");
  });
});
