import { appendFile } from "node:fs/promises";
import crypto from "node:crypto";
import type {
  AuditRecord,
  CliResult,
  CommandRecord,
  JobRecord,
  JsonValue,
  ServerConfig,
} from "./types.js";

function jsonLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

export class OperationsStore {
  private readonly jobs = new Map<string, JobRecord>();
  private readonly commands: CommandRecord[] = [];

  constructor(private readonly config: ServerConfig) {}

  listJobs(): JobRecord[] {
    return [...this.jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  getJob(id: string): JobRecord | null {
    return this.jobs.get(id) ?? null;
  }

  createJob(type: string, request: JsonValue): JobRecord {
    const job: JobRecord = {
      id: crypto.randomUUID(),
      type,
      status: "queued",
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
      request,
      result: null,
      error: null,
    };
    this.jobs.set(job.id, job);
    this.trimJobs();
    return job;
  }

  startJob(job: JobRecord): void {
    job.status = "running";
    job.startedAt = Date.now();
  }

  finishJob(job: JobRecord, result: JsonValue | null): void {
    job.status = "succeeded";
    job.finishedAt = Date.now();
    job.result = result;
  }

  failJob(job: JobRecord, error: string): void {
    job.status = "failed";
    job.finishedAt = Date.now();
    job.error = error;
  }

  async recordCommand(result: CliResult, write: boolean): Promise<CommandRecord> {
    const finishedAt = Date.now();
    const record: CommandRecord = {
      id: crypto.randomUUID(),
      startedAt: finishedAt - result.durationMs,
      finishedAt,
      durationMs: result.durationMs,
      command: result.command,
      write,
      ok: result.ok,
      exitCode: result.exitCode,
      error: result.error,
      stdout: result.stdout,
      stderr: result.stderr,
    };
    this.commands.unshift(record);
    this.commands.splice(200);
    await appendFile(this.config.commandLogPath, jsonLine(record), "utf8").catch(() => {});
    return record;
  }

  listCommands(): CommandRecord[] {
    return [...this.commands];
  }

  async audit(api: string, method: string, result: CliResult): Promise<void> {
    const record: AuditRecord = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      api,
      method,
      command: result.command,
      ok: result.ok,
      durationMs: result.durationMs,
      error: result.error,
    };
    await appendFile(this.config.auditLogPath, jsonLine(record), "utf8").catch(() => {});
  }

  private trimJobs(): void {
    const ordered = this.listJobs();
    for (const job of ordered.slice(200)) {
      this.jobs.delete(job.id);
    }
  }
}

export class WriteJobQueue {
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly store: OperationsStore) {}

  enqueue(
    type: string,
    request: JsonValue,
    task: () => Promise<JsonValue | null>,
  ): JobRecord {
    const job = this.store.createJob(type, request);
    this.tail = this.tail
      .catch(() => undefined)
      .then(async () => {
        this.store.startJob(job);
        try {
          const result = await task();
          this.store.finishJob(job, result);
        } catch (error) {
          this.store.failJob(job, error instanceof Error ? error.message : String(error));
        }
      });
    return job;
  }
}
