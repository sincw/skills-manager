export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface ServerConfig {
  cliPath: string;
  host: string;
  port: number;
  token: string | null;
  skillsRoot: string | null;
  dataDir: string;
  auditLogPath: string;
  commandLogPath: string;
}

export interface CliRunOptions {
  timeoutMs?: number;
  write?: boolean;
  cwd?: string;
}

export interface CliResult {
  ok: boolean;
  command: string[];
  durationMs: number;
  data: JsonValue | null;
  exitCode: number | null;
  error: string | null;
  stdout: string;
  stderr: string;
}

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export interface JobRecord {
  id: string;
  type: string;
  status: JobStatus;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  request: JsonValue;
  result: JsonValue | null;
  error: string | null;
}

export interface CommandRecord {
  id: string;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  command: string[];
  write: boolean;
  ok: boolean;
  exitCode: number | null;
  error: string | null;
  stdout: string;
  stderr: string;
}

export interface AuditRecord {
  id: string;
  timestamp: number;
  api: string;
  method: string;
  command: string[];
  ok: boolean;
  durationMs: number;
  error: string | null;
}
