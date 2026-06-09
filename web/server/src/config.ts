import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { ServerConfig } from "./types.js";

function envString(env: NodeJS.ProcessEnv, key: string): string | null {
  const value = env[key]?.trim();
  return value ? value : null;
}

function envPort(env: NodeJS.ProcessEnv): number {
  const raw = envString(env, "SKILLS_MANAGER_WEB_PORT");
  if (!raw) return 17321;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SKILLS_MANAGER_WEB_PORT must be an integer between 1 and 65535");
  }
  return port;
}

export function defaultDataDir(): string {
  return path.join(homedir(), ".local", "share", "skills-manager-web");
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): ServerConfig {
  if (platform !== "linux") {
    throw new Error("skills-manager-web is Linux-only");
  }

  const host = envString(env, "SKILLS_MANAGER_WEB_HOST") ?? "127.0.0.1";
  const token = envString(env, "SKILLS_MANAGER_WEB_TOKEN");
  if (host === "0.0.0.0" && !token) {
    throw new Error("SKILLS_MANAGER_WEB_TOKEN is required when listening on 0.0.0.0");
  }

  const dataDir = envString(env, "SKILLS_MANAGER_WEB_DATA_DIR") ?? defaultDataDir();
  mkdirSync(dataDir, { recursive: true });

  return {
    cliPath: envString(env, "SKILLS_MANAGER_CLI") ?? "skills-manager-cli",
    host,
    port: envPort(env),
    token,
    skillsRoot: envString(env, "SKILLS_MANAGER_SKILLS_ROOT"),
    dataDir,
    auditLogPath: path.join(dataDir, "audit.jsonl"),
    commandLogPath: path.join(dataDir, "commands.jsonl"),
  };
}
