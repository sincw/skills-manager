import { spawn } from "node:child_process";
import type { CliResult, CliRunOptions, JsonValue, ServerConfig } from "./types.js";

const BUSY_RETRY_DELAYS_MS = [50, 120, 250, 500, 1000];
let cliTail: Promise<void> = Promise.resolve();

function truncate(value: string, max = 12000): string {
  return value.length > max ? `${value.slice(0, max)}\n...[truncated]` : value;
}

function jsonFromText(text: string): JsonValue | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as JsonValue;
  } catch {
    const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      if (!line.startsWith("{") && !line.startsWith("[")) continue;
      try {
        return JSON.parse(line) as JsonValue;
      } catch {
        // Keep scanning older lines.
      }
    }
    return null;
  }
}

function errorFromJson(value: JsonValue | null): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const error = value.error;
  return typeof error === "string" ? error : null;
}

export function buildCliCommand(config: ServerConfig, args: string[]): string[] {
  const command = [config.cliPath, "--json"];
  if (config.skillsRoot) {
    command.push("--skills-root", config.skillsRoot);
  }
  command.push(...args);
  return command;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRepoBusy(result: CliResult): boolean {
  const message = `${result.error ?? ""}\n${result.stderr}\n${result.stdout}`;
  return message.includes("skills repository is busy") || message.includes("Resource temporarily unavailable");
}

function enqueueCliTask<T>(task: () => Promise<T>): Promise<T> {
  const run = cliTail.catch(() => undefined).then(task);
  cliTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function runCliAttempt(
  config: ServerConfig,
  args: string[],
  options: CliRunOptions = {},
): Promise<CliResult> {
  const command = buildCliCommand(config, args);
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? 120000;

  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 1000).unref();
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      const durationMs = Date.now() - started;
      resolve({
        ok: false,
        command,
        durationMs,
        data: null,
        exitCode: null,
        error: error.message,
        stdout: truncate(stdout),
        stderr: truncate(stderr),
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const durationMs = Date.now() - started;
      const stdoutJson = jsonFromText(stdout);
      const stderrJson = jsonFromText(stderr);
      const data = stdoutJson ?? stderrJson;
      const parsedError = errorFromJson(stderrJson) ?? errorFromJson(stdoutJson);
      const error = timedOut
        ? `command timed out after ${timeoutMs}ms`
        : code === 0
          ? null
          : parsedError ?? stderr.trim() ?? `command exited with ${code}`;

      resolve({
        ok: code === 0 && !timedOut,
        command,
        durationMs,
        data,
        exitCode: code,
        error,
        stdout: truncate(stdout),
        stderr: truncate(stderr),
      });
    });
  });
}

async function runCliWithRetry(
  config: ServerConfig,
  args: string[],
  options: CliRunOptions = {},
): Promise<CliResult> {
  let result = await runCliAttempt(config, args, options);
  for (const delay of BUSY_RETRY_DELAYS_MS) {
    if (!isRepoBusy(result)) return result;
    await sleep(delay);
    result = await runCliAttempt(config, args, options);
  }
  return result;
}

export function runCli(
  config: ServerConfig,
  args: string[],
  options: CliRunOptions = {},
): Promise<CliResult> {
  return enqueueCliTask(() => runCliWithRetry(config, args, options));
}
