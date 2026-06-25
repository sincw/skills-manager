import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { JobRecord, JsonValue, ServerConfig } from "./types.js";
import { runCli } from "./cli.js";
import { OperationsStore, WriteJobQueue } from "./operations.js";
import {
  asRecord,
  boolValue,
  expandLinuxPath,
  limitValue,
  nonEmptyString,
  optionalString,
  refParam,
  requireConfirm,
  stringArray,
  validateGitUrl,
} from "./validation.js";

interface RouteContext {
  config: ServerConfig;
  operations: OperationsStore;
  queue: WriteJobQueue;
  removePreviews: Map<string, number>;
}

interface ProjectRegistryRecord {
  id: string;
  name: string;
  path: string;
  workspace_type: "project" | "linked";
  linked_agent_name: string | null;
  supports_skill_toggle: boolean;
  sort_order: number;
  skill_count: number;
  sync_health: {
    in_sync: number;
    project_newer: number;
    center_newer: number;
    diverged: number;
    project_only: number;
  };
  created_at: number;
  updated_at: number;
}

interface CliToolInfo {
  key: string;
  display_name: string;
  installed: boolean;
  skills_dir: string;
  enabled: boolean;
  is_custom: boolean;
  project_relative_skills_dir: string | null;
}

interface WorkspaceSkillRecord {
  name: string;
  dir_name: string;
  relative_path: string;
  description: string | null;
  path: string;
  files: string[];
  enabled: boolean;
  agent: string;
  agent_display_name: string;
  tags: string[];
  in_center: boolean;
  sync_status: "project_only" | "in_sync" | "project_newer" | "center_newer" | "diverged";
  center_skill_id: string | null;
}

interface WorkspaceSkillDocument {
  skill_name: string;
  filename: string;
  content: string;
}

type LeaderboardBoard = "alltime" | "trending" | "hot";

interface SkillsShSkill {
  id: string;
  skill_id: string;
  name: string;
  source: string;
  installs: number;
}

interface LeaderboardCacheEntry {
  timestamp: number;
  skills: SkillsShSkill[];
}

interface CliPresetInfo {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  skill_count: number;
  active: boolean;
  created_at?: number;
  updated_at?: number;
}

interface RepoStatusRecord {
  db_path: string;
  metadata_dir: string;
}

interface DbSkillRecord {
  id: string;
  name: string;
  description: string | null;
  central_path: string;
  content_hash: string | null;
}

interface SyncWriteReport {
  ok: true;
  skill_id: string;
  tool: string;
  target_path: string;
  mode: "copy";
}

interface ProjectExportReport {
  ok: true;
  skill_id: string;
  project_id: string;
  targets: Array<{
    agent: string;
    target_path: string;
  }>;
}

interface DirectoryListing {
  path: string;
  parent: string | null;
  entries: Array<{
    name: string;
    path: string;
  }>;
}

const LEADERBOARD_CACHE_TTL_MS = 5 * 60 * 1000;
const LEADERBOARD_URLS: Record<LeaderboardBoard, string> = {
  alltime: "https://skills.sh/",
  trending: "https://skills.sh/trending",
  hot: "https://skills.sh/hot",
};

function removePreviewKey(references: string[]): string {
  return references.map((ref) => ref.trim()).sort().join("\u0000");
}

function cleanupRemovePreviews(map: Map<string, number>): void {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [key, timestamp] of map) {
    if (timestamp < cutoff) map.delete(key);
  }
}

