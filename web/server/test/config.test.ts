import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "skills-manager-web-test-"));
}

describe("loadConfig", () => {
  it("rejects non-Linux platforms", () => {
    expect(() => loadConfig({} as NodeJS.ProcessEnv, "darwin")).toThrow("Linux-only");
  });

  it("requires a token when listening on all interfaces", () => {
    const dir = tempDir();
    try {
      expect(() =>
        loadConfig(
          {
            SKILLS_MANAGER_WEB_HOST: "0.0.0.0",
            SKILLS_MANAGER_WEB_DATA_DIR: dir,
          } as NodeJS.ProcessEnv,
          "linux",
        ),
      ).toThrow("SKILLS_MANAGER_WEB_TOKEN");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses localhost defaults", () => {
    const dir = tempDir();
    try {
      const config = loadConfig(
        {
          SKILLS_MANAGER_WEB_DATA_DIR: dir,
        } as NodeJS.ProcessEnv,
        "linux",
      );
      expect(config.host).toBe("127.0.0.1");
      expect(config.port).toBe(17321);
      expect(config.cliPath).toBe("skills-manager-cli");
      expect(config.auditLogPath).toBe(path.join(dir, "audit.jsonl"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
