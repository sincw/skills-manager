import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { JsonValue, ServerConfig } from "./types.js";
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

async function checkWorkspaceCapability(
  ctx: RouteContext,
): Promise<Awaited<ReturnType<typeof runCli>>> {
  const result = await runCli(ctx.config, ["workspaces", "list"], {
    write: false,
    timeoutMs: 120000,
  });
  await ctx.operations.recordCommand(result, false);
  return result;
}

async function ensureWorkspaceCapability(
  reply: FastifyReply,
  ctx: RouteContext,
): Promise<boolean> {
  const result = await checkWorkspaceCapability(ctx);
  if (result.ok) return true;
  sendCli(reply, result);
  return false;
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

async function enqueueWorkspaceJob(
  request: FastifyRequest,
  reply: FastifyReply,
  ctx: RouteContext,
  type: string,
  requestBody: JsonValue,
  args: string[],
): Promise<void> {
  if (!(await ensureWorkspaceCapability(reply, ctx))) return;
  enqueueJob(request, reply, ctx, type, requestBody, args);
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

  app.get("/api/health", async () => {
    const workspace = await checkWorkspaceCapability(ctx);
    const capabilityError = workspaceCapabilityError(workspace);
    return {
      ok: true,
      platform: process.platform,
      tokenRequired: Boolean(config.token),
      cli: {
        path: config.cliPath,
        ready: workspace.exitCode !== null,
        workspaceCapable: workspace.ok,
        workspaceCapabilityError: capabilityError,
        error: capabilityError ?? workspace.error,
        exitCode: workspace.exitCode,
      },
    };
  });

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
    await enqueueWorkspaceJob(request, reply, ctx, "workspaces.global.sync", { skill: ref, tool }, [
      "workspaces",
      "global",
      "sync",
      tool,
      ref,
    ]);
  });
  app.delete<{ Params: { ref: string } }>("/api/skills/:ref/sync-tool", async (request, reply) => {
    const ref = refParam(request.params.ref);
    const tool = nonEmptyString(asRecord(request.body).tool, "tool");
    await enqueueWorkspaceJob(request, reply, ctx, "workspaces.global.unsync", { skill: ref, tool }, [
      "workspaces",
      "global",
      "unsync",
      tool,
      ref,
    ]);
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
    try {
      const skills = await fetchLeaderboardSkills(board, leaderboardCache);
      reply.send({ ok: true, data: skills });
    } catch (error) {
      request.log.warn({ err: error, board }, "Failed to fetch skills.sh leaderboard");
      reply.send({ ok: true, data: [] });
    }
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
    const args = ["presets", "create", name];
    if (description) args.push("--description", description);
    if (icon) args.push("--icon", icon);
    return directCli(request, reply, ctx, args, true);
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
      await enqueueWorkspaceJob(request, reply, ctx, "workspaces.global.delete-skill", { agent: agentKey, relative_path: relativePath }, [
        "workspaces",
        "global",
        "delete-skill",
        agentKey,
        relativePath,
      ]);
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
    return directCli(request, reply, ctx, ["workspaces", "list"]);
  });
  app.post("/api/projects", async (request, reply) => {
    const body = asRecord(request.body);
    const projectPath = expandLinuxPath(nonEmptyString(body.path, "path"));
    await enqueueWorkspaceJob(request, reply, ctx, "workspaces.add", { path: projectPath }, [
      "workspaces",
      "add",
      projectPath,
    ]);
  });
  app.post("/api/projects/linked", async (request, reply) => {
    const body = asRecord(request.body);
    const name = nonEmptyString(body.name, "name");
    const linkedPath = expandLinuxPath(nonEmptyString(body.path, "path"));
    await enqueueWorkspaceJob(request, reply, ctx, "workspaces.add-linked", { name, path: linkedPath }, [
      "workspaces",
      "add-linked",
      name,
      linkedPath,
    ]);
  });
  app.post("/api/projects/reorder", async (request, reply) => {
    const ids = stringArray(asRecord(request.body).ids, "ids");
    await enqueueWorkspaceJob(request, reply, ctx, "workspaces.reorder", { ids }, [
      "workspaces",
      "reorder",
      ...ids,
    ]);
  });
  app.delete<{ Params: { id: string } }>("/api/projects/:id", async (request, reply) => {
    const id = refParam(request.params.id);
    await enqueueWorkspaceJob(request, reply, ctx, "workspaces.remove", { id }, [
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
    const body = asRecord(request.body);
    const skill = nonEmptyString(body.skill, "skill");
    const agents = stringArray(body.agents, "agents");
    const id = refParam(request.params.id);
    await enqueueWorkspaceJob(request, reply, ctx, "workspaces.export", { workspace_id: id, skill, tools: agents }, [
      "workspaces",
      "export",
      id,
      skill,
      ...agents,
    ]);
  });
  app.delete<{ Params: { id: string; agent: string; relativePath: string } }>(
    "/api/projects/:id/skills/:agent/:relativePath",
    async (request, reply) => {
      const id = refParam(request.params.id);
      const agent = refParam(request.params.agent);
      const relativePath = refParam(request.params.relativePath);
      await enqueueWorkspaceJob(request, reply, ctx, "workspaces.delete-skill", { workspace_id: id, tool: agent, relative_path: relativePath }, [
        "workspaces",
        "delete-skill",
        id,
        agent,
        relativePath,
      ]);
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
