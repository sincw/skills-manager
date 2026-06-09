import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildCliCommand, runCli } from "../src/cli.js";
import type { ServerConfig } from "../src/types.js";

function config(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    cliPath: "/usr/bin/skills-manager-cli",
    host: "127.0.0.1",
    port: 17321,
    token: null,
    skillsRoot: null,
    dataDir: "/tmp/smw",
    auditLogPath: "/tmp/smw/audit.jsonl",
    commandLogPath: "/tmp/smw/commands.jsonl",
    ...overrides,
  };
}

describe("buildCliCommand", () => {
  let dir = "";

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = "";
  });

  it("always inserts --json before subcommands", () => {
    expect(buildCliCommand(config(), ["skills", "list"])).toEqual([
      "/usr/bin/skills-manager-cli",
      "--json",
      "skills",
      "list",
    ]);
  });

  it("passes configured skills root as argv", () => {
    expect(
      buildCliCommand(config({ skillsRoot: "/home/me/skills" }), ["repo", "status"]),
    ).toEqual([
      "/usr/bin/skills-manager-cli",
      "--json",
      "--skills-root",
      "/home/me/skills",
      "repo",
      "status",
    ]);
  });

  it("serializes CLI processes so repo reindex lock contention does not leak to callers", async () => {
    dir = mkdtempSync(path.join(tmpdir(), "skills-manager-web-cli-"));
    const lockPath = path.join(dir, "cli.lock");
    const logPath = path.join(dir, "calls.log");
    const cli = path.join(dir, "fake-cli.mjs");
    writeFileSync(
      cli,
      `#!/usr/bin/env node
import { existsSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
const lock = ${JSON.stringify(lockPath)};
const log = ${JSON.stringify(logPath)};
if (existsSync(lock)) {
  console.error(JSON.stringify({ ok: false, error: "Failed to reindex from sync metadata: skills repository is busy: reindex sync metadata: Resource temporarily unavailable (os error 11)" }));
  process.exit(1);
}
writeFileSync(lock, String(process.pid));
appendFileSync(log, "start\\n");
await new Promise((resolve) => setTimeout(resolve, 80));
rmSync(lock, { force: true });
console.log(JSON.stringify({ ok: true, pid: process.pid }));
`,
      { mode: 0o755 },
    );
    const [first, second] = await Promise.all([
      runCli(config({ cliPath: cli }), ["skills", "list"]),
      runCli(config({ cliPath: cli }), ["tools", "list"]),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(readFileSync(logPath, "utf8").trim().split("\n")).toHaveLength(2);
  });
});