function normalizeBoard(value: unknown): LeaderboardBoard {
  if (value === "trending" || value === "hot" || value === "alltime") {
    return value;
  }
  if (value === undefined || value === null || value === "") {
    return "alltime";
  }
  throw new Error("board must be one of alltime, trending, hot");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseInstallCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

function parseSkillsArray(items: unknown[]): SkillsShSkill[] {
  const seen = new Set<string>();
  const skills: SkillsShSkill[] = [];

  for (const item of items) {
    if (!isRecord(item)) continue;
    const source = typeof item.source === "string" ? item.source : "";
    const skillId =
      typeof item.skillId === "string"
        ? item.skillId
        : typeof item.skill_id === "string"
          ? item.skill_id
          : typeof item.id === "string"
            ? item.id
            : "";

    if (!source || !skillId) continue;

    const id = `${source}/${skillId}`;
    if (seen.has(id)) continue;
    seen.add(id);

    skills.push({
      id,
      skill_id: skillId,
      name: typeof item.name === "string" && item.name ? item.name : skillId,
      source,
      installs: parseInstallCount(item.installs),
    });
  }

  return skills;
}

function parseNextData(html: string): SkillsShSkill[] {
  const marker = '<script id="__NEXT_DATA__" type="application/json">';
  const start = html.indexOf(marker);
  if (start < 0) return [];
  const contentStart = start + marker.length;
  const end = html.indexOf("</script>", contentStart);
  if (end < 0) return [];

  const parsed = JSON.parse(html.slice(contentStart, end)) as unknown;
  if (!isRecord(parsed)) return [];
  const props = isRecord(parsed.props) ? parsed.props : null;
  const pageProps = props && isRecord(props.pageProps) ? props.pageProps : null;
  const skills =
    pageProps && Array.isArray(pageProps.initialSkills)
      ? pageProps.initialSkills
      : pageProps && Array.isArray(pageProps.skills)
        ? pageProps.skills
        : pageProps && Array.isArray(pageProps.items)
          ? pageProps.items
          : null;

  return skills ? parseSkillsArray(skills) : [];
}

function parseEmbeddedSkillObjects(html: string): SkillsShSkill[] {
  const patterns = [
    /\\?"source\\?":\\?"(?<source>[^"\\]+)\\?",(?:[^{}]|\\.)*?(?:\\?"skillId\\?"|\\?"skill_id\\?"):\\?"(?<skill_id>[^"\\]+)\\?",(?:[^{}]|\\.)*?\\?"name\\?":\\?"(?<name>[^"\\]*)\\?",(?:[^{}]|\\.)*?\\?"installs\\?":(?<installs>\d+)/g,
    /\{"source":"(?<source>[^"]+)","skill_id":"(?<skill_id>[^"]+)"(?:,"name":"(?<name>[^"]*)")?(?:.*?"installs":(?<installs>\d+))?\}/g,
  ];

  for (const pattern of patterns) {
    const seen = new Set<string>();
    const skills: SkillsShSkill[] = [];
    for (const match of html.matchAll(pattern)) {
      const groups = match.groups;
      if (!groups) continue;
      const source = groups.source?.replace(/\\"/g, '"') ?? "";
      const skillId = groups.skill_id?.replace(/\\"/g, '"') ?? "";
      if (!source || !skillId) continue;

      const id = `${source}/${skillId}`;
      if (seen.has(id)) continue;
      seen.add(id);

      const rawName = groups.name?.replace(/\\"/g, '"') ?? "";
      skills.push({
        id,
        skill_id: skillId,
        name: rawName || skillId,
        source,
        installs: groups.installs ? Number.parseInt(groups.installs, 10) : 0,
      });
    }
    if (skills.length > 0) return skills;
  }

  return [];
}

function parseLeaderboardHtml(html: string): SkillsShSkill[] {
  const nextDataSkills = tryParseNextData(html);
  if (nextDataSkills.length > 0) return nextDataSkills;
  return parseEmbeddedSkillObjects(html);
}

function tryParseNextData(html: string): SkillsShSkill[] {
  try {
    return parseNextData(html);
  } catch {
    return [];
  }
}

async function fetchLeaderboardSkills(
  board: LeaderboardBoard,
  cache: Map<LeaderboardBoard, LeaderboardCacheEntry>,
): Promise<SkillsShSkill[]> {
  const cached = cache.get(board);
  if (cached && Date.now() - cached.timestamp < LEADERBOARD_CACHE_TTL_MS) {
    return cached.skills;
  }

  const response = await fetch(LEADERBOARD_URLS[board], {
    headers: { "User-Agent": "skills-manager-web" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch skills.sh leaderboard: HTTP ${response.status}`);
  }

  const html = await response.text();
  const skills = parseLeaderboardHtml(html);
  cache.set(board, { timestamp: Date.now(), skills });
  return skills;
}

function isRepoStatusRecord(value: unknown): value is RepoStatusRecord {
  return isRecord(value) && typeof value.db_path === "string" && typeof value.metadata_dir === "string";
}

function isUnsupportedPresetCreate(result: Awaited<ReturnType<typeof runCli>>): boolean {
  const message = `${result.error ?? ""}\n${result.stderr ?? ""}\n${result.stdout ?? ""}`;
  return message.includes("unrecognized subcommand") && message.includes("create");
}

function createPresetInDatabase(
  repoStatus: RepoStatusRecord,
  name: string,
  description: string | null,
  icon: string | null,
): CliPresetInfo {
  const id = crypto.randomUUID();
  const nowMs = Date.now();
  const sortOrder = 999;
  const db = new DatabaseSync(repoStatus.db_path);
  try {
    db.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
    db.exec("BEGIN IMMEDIATE;");
    try {
      db.prepare(
        "INSERT INTO scenarios (id, name, description, icon, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(id, name, description, icon, sortOrder, nowMs, nowMs);
      db.prepare("INSERT OR REPLACE INTO active_scenario (key, scenario_id) VALUES ('current', ?)").run(id);
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
  } finally {
    db.close();
  }

  return {
    id,
    name,
    description,
    icon,
    sort_order: sortOrder,
    skill_count: 0,
    active: true,
    created_at: nowMs,
    updated_at: nowMs,
  };
}

async function writePresetMetadata(repoStatus: RepoStatusRecord, preset: CliPresetInfo): Promise<void> {
  const metadataDir = repoStatus.metadata_dir;
  const scenariosDir = path.join(metadataDir, "scenarios");
  const membershipsDir = path.join(metadataDir, "scenario-skills");
  await mkdir(scenariosDir, { recursive: true });
  await mkdir(membershipsDir, { recursive: true });
  await writeFile(
    path.join(metadataDir, "schema.json"),
    `${JSON.stringify(
      {
        schema_version: 1,
        app_min_version: "2.0.0",
        created_by: "skills-manager",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    path.join(scenariosDir, `${preset.id}.json`),
    `${JSON.stringify(
      {
        schema_version: 1,
        scenario_id: preset.id,
        name: preset.name,
        description: preset.description,
        icon: preset.icon,
        sort_order: preset.sort_order,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await mkdir(path.join(membershipsDir, preset.id), { recursive: true });
}

async function createPresetCompat(
  request: FastifyRequest,
  ctx: RouteContext,
  name: string,
  description: string | null,
  icon: string | null,
): Promise<CliPresetInfo> {
  const args = ["presets", "create", name];
  if (description) args.push("--description", description);
  if (icon) args.push("--icon", icon);

  const createResult = await runCli(ctx.config, args, { write: true, timeoutMs: 15 * 60 * 1000 });
  await ctx.operations.recordCommand(createResult, true);
  await ctx.operations.audit(request.url, request.method, createResult);
  if (createResult.ok) {
    return createResult.data as unknown as CliPresetInfo;
  }
  if (!isUnsupportedPresetCreate(createResult)) {
    throw new Error(createResult.error ?? "Preset creation failed");
  }

  const repoStatus = await runAndRecord(request, ctx, ["repo", "status"], false);
  if (!isRepoStatusRecord(repoStatus)) {
    throw new Error("repo status did not include db_path and metadata_dir");
  }
  const preset = createPresetInDatabase(repoStatus, name, description, icon);
  await writePresetMetadata(repoStatus, preset);
  return preset;
}

function projectRegistryPath(config: ServerConfig): string {
  return path.join(config.dataDir, "projects.json");
}

function isProjectRegistryRecord(value: unknown): value is ProjectRegistryRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.path === "string" &&
    (record.workspace_type === "project" || record.workspace_type === "linked") &&
    (record.linked_agent_name === null || typeof record.linked_agent_name === "string") &&
    typeof record.supports_skill_toggle === "boolean" &&
    typeof record.sort_order === "number" &&
    typeof record.skill_count === "number" &&
    typeof record.created_at === "number" &&
    typeof record.updated_at === "number"
  );
}

async function ensureWorkspaceRegistryMigrated(
  request: FastifyRequest,
  ctx: RouteContext,
): Promise<void> {
  const registryPath = projectRegistryPath(ctx.config);
  const info = await stat(registryPath).catch(() => null);
  if (!info?.isFile()) return;
  const job = ctx.queue.enqueue(
    "workspaces.import-registry",
    { path: registryPath },
    () => runAndRecord(request, ctx, ["workspaces", "import-registry", registryPath], true),
  );
  await waitForQueuedJob(ctx, job);
}

async function waitForQueuedJob(ctx: RouteContext, job: JobRecord): Promise<void> {
  const started = Date.now();
  while (job.status === "queued" || job.status === "running") {
    if (Date.now() - started > 15 * 60 * 1000) {
      throw new Error("workspace registry migration timed out");
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
    const latest = ctx.operations.getJob(job.id);
    if (latest) job = latest;
  }
  if (job.status === "failed") {
    throw new Error(job.error ?? "workspace registry migration failed");
  }
}

async function readRegisteredWorkspaces(
  request: FastifyRequest,
  ctx: RouteContext,
): Promise<ProjectRegistryRecord[]> {
  await ensureWorkspaceRegistryMigrated(request, ctx);
  const data = await runAndRecord(request, ctx, ["workspaces", "list"], false);
  if (!Array.isArray(data)) return [];
  const projects: ProjectRegistryRecord[] = [];
  for (const item of data) {
    if (isProjectRegistryRecord(item)) projects.push(item);
  }
  return projects;
}

async function loadToolTargets(
  request: FastifyRequest,
  ctx: RouteContext,
): Promise<JsonValue | null> {
  return runAndRecord(request, ctx, ["tools", "list"], false);
}

function isCliToolInfo(value: unknown): value is CliToolInfo {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.key === "string" &&
    typeof record.display_name === "string" &&
    typeof record.installed === "boolean" &&
    typeof record.skills_dir === "string" &&
    typeof record.enabled === "boolean" &&
    typeof record.is_custom === "boolean" &&
    (record.project_relative_skills_dir === null || typeof record.project_relative_skills_dir === "string")
  );
}

async function readTools(
  request: FastifyRequest,
  ctx: RouteContext,
): Promise<CliToolInfo[]> {
  const rawTools = await loadToolTargets(request, ctx);
  if (!Array.isArray(rawTools)) return [];
  return (rawTools as unknown[]).filter(isCliToolInfo);
}

function extractMarkdownDescription(markdown: string): string | null {
  const lines = markdown.split(/\r?\n/);
  let inFrontmatter = lines[0] === "---";
  for (let index = inFrontmatter ? 1 : 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    if (inFrontmatter) {
      if (line === "---") {
        inFrontmatter = false;
      }
      continue;
    }
    if (!line || line.startsWith("#")) continue;
    return line.length > 180 ? `${line.slice(0, 177)}...` : line;
  }
  return null;
}

async function listSkillFiles(skillDir: string): Promise<string[]> {
  const entries = await readdir(skillDir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function readSkillsDirectory(
  rootDir: string,
  agent: Pick<CliToolInfo, "key" | "display_name">,
): Promise<WorkspaceSkillRecord[]> {
  const entries = await readdir(rootDir, { withFileTypes: true }).catch(() => []);
  const records: WorkspaceSkillRecord[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillDir = path.join(rootDir, entry.name);
    const skillFile = path.join(skillDir, "SKILL.md");
    const markdown = await readFile(skillFile, "utf8").catch(() => null);
    if (markdown === null) continue;
    const files = await listSkillFiles(skillDir);
    records.push({
      name: entry.name,
      dir_name: entry.name,
      relative_path: entry.name,
      description: extractMarkdownDescription(markdown),
      path: skillDir,
      files,
      enabled: true,
      agent: agent.key,
      agent_display_name: agent.display_name,
      tags: [],
      in_center: false,
      sync_status: "project_only",
      center_skill_id: null,
    });
  }
  return records.sort((a, b) => a.name.localeCompare(b.name));
}

async function readWorkspaceDocument(
  rootDir: string,
  relativePath: string,
): Promise<WorkspaceSkillDocument> {
  const skillDir = workspaceSkillTargetPath(rootDir, relativePath);
  const content = await readFile(path.join(skillDir, "SKILL.md"), "utf8");
  return {
    skill_name: path.basename(skillDir),
    filename: "SKILL.md",
    content,
  };
}

function projectSkillRoot(project: ProjectRegistryRecord, tool: CliToolInfo): string | null {
  if (project.workspace_type === "linked") {
    return project.path;
  }
  if (!tool.project_relative_skills_dir) return null;
  return path.join(project.path, tool.project_relative_skills_dir);
}

async function directoryExists(dir: string): Promise<boolean> {
  const info = await stat(dir).catch(() => null);
  return info?.isDirectory() ?? false;
}

async function browseDirectory(dir: string): Promise<DirectoryListing> {
  const current = path.resolve(dir);
  const info = await stat(current);
  if (!info.isDirectory()) {
    throw new Error("path must be a directory");
  }

  const entries = await readdir(current, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      path: path.join(current, entry.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const parent = path.dirname(current);
  return {
    path: current,
    parent: parent === current ? null : parent,
    entries: directories,
  };
}

function projectScanPaths(tools: CliToolInfo[]): string[] {
  return [
    ...new Set(
      tools
        .filter((tool) => tool.installed && tool.enabled && tool.project_relative_skills_dir)
        .map((tool) => tool.project_relative_skills_dir as string),
    ),
  ];
}

async function hasAnyProjectSkillsDir(dir: string, relativeSkillPaths: string[]): Promise<boolean> {
  for (const relativePath of relativeSkillPaths) {
    if (await directoryExists(path.join(dir, relativePath))) return true;
  }
  return false;
}

async function scanProjectDirectories(
  root: string,
  relativeSkillPaths: string[],
  maxDepth = 3,
): Promise<string[]> {
  if (relativeSkillPaths.length === 0) return [];

  const results: string[] = [];
  const rootPath = path.resolve(root);
  const rootInfo = await stat(rootPath);
  if (!rootInfo.isDirectory()) {
    throw new Error("root must be a directory");
  }

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    if (await hasAnyProjectSkillsDir(dir, relativeSkillPaths)) {
      results.push(dir);
      return;
    }
    if (depth === maxDepth) return;

    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (
        entry.name.startsWith(".") ||
        entry.name === "node_modules" ||
        entry.name === "target" ||
        entry.name === "__pycache__"
      ) {
        continue;
      }
      await walk(path.join(dir, entry.name), depth + 1);
    }
  }

  await walk(rootPath, 0);
  return results.sort();
}

function slugifySkillDirName(name: string): string {
  let out = "";
  let previousDash = false;
  for (const char of name.toLowerCase()) {
    const valid = /^[a-z0-9_.-]$/.test(char);
    if (valid) {
      out += char;
      previousDash = false;
    } else if (!previousDash) {
      out += "-";
      previousDash = true;
    }
  }
  const trimmed = out.replace(/^[-_.]+|[-_.]+$/g, "");
  return trimmed || "skill";
}

function targetDirName(centralPath: string, skillName: string): string {
  const base = path.basename(centralPath);
  return base || skillName;
}

async function removeTarget(target: string): Promise<void> {
  await rm(target, { recursive: true, force: true });
}

function workspaceSkillTargetPath(rootDir: string, relativePath: string): string {
  const normalizedRelativePath = path.normalize(relativePath);
  if (
    normalizedRelativePath === "." ||
    normalizedRelativePath.startsWith("..") ||
    path.isAbsolute(normalizedRelativePath)
  ) {
    throw new Error("relativePath must stay inside workspace");
  }
  const targetPath = path.join(rootDir, normalizedRelativePath);
  ensureTargetInsideRoot(targetPath, rootDir);
  return targetPath;
}

async function removeWorkspaceSkill(rootDir: string, relativePath: string): Promise<string> {
  const targetPath = workspaceSkillTargetPath(rootDir, relativePath);
  const info = await stat(targetPath).catch(() => null);
  if (!info?.isDirectory()) {
    throw new Error("workspace skill not found");
  }
  await removeTarget(targetPath);
  return targetPath;
}

async function copyDirRecursive(source: string, target: string): Promise<void> {
  await mkdir(target, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".git") continue;
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(sourcePath, targetPath);
    } else if (entry.isSymbolicLink()) {
      continue;
    } else if (entry.isFile()) {
      await copyFile(sourcePath, targetPath);
    }
  }
}

async function copySkillDirectory(source: string, target: string): Promise<void> {
  await removeTarget(target);
  await copyDirRecursive(source, target);
}

function ensureTargetInsideRoot(target: string, root: string): void {
  const relative = path.relative(root, target);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("target path must stay inside workspace root");
  }
}

function isDbSkillRecord(value: unknown): value is DbSkillRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    (value.description === null || typeof value.description === "string") &&
    typeof value.central_path === "string" &&
    (value.content_hash === null || typeof value.content_hash === "string")
  );
}

function readSkillFromDatabase(dbPath: string, skillId: string): DbSkillRecord {
  const db = new DatabaseSync(dbPath);
  try {
    const row = db
      .prepare("SELECT id, name, description, central_path, content_hash FROM skills WHERE id = ? OR name = ?")
      .get(skillId, skillId);
    if (!isDbSkillRecord(row)) {
      throw new Error(`skill not found: ${skillId}`);
    }
    return row;
  } finally {
    db.close();
  }
}

function readSkillTargetFromDatabase(dbPath: string, skillId: string, tool: string): string | null {
  const db = new DatabaseSync(dbPath);
  try {
    const row = db
      .prepare("SELECT target_path FROM skill_targets WHERE skill_id = ? AND tool = ?")
      .get(skillId, tool);
    if (!isRecord(row)) return null;
    return typeof row.target_path === "string" ? row.target_path : null;
  } finally {
    db.close();
  }
}

function deleteSkillTargetFromDatabase(dbPath: string, skillId: string, tool: string): void {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; BEGIN IMMEDIATE;");
    try {
      db
        .prepare("DELETE FROM skill_targets WHERE skill_id = ? AND tool = ?")
        .run(skillId, tool);
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
  } finally {
    db.close();
  }
}

function recordSkillTarget(dbPath: string, skill: DbSkillRecord, tool: string, targetPath: string): void {
  const nowMs = Date.now();
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; BEGIN IMMEDIATE;");
    try {
      db
        .prepare(
          "INSERT OR REPLACE INTO skill_targets (id, skill_id, tool, target_path, mode, status, synced_at, last_error, source_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(crypto.randomUUID(), skill.id, tool, targetPath, "copy", "ok", nowMs, null, skill.content_hash);
      db.exec("COMMIT;");
    } catch (error) {
      db.exec("ROLLBACK;");
      throw error;
    }
  } finally {
    db.close();
  }
}

async function syncSkillToToolCompat(
  request: FastifyRequest,
  ctx: RouteContext,
  skillId: string,
  toolKey: string,
): Promise<SyncWriteReport> {
  const [repoStatus, tools] = await Promise.all([
    runAndRecord(request, ctx, ["repo", "status"], false),
    readTools(request, ctx),
  ]);
  if (!isRepoStatusRecord(repoStatus)) {
    throw new Error("repo status did not include db_path and metadata_dir");
  }
  const tool = tools.find((item) => item.key === toolKey);
  if (!tool) throw new Error("agent not found");
  if (!tool.installed) throw new Error(`${tool.display_name} is not installed`);
  if (!tool.enabled) throw new Error(`${tool.display_name} is disabled`);

  const skill = readSkillFromDatabase(repoStatus.db_path, skillId);
  const targetPath = path.join(tool.skills_dir, targetDirName(skill.central_path, skill.name));
  ensureTargetInsideRoot(targetPath, tool.skills_dir);
  await copySkillDirectory(skill.central_path, targetPath);
  recordSkillTarget(repoStatus.db_path, skill, tool.key, targetPath);
  return { ok: true, skill_id: skill.id, tool: tool.key, target_path: targetPath, mode: "copy" };
}

async function unsyncSkillFromToolCompat(
  request: FastifyRequest,
  ctx: RouteContext,
  skillId: string,
  toolKey: string,
): Promise<SyncWriteReport> {
  const [repoStatus, tools] = await Promise.all([
    runAndRecord(request, ctx, ["repo", "status"], false),
    readTools(request, ctx),
  ]);
  if (!isRepoStatusRecord(repoStatus)) {
    throw new Error("repo status did not include db_path and metadata_dir");
  }
  const tool = tools.find((item) => item.key === toolKey);
  if (!tool) throw new Error("agent not found");

  const skill = readSkillFromDatabase(repoStatus.db_path, skillId);
  const recordedPath = readSkillTargetFromDatabase(repoStatus.db_path, skill.id, tool.key);
  const targetPath = recordedPath ?? path.join(tool.skills_dir, targetDirName(skill.central_path, skill.name));
  ensureTargetInsideRoot(targetPath, tool.skills_dir);
  await removeTarget(targetPath);
  deleteSkillTargetFromDatabase(repoStatus.db_path, skill.id, tool.key);
  return { ok: true, skill_id: skill.id, tool: tool.key, target_path: targetPath, mode: "copy" };
}

async function exportSkillToProjectCompat(
  request: FastifyRequest,
  ctx: RouteContext,
  project: ProjectRegistryRecord,
  skillId: string,
  agents: string[],
): Promise<ProjectExportReport> {
  if (agents.length === 0) throw new Error("agents must not be empty");
  const [repoStatus, tools] = await Promise.all([
    runAndRecord(request, ctx, ["repo", "status"], false),
    readTools(request, ctx),
  ]);
  if (!isRepoStatusRecord(repoStatus)) {
    throw new Error("repo status did not include db_path and metadata_dir");
  }

  const skill = readSkillFromDatabase(repoStatus.db_path, skillId);
  const dirName = slugifySkillDirName(skill.name);
  const toolByKey = new Map(tools.map((tool) => [tool.key, tool]));
  const targets: ProjectExportReport["targets"] = [];

  for (const agent of agents) {
    const tool = toolByKey.get(agent);
    if (!tool) throw new Error(`agent not found: ${agent}`);
    if (!tool.installed) throw new Error(`${tool.display_name} is not installed`);
    if (!tool.enabled) throw new Error(`${tool.display_name} is disabled`);
    const root = projectSkillRoot(project, tool);
    if (!root) throw new Error(`agent has no project skills path: ${agent}`);
    const targetPath = path.join(root, dirName);
    ensureTargetInsideRoot(targetPath, root);
    if (await directoryExists(targetPath)) {
      throw new Error(`Skill "${skill.name}" already exists in this workspace for agent ${agent}`);
    }
    await copySkillDirectory(skill.central_path, targetPath);
    targets.push({ agent, target_path: targetPath });
  }

  return { ok: true, skill_id: skill.id, project_id: project.id, targets };
}

function sendCli(reply: FastifyReply, result: Awaited<ReturnType<typeof runCli>>): void {
  const capabilityError = workspaceCapabilityError(result);
  const status = result.ok ? 200 : capabilityError ? 503 : 500;
  reply.code(status).send({
    ok: result.ok,
    command: result.command,
    durationMs: result.durationMs,
    data: capabilityError ? null : result.data ?? null,
    exitCode: result.exitCode,
    error: capabilityError ?? result.error,
    stderr: result.ok ? undefined : result.stderr,
  });
}

function workspaceCapabilityError(result: Awaited<ReturnType<typeof runCli>>): string | null {
  if (!result.command.includes("workspaces")) return null;
  const message = `${result.error ?? ""}\n${result.stderr ?? ""}\n${result.stdout ?? ""}`;
  if (
    message.includes("unrecognized subcommand") &&
    message.includes("workspaces")
  ) {
    return "Missing Workspace CLI capability. Upgrade or configure a skills-manager-cli with the workspaces command.";
  }
  return null;
}

async function runAndRecord(
  request: FastifyRequest,
  ctx: RouteContext,
  args: string[],
  write: boolean,
): Promise<JsonValue | null> {
  const result = await runCli(ctx.config, args, {
    write,
    timeoutMs: write ? 15 * 60 * 1000 : 120000,
  });
  await ctx.operations.recordCommand(result, write);
  if (write) {
    await ctx.operations.audit(request.url, request.method, result);
  }
  if (!result.ok) {
    throw new Error(result.error ?? "CLI command failed");
  }
  return result.data;
}

async function directCli(
  request: FastifyRequest,
  reply: FastifyReply,
  ctx: RouteContext,
  args: string[],
  write = false,
): Promise<void> {
  const result = await runCli(ctx.config, args, {
    write,
    timeoutMs: write ? 15 * 60 * 1000 : 120000,
  });
  await ctx.operations.recordCommand(result, write);
  if (write) {
    await ctx.operations.audit(request.url, request.method, result);
  }
  sendCli(reply, result);
}

function enqueueJob(
  request: FastifyRequest,
  reply: FastifyReply,
  ctx: RouteContext,
  type: string,
  requestBody: JsonValue,
  args: string[],
): void {
  const job = ctx.queue.enqueue(type, requestBody, () => runAndRecord(request, ctx, args, true));
  reply.code(202).send({ ok: true, job });
}

export async function registerRoutes(app: FastifyInstance, config: ServerConfig): Promise<void> {
  const operations = new OperationsStore(config);
  const queue = new WriteJobQueue(operations);
  const ctx: RouteContext = {
    config,
    operations,
    queue,
    removePreviews: new Map(),
  };
  const leaderboardCache = new Map<LeaderboardBoard, LeaderboardCacheEntry>();

  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/api/") || !config.token) return;
    const header = request.headers.authorization;
    if (header !== `Bearer ${config.token}`) {
      reply.code(401).send({ ok: false, error: "unauthorized" });
    }
  });

  app.get("/api/health", async () => ({
    ok: true,
    platform: process.platform,
    tokenRequired: Boolean(config.token),
  }));

  app.get("/api/config", async () => ({
    ok: true,
    data: {
      cliPath: config.cliPath,
      host: config.host,
      port: config.port,
      skillsRoot: config.skillsRoot,
      dataDir: config.dataDir,
      tokenRequired: Boolean(config.token),
    },
  }));

  app.get("/api/operations/jobs", async () => ({ ok: true, data: operations.listJobs() }));
  app.get<{ Params: { id: string } }>("/api/operations/jobs/:id", async (request, reply) => {
    const job = operations.getJob(request.params.id);
    if (!job) {
      reply.code(404).send({ ok: false, error: "job not found" });
      return;
    }
    return { ok: true, data: job };
  });
  app.get("/api/operations/commands", async () => ({ ok: true, data: operations.listCommands() }));

  app.get<{ Querystring: { path?: string } }>("/api/fs/directories", async (request, reply) => {
    try {
      const requestedPath =
        typeof request.query.path === "string" && request.query.path.trim() !== ""
          ? expandLinuxPath(request.query.path)
          : homedir();
      return { ok: true, data: await browseDirectory(requestedPath) };
    } catch (error) {
      reply.code(400);
      return {
        ok: false,
        error: error instanceof Error ? error.message : "failed to browse directory",
      };
    }
  });

  app.get("/api/repo/status", (request, reply) => directCli(request, reply, ctx, ["repo", "status"]));
  app.post("/api/repo/path", (request, reply) => {
    const body = asRecord(request.body);
    requireConfirm(body.confirm, "repo set-path");
    const path = expandLinuxPath(nonEmptyString(body.path, "path"));
    enqueueJob(request, reply, ctx, "repo.setPath", { path }, ["repo", "set-path", path]);
  });
  app.delete("/api/repo/path", (request, reply) => {
    const body = asRecord(request.body);
    requireConfirm(body.confirm, "repo reset-path");
    enqueueJob(request, reply, ctx, "repo.resetPath", {}, ["repo", "reset-path"]);
  });

  app.get("/api/tools", (request, reply) => directCli(request, reply, ctx, ["tools", "list"]));

  app.get("/api/skills", (request, reply) => directCli(request, reply, ctx, ["skills", "list"]));
  app.get<{ Params: { ref: string } }>("/api/skills/:ref", (request, reply) =>
    directCli(request, reply, ctx, ["skills", "show", refParam(request.params.ref)]),
  );
  app.post<{ Params: { ref: string } }>("/api/skills/:ref/sync-tool", async (request, reply) => {
    const ref = refParam(request.params.ref);
    const tool = nonEmptyString(asRecord(request.body).tool, "tool");
    const report = await syncSkillToToolCompat(request, ctx, ref, tool);
    reply.send({ ok: true, data: report });
  });
  app.delete<{ Params: { ref: string } }>("/api/skills/:ref/sync-tool", async (request, reply) => {
    const ref = refParam(request.params.ref);
    const tool = nonEmptyString(asRecord(request.body).tool, "tool");
    const report = await unsyncSkillFromToolCompat(request, ctx, ref, tool);
    reply.send({ ok: true, data: report });
  });
  app.post<{ Params: { ref: string } }>("/api/skills/:ref/export", (request, reply) => {
    const body = asRecord(request.body);
    const dest = expandLinuxPath(nonEmptyString(body.dest, "dest"));
    const ref = refParam(request.params.ref);
    enqueueJob(request, reply, ctx, "skills.export", { ref, dest }, [
      "skills",
      "export",
      ref,
      "--dest",
      dest,
    ]);
  });
  app.post("/api/skills/install", (request, reply) => {
    const body = asRecord(request.body);
    const reference = nonEmptyString(body.reference, "reference");
    const kind = optionalString(body.kind, "kind");
    const name = optionalString(body.name, "name");
    const syncPreset = optionalString(body.syncPreset, "syncPreset");
    const sync = boolValue(body.sync, "sync", false);
    const args = ["skills", "install", reference];
    if (kind === "local") args.push("--local");
    if (kind === "git") args.push("--git");
    if (kind === "skillssh") args.push("--skillssh");
    if (name) args.push("--name", name);
    if (syncPreset) args.push("--sync-preset", syncPreset);
    else if (sync) args.push("--sync");
    enqueueJob(request, reply, ctx, "skills.install", { reference, kind, name, sync, syncPreset }, args);
  });
  app.post<{ Params: { ref: string } }>("/api/skills/:ref/update", (request, reply) => {
    const ref = refParam(request.params.ref);
    enqueueJob(request, reply, ctx, "skills.update", { ref }, ["skills", "update", ref]);
  });
  app.post("/api/skills/update-all", (request, reply) =>
    enqueueJob(request, reply, ctx, "skills.updateAll", {}, ["skills", "update", "--all"]),
  );
  app.post<{ Params: { ref: string } }>("/api/skills/:ref/check", (request, reply) => {
    const body = asRecord(request.body);
    const ref = refParam(request.params.ref);
    const args = ["skills", "check", ref];
    if (boolValue(body.force, "force", false)) args.push("--force");
    enqueueJob(request, reply, ctx, "skills.check", { ref, force: Boolean(body.force) }, args);
  });
  app.post("/api/skills/check-all", (request, reply) => {
    const body = asRecord(request.body);
    const args = ["skills", "check", "--all"];
    if (boolValue(body.force, "force", false)) args.push("--force");
    enqueueJob(request, reply, ctx, "skills.checkAll", { force: Boolean(body.force) }, args);
  });
  app.post("/api/skills/remove-dry-run", async (request, reply) => {
    const body = asRecord(request.body);
    const references = stringArray(body.references, "references");
    await directCli(request, reply, ctx, ["skills", "remove", ...references, "--dry-run"]);
    cleanupRemovePreviews(ctx.removePreviews);
    ctx.removePreviews.set(removePreviewKey(references), Date.now());
  });
  app.delete("/api/skills", (request, reply) => {
    const body = asRecord(request.body);
    requireConfirm(body.confirm, "skills remove");
    const references = stringArray(body.references, "references");
    cleanupRemovePreviews(ctx.removePreviews);
    if (!ctx.removePreviews.has(removePreviewKey(references))) {
      reply.code(409).send({
        ok: false,
        error: "run remove dry-run for the same references before deleting",
      });
      return;
    }
    enqueueJob(request, reply, ctx, "skills.remove", { references }, [
      "skills",
      "remove",
      ...references,
      "--yes",
    ]);
  });
  app.post("/api/skills/legacy-enable", (request, reply) => {
    const references = stringArray(asRecord(request.body).references, "references");
    enqueueJob(request, reply, ctx, "skills.legacyEnable", { references }, ["skills", "enable", ...references]);
  });
  app.post("/api/skills/legacy-disable", (request, reply) => {
    const references = stringArray(asRecord(request.body).references, "references");
    enqueueJob(request, reply, ctx, "skills.legacyDisable", { references }, ["skills", "disable", ...references]);
  });
  app.post("/api/skills/sync", (request, reply) => {
    const body = asRecord(request.body);
    const preset = optionalString(body.preset, "preset");
    const tool = optionalString(body.tool, "tool");
    const dryRun = boolValue(body.dryRun, "dryRun", false);
    const args = ["skills", "sync"];
    if (preset) args.push("--preset", preset);
    if (tool) args.push("--tool", tool);
    if (dryRun) {
      args.push("--dry-run");
      directCli(request, reply, ctx, args);
      return;
    }
    requireConfirm(body.confirm, "skills sync");
    enqueueJob(request, reply, ctx, "skills.sync", { preset, tool }, args);
  });
  app.get("/api/skills/search", (request, reply) => {
    const query = nonEmptyString((request.query as Record<string, unknown>).q, "q");
    const limit = limitValue((request.query as Record<string, unknown>).limit, 60, 300);
    return directCli(request, reply, ctx, ["skills", "search", query, "--limit", String(limit)]);
  });
  app.get("/api/skills/leaderboard", async (request, reply) => {
    const board = normalizeBoard((request.query as Record<string, unknown>).board);
    const skills = await fetchLeaderboardSkills(board, leaderboardCache);
    reply.send({ ok: true, data: skills });
  });
  app.post("/api/skills/adopt", (request, reply) => {
    const body = asRecord(request.body);
    const paths = stringArray(body.paths, "paths").map(expandLinuxPath);
    const dryRun = boolValue(body.dryRun, "dryRun", false);
    const args = ["skills", "adopt", ...paths];
    if (dryRun) {
      args.push("--dry-run");
      directCli(request, reply, ctx, args);
      return;
    }
    requireConfirm(body.confirm, "skills adopt");
    enqueueJob(request, reply, ctx, "skills.adopt", { paths }, args);
  });
  app.post("/api/skills/adopt-git", (request, reply) => {
    const body = asRecord(request.body);
    const sourcePath = expandLinuxPath(nonEmptyString(body.path, "path"));
    const gitUrl = validateGitUrl(body.gitUrl, "gitUrl");
    const gitSubpath = optionalString(body.gitSubpath, "gitSubpath");
    const dryRun = boolValue(body.dryRun, "dryRun", false);
    const args = ["skills", "adopt", sourcePath, "--git-url", gitUrl];
    if (gitSubpath !== null) args.push("--git-subpath", gitSubpath);
    if (dryRun) {
      args.push("--dry-run");
      directCli(request, reply, ctx, args);
      return;
    }
    requireConfirm(body.confirm, "skills adopt-git");
    enqueueJob(request, reply, ctx, "skills.adoptGit", { path: sourcePath, gitUrl, gitSubpath }, args);
  });
  app.post<{ Params: { ref: string } }>("/api/skills/:ref/tags", (request, reply) => {
    const ref = refParam(request.params.ref);
    const tags = stringArray(asRecord(request.body).tags, "tags");
    enqueueJob(request, reply, ctx, "skills.tagAdd", { ref, tags }, ["skills", "tag", "add", ref, ...tags]);
  });
  app.delete<{ Params: { ref: string } }>("/api/skills/:ref/tags", (request, reply) => {
    const ref = refParam(request.params.ref);
    const tags = stringArray(asRecord(request.body).tags, "tags");
    enqueueJob(request, reply, ctx, "skills.tagRemove", { ref, tags }, [
      "skills",
      "tag",
      "remove",
      ref,
      ...tags,
    ]);
  });
  app.get("/api/tags", (request, reply) => directCli(request, reply, ctx, ["skills", "tag", "list"]));
  app.get<{ Params: { ref: string } }>("/api/skills/:ref/tags", (request, reply) =>
    directCli(request, reply, ctx, ["skills", "tag", "list", refParam(request.params.ref)]),
  );

  app.get("/api/presets", (request, reply) => directCli(request, reply, ctx, ["presets", "list"]));
  app.get("/api/presets/current", (request, reply) => directCli(request, reply, ctx, ["presets", "current"]));
  app.post("/api/presets", async (request, reply) => {
    const body = asRecord(request.body);
    const name = nonEmptyString(body.name, "name");
    const description = optionalString(body.description, "description");
    const icon = optionalString(body.icon, "icon");
    const preset = await createPresetCompat(request, ctx, name, description, icon);
    reply.send({ ok: true, data: preset });
  });
  app.get<{ Params: { ref: string } }>("/api/presets/:ref/preview", (request, reply) =>
    directCli(request, reply, ctx, ["presets", "preview", refParam(request.params.ref)]),
  );
  app.post<{ Params: { ref: string } }>("/api/presets/:ref/apply", (request, reply) => {
    requireConfirm(asRecord(request.body).confirm, "presets apply");
    const ref = refParam(request.params.ref);
    enqueueJob(request, reply, ctx, "presets.apply", { ref }, ["presets", "apply", ref]);
  });
  app.post<{ Params: { ref: string } }>("/api/presets/:ref/deactivate", (request, reply) => {
    requireConfirm(asRecord(request.body).confirm, "presets deactivate");
    const ref = refParam(request.params.ref);
    enqueueJob(request, reply, ctx, "presets.deactivate", { ref }, ["presets", "deactivate", ref]);
  });
  app.post<{ Params: { ref: string } }>("/api/presets/:ref/skills", (request, reply) => {
    const preset = refParam(request.params.ref);
    const skills = stringArray(asRecord(request.body).skills, "skills");
    return directCli(request, reply, ctx, [
      "presets",
      "add-skill",
      preset,
      ...skills,
    ], true);
  });
  app.delete<{ Params: { ref: string } }>("/api/presets/:ref/skills", (request, reply) => {
    const preset = refParam(request.params.ref);
    const skills = stringArray(asRecord(request.body).skills, "skills");
    return directCli(request, reply, ctx, [
      "presets",
      "remove-skill",
      preset,
      ...skills,
    ], true);
  });

  app.get<{ Params: { agent: string } }>("/api/workspaces/global/:agent/skills", async (request, reply) => {
    const agentKey = refParam(request.params.agent);
    return directCli(request, reply, ctx, ["workspaces", "global", "list-skills", agentKey]);
  });
  app.get<{ Params: { agent: string; relativePath: string } }>(
    "/api/workspaces/global/:agent/skills/:relativePath/document",
    async (request, reply) => {
      const agentKey = refParam(request.params.agent);
      const relativePath = refParam(request.params.relativePath);
      return directCli(request, reply, ctx, [
        "workspaces",
        "global",
        "document",
        agentKey,
        relativePath,
      ]);
    },
  );
  app.delete<{ Params: { agent: string; relativePath: string } }>(
    "/api/workspaces/global/:agent/skills/:relativePath",
    async (request, reply) => {
      const agentKey = refParam(request.params.agent);
      const relativePath = refParam(request.params.relativePath);
      const tools = await readTools(request, ctx);
      const tool = tools.find((item) => item.key === agentKey);
      if (!tool) {
        reply.code(404).send({ ok: false, error: "agent not found" });
        return;
      }
      try {
        const targetPath = await removeWorkspaceSkill(tool.skills_dir, relativePath);
        reply.send({ ok: true, data: { agent: tool.key, target_path: targetPath } });
      } catch (error) {
        const message = error instanceof Error ? error.message : "failed to delete global workspace skill";
        reply.code(message === "workspace skill not found" ? 404 : 400).send({ ok: false, error: message });
      }
    },
  );

  app.get<{ Querystring: { root?: string } }>("/api/projects/scan", async (request, reply) => {
    let root: string;
    try {
      root = expandLinuxPath(nonEmptyString(request.query.root, "root"));
    } catch (error) {
      reply.code(400);
      return {
        ok: false,
        error: error instanceof Error ? error.message : "failed to scan projects",
      };
    }
    const info = await stat(root).catch(() => null);
    if (!info?.isDirectory()) {
      reply.code(400);
      return { ok: false, error: "root must be a directory" };
    }
    return directCli(request, reply, ctx, ["workspaces", "scan", root]);
  });

  app.get("/api/projects", async (request, reply) => {
    await ensureWorkspaceRegistryMigrated(request, ctx);
    return directCli(request, reply, ctx, ["workspaces", "list"]);
  });
  app.post("/api/projects", async (request, reply) => {
    const body = asRecord(request.body);
    const projectPath = expandLinuxPath(nonEmptyString(body.path, "path"));
    await ensureWorkspaceRegistryMigrated(request, ctx);
    enqueueJob(request, reply, ctx, "workspaces.add", { path: projectPath }, [
      "workspaces",
      "add",
      projectPath,
    ]);
  });
  app.post("/api/projects/linked", async (request, reply) => {
    const body = asRecord(request.body);
    const name = nonEmptyString(body.name, "name");
    const linkedPath = expandLinuxPath(nonEmptyString(body.path, "path"));
    await ensureWorkspaceRegistryMigrated(request, ctx);
    enqueueJob(request, reply, ctx, "workspaces.add-linked", { name, path: linkedPath }, [
      "workspaces",
      "add-linked",
      name,
      linkedPath,
    ]);
  });
  app.post("/api/projects/reorder", async (request, reply) => {
    const ids = stringArray(asRecord(request.body).ids, "ids");
    await ensureWorkspaceRegistryMigrated(request, ctx);
    enqueueJob(request, reply, ctx, "workspaces.reorder", { ids }, [
      "workspaces",
      "reorder",
      ...ids,
    ]);
  });
  app.delete<{ Params: { id: string } }>("/api/projects/:id", async (request, reply) => {
    const id = refParam(request.params.id);
    await ensureWorkspaceRegistryMigrated(request, ctx);
    enqueueJob(request, reply, ctx, "workspaces.remove", { id }, [
      "workspaces",
      "remove",
      id,
    ]);
  });
  app.get<{ Params: { id: string } }>("/api/projects/:id/agent-targets", (request, reply) =>
    directCli(request, reply, ctx, ["workspaces", "agent-targets", refParam(request.params.id)]),
  );
  app.get<{ Params: { id: string } }>("/api/projects/:id/skills", (request, reply) =>
    directCli(request, reply, ctx, ["workspaces", "skills", refParam(request.params.id)]),
  );
  app.post<{ Params: { id: string } }>("/api/projects/:id/skills/export", async (request, reply) => {
    const id = refParam(request.params.id);
    const body = asRecord(request.body);
    const skill = nonEmptyString(body.skill, "skill");
    const agents = stringArray(body.agents, "agents");
    const projects = await readRegisteredWorkspaces(request, ctx);
    const project = projects.find((item) => item.id === id);
    if (!project) {
      reply.code(404).send({ ok: false, error: "project not found" });
      return;
    }
    const report = await exportSkillToProjectCompat(request, ctx, project, skill, agents);
    reply.send({ ok: true, data: report });
  });
  app.delete<{ Params: { id: string; agent: string; relativePath: string } }>(
    "/api/projects/:id/skills/:agent/:relativePath",
    async (request, reply) => {
      const id = refParam(request.params.id);
      const agentKey = refParam(request.params.agent);
      const relativePath = refParam(request.params.relativePath);
      const projects = await readRegisteredWorkspaces(request, ctx);
      const project = projects.find((item) => item.id === id);
      if (!project) {
        reply.code(404).send({ ok: false, error: "project not found" });
        return;
      }
      const tools = await readTools(request, ctx);
      const tool = tools.find((item) => item.key === agentKey);
      if (!tool) {
        reply.code(404).send({ ok: false, error: "agent not found" });
        return;
      }
      const rootDir = projectSkillRoot(project, tool);
      if (!rootDir) {
        reply.code(404).send({ ok: false, error: "project skill root not found" });
        return;
      }
      try {
        const targetPath = await removeWorkspaceSkill(rootDir, relativePath);
        reply.send({ ok: true, data: { project_id: project.id, agent: tool.key, target_path: targetPath } });
      } catch (error) {
        const message = error instanceof Error ? error.message : "failed to delete project skill";
        reply.code(message === "workspace skill not found" ? 404 : 400).send({ ok: false, error: message });
      }
    },
  );
  app.get<{ Params: { id: string; agent: string; relativePath: string } }>(
    "/api/projects/:id/skills/:agent/:relativePath/document",
    (request, reply) =>
      directCli(request, reply, ctx, [
        "workspaces",
        "document",
        refParam(request.params.id),
        refParam(request.params.agent),
        refParam(request.params.relativePath),
      ]),
  );

  app.get("/api/git/status", (request, reply) => directCli(request, reply, ctx, ["git", "status"]));
  app.post("/api/git/init", (request, reply) => {
    requireConfirm(asRecord(request.body).confirm, "git init");
    enqueueJob(request, reply, ctx, "git.init", {}, ["git", "init"]);
  });
  app.post("/api/git/clone", (request, reply) => {
    const url = validateGitUrl(asRecord(request.body).url);
    requireConfirm(asRecord(request.body).confirm, "git clone");
    enqueueJob(request, reply, ctx, "git.clone", { url }, ["git", "clone", url]);
  });
  app.post("/api/git/remote", (request, reply) => {
    const url = validateGitUrl(asRecord(request.body).url);
    requireConfirm(asRecord(request.body).confirm, "git set-remote");
    enqueueJob(request, reply, ctx, "git.setRemote", { url }, ["git", "set-remote", url]);
  });
  app.post("/api/git/pull", (request, reply) => {
    requireConfirm(asRecord(request.body).confirm, "git pull");
    enqueueJob(request, reply, ctx, "git.pull", {}, ["git", "pull"]);
  });
  app.post("/api/git/push", (request, reply) => {
    requireConfirm(asRecord(request.body).confirm, "git push");
    enqueueJob(request, reply, ctx, "git.push", {}, ["git", "push"]);
  });
  app.post("/api/git/commit", (request, reply) => {
    const message = nonEmptyString(asRecord(request.body).message, "message");
    enqueueJob(request, reply, ctx, "git.commit", { message }, ["git", "commit", "-m", message]);
  });
  app.get("/api/git/versions", (request, reply) => {
    const limit = limitValue((request.query as Record<string, unknown>).limit, 20, 200);
    return directCli(request, reply, ctx, ["git", "versions", "--limit", String(limit)]);
  });
  app.post("/api/git/restore", (request, reply) => {
    const tag = nonEmptyString(asRecord(request.body).tag, "tag");
    requireConfirm(asRecord(request.body).confirm, "git restore");
    enqueueJob(request, reply, ctx, "git.restore", { tag }, ["git", "restore", tag]);
  });
}
