// Web companion adapter. This file intentionally keeps the upstream Tauri
// adapter's public surface so copied React views can keep importing
// ../lib/tauri while data flows through the local HTTP service.

export type ToolCategory = "coding" | "lobster";

export interface ToolInfo {
  key: string;
  display_name: string;
  installed: boolean;
  skills_dir: string;
  enabled: boolean;
  is_custom: boolean;
  has_path_override: boolean;
  project_relative_skills_dir: string | null;
  has_project_path_override: boolean;
  category: ToolCategory;
  supports_mcp_profile?: boolean;
  supported_mcp_formats?: string[];
  mcp_output_dir?: string | null;
  mcp_output_format?: string;
  has_mcp_path_override?: boolean;
  /** Fixed filename for whole-file MCP tools (e.g. Pi `mcp.json`). */
  mcp_output_filename?: string | null;
}

export interface McpServerSummary {
  id: string;
  name: string;
  description?: string | null;
  presets: string[];
  created_at: number;
  updated_at: number;
}

export interface McpServerDetail extends McpServerSummary {
  content: string;
  central_path: string;
}

export interface McpToolSyncStatus {
  status: string;
  path?: string;
  reason?: string;
}

export interface McpSyncResult {
  preset: string;
  profile_arg: string;
  tools: Record<string, McpToolSyncStatus>;
  preset_name_error?: string | null;
}

export interface ManagedSkill {
  id: string;
  name: string;
  description: string | null;
  source_type: string;
  source_ref: string | null;
  source_ref_resolved: string | null;
  source_subpath: string | null;
  source_branch: string | null;
  source_revision: string | null;
  remote_revision: string | null;
  update_status: string;
  last_checked_at: number | null;
  last_check_error: string | null;
  central_path: string;
  enabled: boolean;
  created_at: number;
  updated_at: number;
  status: string;
  targets: SkillTarget[];
  preset_ids: string[];
  tags: string[];
}

export interface SkillTarget {
  id: string;
  skill_id: string;
  tool: string;
  target_path: string;
  mode: string;
  status: string;
  synced_at: number | null;
}

export interface SkillToolToggle {
  tool: string;
  display_name: string;
  installed: boolean;
  globally_enabled: boolean;
  enabled: boolean;
}

export interface SkillDocument {
  skill_id: string;
  filename: string;
  content: string;
  central_path: string;
}

export interface SourceSkillDocument {
  skill_id: string;
  filename: string;
  content: string;
  source_label: string;
  revision: string;
}

export type SkillSourceDiffStatus = "added" | "removed" | "modified";
export type SkillSourceDiffContentKind = "text" | "binary" | "too_large" | "permission_only";

export interface SkillSourceDiffEntry {
  relative_path: string;
  status: SkillSourceDiffStatus;
  content_kind: SkillSourceDiffContentKind;
  original_text: string | null;
  updated_text: string | null;
  executable_before: boolean;
  executable_after: boolean;
}

export interface SkillSourceDiff {
  skill_id: string;
  source_label: string;
  revision: string;
  entries: SkillSourceDiffEntry[];
}

export interface Preset {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  skill_count: number;
  created_at: number;
  updated_at: number;
  active?: boolean;
}

export interface DiscoveredGroup {
  name: string;
  fingerprint: string | null;
  locations: { id: string; tool: string; found_path: string }[];
  imported: boolean;
  found_at: number;
}

export interface ScanResult {
  tools_scanned: number;
  skills_found: number;
  groups: DiscoveredGroup[];
}

export interface SkillsShSkill {
  id: string;
  skill_id: string;
  name: string;
  source: string;
  installs: number;
}

export interface SyncHealth {
  in_sync: number;
  project_newer: number;
  center_newer: number;
  diverged: number;
  project_only: number;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  workspace_type: "project" | "linked";
  linked_agent_name: string | null;
  supports_skill_toggle: boolean;
  sort_order: number;
  skill_count: number;
  sync_health: SyncHealth;
  created_at: number;
  updated_at: number;
}

export interface ProjectAgentTarget {
  key: string;
  display_name: string;
  enabled: boolean;
  installed: boolean;
  is_custom: boolean;
}

export interface DirectoryListing {
  path: string;
  parent: string | null;
  entries: Array<{
    name: string;
    path: string;
  }>;
}

export interface ProjectSkill {
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

export interface ProjectSkillDocument {
  skill_name: string;
  filename: string;
  content: string;
}

export interface BatchDeleteSkillsResult {
  deleted: number;
  failed: string[];
}

export interface GitSkillPreview {
  rel_path: string;
  name: string;
  description: string | null;
}

export interface GitPreviewResult {
  temp_dir: string;
  skills: GitSkillPreview[];
}

export interface SkillInstallItem {
  rel_path: string;
  name: string;
}

export interface BatchImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

/** Shape of the CLI AdoptReport returned as a job result. */
interface AdoptJobResult {
  adopted?: Array<{ skill_id: string; name: string }>;
  skipped?: Array<{ path: string; name: string; reason: string }>;
}

export interface UpdateSkillResult {
  skill: ManagedSkill;
  content_changed: boolean;
}

export interface BatchUpdateSkillsResult {
  refreshed: number;
  unchanged: number;
  failed: string[];
}

export interface AppUpdateInfo {
  has_update: boolean;
  current_version: string;
  latest_version: string;
  release_url: string;
}

export interface DiagnosticInfo {
  app_version: string;
  os: string;
  os_version: string;
  arch: string;
  central_repo_path: string;
  central_repo_path_overridden: boolean;
}

export interface LogExcerpt {
  log_path: string;
  excerpt: string;
  line_count: number;
  has_warnings: boolean;
}

export interface LogExportResult {
  zip_path: string;
  file_count: number;
}

export interface PanicInfo {
  timestamp: string;
  message: string;
}

export type GitUpstreamHealth =
  | "healthy"
  | "no_remote"
  | "no_upstream"
  | "unrelated_histories"
  | "detached";

export interface GitBackupStatus {
  is_repo: boolean;
  remote_url: string | null;
  branch: string | null;
  has_changes: boolean;
  ahead: number;
  behind: number;
  last_commit: string | null;
  last_commit_time: string | null;
  current_snapshot_tag: string | null;
  restored_from_tag: string | null;
  upstream_health: GitUpstreamHealth;
}

export interface GitBackupVersion {
  tag: string;
  commit: string;
  message: string;
  committed_at: string;
}

export interface WebJob {
  id: string;
  type: string;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  request: unknown;
  result: unknown;
  error: string | null;
}

export interface WebCommandRecord {
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

export interface RepoStatus {
  base_dir: string;
  skills_dir: string;
  db_path: string;
  metadata_dir: string;
  skill_count: number;
  preset_count: number;
  active_preset_id: string | null;
}

interface ApiEnvelope<T> {
  ok: boolean;
  command?: string[];
  durationMs?: number;
  data?: T;
  job?: WebJob;
  error?: string;
  stderr?: string;
}

interface CliSkillSummary {
  id: string;
  name: string;
  description: string | null;
  path: string;
  enabled: boolean;
  tags: string[];
  source_type: string;
  source_ref: string | null;
  presets: string[];
  targets?: SkillTarget[];
}

interface CliSkillDetail extends CliSkillSummary {
  skill_file: string;
  files: string[];
  markdown: string;
}

interface CliPreset {
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

const SETTINGS_PREFIX = "skills-manager-web.settings.";

function encodeRef(ref: string): string {
  return encodeURIComponent(ref);
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const envelope = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!response.ok || !envelope.ok) {
    throw new Error(envelope.error ?? `HTTP ${response.status}`);
  }
  if ("data" in envelope) return envelope.data as T;
  if ("job" in envelope) return envelope.job as T;
  return undefined as T;
}

function get<T>(url: string): Promise<T> {
  return request<T>(url);
}

function post<T>(url: string, body: unknown = {}): Promise<T> {
  return request<T>(url, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

function put<T>(url: string, body: unknown = {}): Promise<T> {
  return request<T>(url, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

function del<T>(url: string, body: unknown = {}): Promise<T> {
  return request<T>(url, {
    method: "DELETE",
    body: JSON.stringify(body),
  });
}

function isActiveJob(job: WebJob): boolean {
  return job.status === "queued" || job.status === "running";
}

async function waitForWebJobResult(job: WebJob): Promise<WebJob> {
  const started = Date.now();
  let current = job;
  while (isActiveJob(current)) {
    if (Date.now() - started > 15 * 60 * 1000) {
      throw new Error(`Operation ${job.id} timed out`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
    current = await getWebJob(job.id);
  }
  if (current.status === "failed") {
    throw new Error(current.error ?? "Operation failed");
  }
  if (current.status === "canceled") {
    throw new Error("Operation was canceled");
  }
  return current;
}

async function waitForQueuedWrite(jobPromise: Promise<WebJob>): Promise<WebJob> {
  return waitForWebJobResult(await jobPromise);
}

function unsupported(feature: string): Promise<never> {
  return Promise.reject(new Error(`${feature} is not supported in the Web companion yet`));
}

function ignoreArgs(..._args: unknown[]): void {
  void _args;
}

function now(): number {
  return Date.now();
}

function normalizeSkill(skill: CliSkillSummary, presets: CliPreset[] = []): ManagedSkill {
  const timestamp = now();
  const presetRefs = new Set<string>();
  for (const presetRef of skill.presets) {
    presetRefs.add(presetRef);
    const matchedPreset = presets.find((preset) => preset.id === presetRef || preset.name === presetRef);
    if (matchedPreset) {
      presetRefs.add(matchedPreset.id);
      presetRefs.add(matchedPreset.name);
    }
  }
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    source_type: skill.source_type,
    source_ref: skill.source_ref,
    source_ref_resolved: null,
    source_subpath: null,
    source_branch: null,
    source_revision: null,
    remote_revision: null,
    update_status: skill.source_type === "local" ? "local_only" : "unknown",
    last_checked_at: null,
    last_check_error: null,
    central_path: skill.path,
    enabled: skill.enabled,
    created_at: timestamp,
    updated_at: timestamp,
    status: "managed",
    targets: skill.targets ?? [],
    preset_ids: Array.from(presetRefs),
    tags: skill.tags ?? [],
  };
}

function toProjectAgentTarget(tool: ToolInfo): ProjectAgentTarget {
  return {
    key: tool.key,
    display_name: tool.display_name,
    enabled: tool.enabled,
    installed: tool.installed,
    is_custom: tool.is_custom,
  };
}

function normalizePreset(preset: CliPreset): Preset {
  const timestamp = now();
  return {
    id: preset.id,
    name: preset.name,
    description: preset.description,
    icon: preset.icon,
    sort_order: preset.sort_order,
    skill_count: preset.skill_count,
    created_at: preset.created_at ?? timestamp,
    updated_at: preset.updated_at ?? timestamp,
    active: preset.active,
  };
}

function settingsKey(key: string): string {
  return `${SETTINGS_PREFIX}${key}`;
}

export const getRepoStatus = () => get<RepoStatus>("/api/repo/status");

export const getWebJobs = () => get<WebJob[]>("/api/operations/jobs");

export const getWebJob = (id: string) => get<WebJob>(`/api/operations/jobs/${encodeRef(id)}`);

export const getWebCommands = () => get<WebCommandRecord[]>("/api/operations/commands");

export const setRepoPath = (path: string) => post<WebJob>("/api/repo/path", { path, confirm: true });

export const resetRepoPath = () => del<WebJob>("/api/repo/path", { confirm: true });

export const installSkill = (input: {
  reference: string;
  kind?: "auto" | "local" | "git" | "skillssh";
  name?: string;
  sync?: boolean;
  syncPreset?: string;
}) =>
  post<WebJob>("/api/skills/install", {
    reference: input.reference,
    kind: input.kind === "auto" ? undefined : input.kind,
    name: input.name,
    sync: input.sync,
    syncPreset: input.syncPreset,
  });

// Tools
export const getToolStatus = () => get<ToolInfo[]>("/api/tools");

export const setToolEnabled = (key: string, enabled: boolean) =>
  waitForQueuedWrite(
    put<WebJob>(`/api/tools/${encodeRef(key)}/enabled`, { enabled }),
  );

export const setAllToolsEnabled = (enabled: boolean) =>
  waitForQueuedWrite(put<WebJob>("/api/tools/enabled", { enabled }));

export const setToolMcpSupport = (key: string, enabled: boolean) =>
  waitForQueuedWrite(
    put<WebJob>(`/api/tools/${encodeRef(key)}/mcp-support`, { enabled }),
  );

export const setToolMcpFilename = (key: string, filename?: string | null) =>
  waitForQueuedWrite(
    put<WebJob>(`/api/tools/${encodeRef(key)}/mcp-filename`, {
      ...(filename !== undefined ? { filename: filename ?? "" } : {}),
    }),
  );
export const getToolOrder = async () => JSON.parse(localStorage.getItem("skills-manager:tool-order") ?? "[]") as string[];
export const setToolOrder = async (order: string[]) => {
  localStorage.setItem("skills-manager:tool-order", JSON.stringify(order));
};
export const setCustomToolPath = (key: string, toolPath: string) => {
  ignoreArgs(key, toolPath);
  return unsupported("Custom tool path editing");
};
export const resetCustomToolPath = (key: string) => {
  ignoreArgs(key);
  return unsupported("Custom tool path editing");
};
export const setCustomToolProjectPath = (key: string, projectPath: string | null) => {
  ignoreArgs(key, projectPath);
  return unsupported("Custom project path editing");
};
export const resetCustomToolProjectPath = (key: string) => {
  ignoreArgs(key);
  return unsupported("Custom project path editing");
};
export const addCustomTool = (key: string, name: string, toolPath: string, projectPath?: string) => {
  ignoreArgs(key, name, toolPath, projectPath);
  return unsupported("Custom tool management");
};
export const removeCustomTool = (key: string) => {
  ignoreArgs(key);
  return unsupported("Custom tool management");
};

// Skills
export const getManagedSkills = async () => {
  const [skills, presets] = await Promise.all([
    get<CliSkillSummary[]>("/api/skills"),
    get<CliPreset[]>("/api/presets").catch(() => []),
  ]);
  return skills.map((skill) => normalizeSkill(skill, presets));
};

export const getSkillsForPreset = async (presetId: string) => {
  const skills = await getManagedSkills();
  return skills.filter((skill) => skill.preset_ids.includes(presetId));
};

export const getSkillDocument = async (skillId: string): Promise<SkillDocument> => {
  const detail = await get<CliSkillDetail>(`/api/skills/${encodeRef(skillId)}`);
  return {
    skill_id: detail.id,
    filename: detail.skill_file.split("/").pop() ?? "SKILL.md",
    content: detail.markdown,
    central_path: detail.path,
  };
};

export const getSourceSkillDocument = async (skillId: string): Promise<SourceSkillDocument> => {
  const document = await getSkillDocument(skillId);
  return {
    skill_id: document.skill_id,
    filename: document.filename,
    content: document.content,
    source_label: "managed",
    revision: "current",
  };
};

export const getSkillSourceDiff = async (skillId: string): Promise<SkillSourceDiff> => ({
  skill_id: skillId,
  source_label: "managed",
  revision: "current",
  entries: [],
});

export const deleteManagedSkill = async (skillId: string) => {
  await post("/api/skills/remove-dry-run", { references: [skillId] });
  await del<WebJob>("/api/skills", { references: [skillId], confirm: true });
};

export const deleteManagedSkills = async (skillIds: string[]): Promise<BatchDeleteSkillsResult> => {
  await post("/api/skills/remove-dry-run", { references: skillIds });
  await del<WebJob>("/api/skills", { references: skillIds, confirm: true });
  return { deleted: skillIds.length, failed: [] };
};

export const installLocal = (sourcePath: string, name?: string) =>
  post<WebJob>("/api/skills/install", { reference: sourcePath, kind: "local", name });

export const installGit = (repoUrl: string, name?: string) =>
  post<WebJob>("/api/skills/install", { reference: repoUrl, kind: "git", name });

export const previewGitInstall = async (repoUrl: string): Promise<GitPreviewResult> => ({
  temp_dir: repoUrl,
  skills: [{ rel_path: ".", name: repoUrl.split("/").pop() ?? repoUrl, description: null }],
});

export const confirmGitInstall = (repoUrl: string, _tempDir: string, items: SkillInstallItem[]) =>
  post<WebJob>("/api/skills/install", {
    reference: repoUrl,
    kind: "git",
    name: items[0]?.name,
  });

export const cancelGitPreview = async (tempDir?: string) => {
  ignoreArgs(tempDir);
};

export const installFromSkillssh = (source: string, skillId: string) =>
  post<WebJob>("/api/skills/install", {
    reference: `${source}/${skillId}`,
    kind: "skillssh",
  });

export const cancelInstall = async (cancelKey?: string) => {
  ignoreArgs(cancelKey);
  return false;
};

export const checkSkillUpdate = async (skillId: string, force?: boolean): Promise<ManagedSkill> => {
  await post<WebJob>(`/api/skills/${encodeRef(skillId)}/check`, { force: force ?? false });
  const skills = await getManagedSkills();
  return skills.find((skill) => skill.id === skillId) ?? skills[0] ?? normalizeSkill({
    id: skillId,
    name: skillId,
    description: null,
    path: "",
    enabled: true,
    tags: [],
    source_type: "unknown",
    source_ref: null,
    presets: [],
  });
};

export const checkAllSkillUpdates = (force?: boolean) =>
  post<WebJob>("/api/skills/check-all", { force: force ?? false });

export const updateSkill = async (skillId: string): Promise<UpdateSkillResult> => {
  await post<WebJob>(`/api/skills/${encodeRef(skillId)}/update`);
  const skills = await getManagedSkills();
  const skill = skills.find((item) => item.id === skillId);
  if (!skill) throw new Error("Updated skill not found after refresh");
  return { skill, content_changed: true };
};

export const batchUpdateSkills = async (skillIds: string[]): Promise<BatchUpdateSkillsResult> => {
  if (skillIds.length === 0) return { refreshed: 0, unchanged: 0, failed: [] };
  await Promise.all(skillIds.map((id) => post<WebJob>(`/api/skills/${encodeRef(id)}/update`)));
  return { refreshed: skillIds.length, unchanged: 0, failed: [] };
};

export const reimportLocalSkill = async (skillId: string) => (await updateSkill(skillId)).skill;
export const relinkLocalSkillSource = (skillId: string, sourcePath: string) => {
  ignoreArgs(skillId, sourcePath);
  return unsupported("Relink local source");
};
export const detachLocalSkillSource = (skillId: string) => {
  ignoreArgs(skillId);
  return unsupported("Detach local source");
};

export const batchImportFolder = async (folderPath: string): Promise<BatchImportResult> => {
  const job = await waitForQueuedWrite(
    post<WebJob>("/api/skills/adopt", { paths: [folderPath], confirm: true }),
  );
  const data = job.result as AdoptJobResult | null;
  const adopted = data?.adopted?.length ?? 0;
  const skipped = data?.skipped?.length ?? 0;
  return { imported: adopted, skipped, errors: [] };
};

export const getAllTags = () => get<string[]>("/api/tags");

export const setSkillTags = async (skillId: string, tags: string[]) => {
  const current: string[] = await get<string[]>(`/api/skills/${encodeRef(skillId)}/tags`).catch(() => []);
  const toAdd = tags.filter((tag) => !current.includes(tag));
  const toRemove = current.filter((tag) => !tags.includes(tag));
  if (toAdd.length > 0) await post<WebJob>(`/api/skills/${encodeRef(skillId)}/tags`, { tags: toAdd });
  if (toRemove.length > 0) await del<WebJob>(`/api/skills/${encodeRef(skillId)}/tags`, { tags: toRemove });
};

export const removeDryRun = (references: string[]) =>
  post<unknown>("/api/skills/remove-dry-run", { references });

export const legacyEnableSkills = (references: string[]) =>
  post<WebJob>("/api/skills/legacy-enable", { references });

export const legacyDisableSkills = (references: string[]) =>
  post<WebJob>("/api/skills/legacy-disable", { references });

export const adoptSkills = (paths: string[], dryRun: boolean) =>
  post<unknown>("/api/skills/adopt", { paths, dryRun, confirm: !dryRun });

export const adoptGitSkill = (input: {
  path: string;
  gitUrl: string;
  gitSubpath?: string;
  dryRun: boolean;
}) =>
  post<unknown>("/api/skills/adopt-git", {
    path: input.path,
    gitUrl: input.gitUrl,
    gitSubpath: input.gitSubpath,
    dryRun: input.dryRun,
    confirm: !input.dryRun,
  });

// Sync
export const syncSkillToTool = async (skillId: string, toolKey: string) => {
  await waitForQueuedWrite(post<WebJob>(`/api/skills/${encodeRef(skillId)}/sync-tool`, { tool: toolKey }));
};
export const unsyncSkillFromTool = async (skillId: string, toolKey: string) => {
  await waitForQueuedWrite(del<WebJob>(`/api/skills/${encodeRef(skillId)}/sync-tool`, { tool: toolKey }));
};
export const getSkillToolToggles = async (skillId: string, _presetId: string): Promise<SkillToolToggle[]> => {
  void _presetId;
  const [tools, skills] = await Promise.all([getToolStatus(), getManagedSkills()]);
  const skill = skills.find((item) => item.id === skillId);
  const enabledTargets = new Set(skill?.targets.map((target) => target.tool) ?? []);
  return tools.map((tool) => ({
    tool: tool.key,
    display_name: tool.display_name,
    installed: tool.installed,
    globally_enabled: tool.enabled,
    enabled: enabledTargets.has(tool.key),
  }));
};
export const setSkillToolToggle = (
  skillId: string,
  presetId: string,
  toolKey: string,
  enabled: boolean,
) => {
  ignoreArgs(skillId, presetId, toolKey, enabled);
  return unsupported("Per-preset tool toggles");
};

// Scan / browse
export const scanLocalSkills = async (): Promise<ScanResult> => ({
  tools_scanned: 0,
  skills_found: 0,
  groups: [],
});
export const importExistingSkill = (sourcePath: string, name?: string) => {
  ignoreArgs(name);
  return post<WebJob>("/api/skills/adopt", { paths: [sourcePath], confirm: true });
};
export const importAllDiscovered = (fingerprints?: string[]) => {
  ignoreArgs(fingerprints);
  return unsupported("Import all discovered skills");
};

export const fetchLeaderboard = (tab?: string) => {
  const params = new URLSearchParams({ board: tab ?? "alltime" });
  return get<SkillsShSkill[]>(`/api/skills/leaderboard?${params.toString()}`);
};
export const searchSkillssh = async (query: string, limit?: number): Promise<SkillsShSkill[]> => {
  const params = new URLSearchParams({ q: query, limit: String(limit ?? 60) });
  const hits = await get<Array<{ install_ref: string; name: string; source: string; skill_id: string; installs: number }>>(
    `/api/skills/search?${params.toString()}`,
  );
  return hits.map((hit) => ({
    id: hit.install_ref,
    skill_id: hit.skill_id,
    name: hit.name,
    source: hit.source,
    installs: hit.installs,
  }));
};

// Settings
export const getSettings = async (key: string) => localStorage.getItem(settingsKey(key));
export const setSettings = async (key: string, value: string) => {
  localStorage.setItem(settingsKey(key), value);
};

export const getCentralRepoPath = async () => (await getRepoStatus()).base_dir;
export const getCentralRepoPathOverride = async () => null;
export const setCentralRepoPath = async (path?: string | null) => {
  if (path) {
    await setRepoPath(path);
    return path;
  }
  await resetRepoPath();
  return (await getRepoStatus()).base_dir;
};

export const appExit = () => unsupported("App exit");
export const hideToTray = () => unsupported("Tray");
export const openCentralRepoFolder = () => unsupported("Open local folder from browser");
export const checkAppUpdate = async (): Promise<AppUpdateInfo> => ({
  has_update: false,
  current_version: "web",
  latest_version: "web",
  release_url: "https://github.com/xingkongliang/skills-manager",
});
export const getDiagnosticInfo = async (): Promise<DiagnosticInfo> => {
  const status = await getRepoStatus();
  return {
    app_version: "web",
    os: navigator.platform,
    os_version: navigator.userAgent,
    arch: "browser",
    central_repo_path: status.base_dir,
    central_repo_path_overridden: false,
  };
};
export const getRecentLogExcerpt = async (): Promise<LogExcerpt> => ({
  log_path: "skills-manager-web command log",
  excerpt: JSON.stringify(await getWebCommands(), null, 2),
  line_count: 0,
  has_warnings: false,
});
export const exportLogsZip = (): Promise<LogExportResult> => unsupported("Log zip export");
export const checkLastPanic = async (): Promise<PanicInfo | null> => null;
export const clearLastPanic = async () => undefined;
export const logStartupEvent = async (event: string, timestamp: number) => {
  ignoreArgs(event, timestamp);
};

// Git Backup
export const gitBackupStatus = () => get<GitBackupStatus>("/api/git/status");
export const gitBackupFetch = () => gitBackupStatus();
export const gitBackupInit = () => post<WebJob>("/api/git/init", { confirm: true });
export const gitBackupSetRemote = (url: string) => post<WebJob>("/api/git/remote", { url, confirm: true });
export const gitBackupCommit = (message: string) => post<WebJob>("/api/git/commit", { message });
export const gitBackupPush = () => post<WebJob>("/api/git/push", { confirm: true });
export const gitBackupPull = () => post<WebJob>("/api/git/pull", { confirm: true });
export const gitBackupClone = (url: string) => post<WebJob>("/api/git/clone", { url, confirm: true });
export const gitBackupReclone = (url: string) => post<WebJob>("/api/git/clone", { url, confirm: true });
export const gitBackupCreateSnapshot = async () => {
  await gitBackupCommit("Web snapshot");
  return "queued";
};
export const gitBackupListVersions = (limit?: number) =>
  get<GitBackupVersion[]>(`/api/git/versions?limit=${limit ?? 20}`);
export const gitBackupRestoreVersion = (tag: string) => post<WebJob>("/api/git/restore", { tag, confirm: true });

// Presets
export const getPresets = async () => (await get<CliPreset[]>("/api/presets")).map(normalizePreset);
export const getActivePreset = async () => {
  const preset = await get<CliPreset | null>("/api/presets/current");
  return preset ? normalizePreset(preset) : null;
};
export const createPreset = async (name: string, description?: string, icon?: string): Promise<Preset> =>
  normalizePreset(await post<CliPreset>("/api/presets", { name, description, icon }));
export const updatePreset = (id: string, name: string, description?: string, icon?: string) => {
  ignoreArgs(id, name, description, icon);
  return unsupported("Preset editing");
};
export const deletePreset = (id: string) => {
  ignoreArgs(id);
  return unsupported("Preset deletion");
};
export const switchPreset = (id: string) => applyPresetToDefault(id);
export const applyPresetToDefault = (id: string) =>
  waitForQueuedWrite(post<WebJob>(`/api/presets/${encodeRef(id)}/apply`, { confirm: true }));
export const addSkillToPreset = (skillId: string, presetId: string) =>
  post<unknown>(`/api/presets/${encodeRef(presetId)}/skills`, { skills: [skillId] });
export const removeSkillFromPreset = (skillId: string, presetId: string) =>
  del<unknown>(`/api/presets/${encodeRef(presetId)}/skills`, { skills: [skillId] });
export const reorderPresets = async (ids: string[]) => {
  ignoreArgs(ids);
};
export const reorderProjects = (ids: string[]) => waitForQueuedWrite(post<WebJob>("/api/projects/reorder", { ids }));
export const getPresetSkillOrder = async (presetId: string) =>
  (await getSkillsForPreset(presetId)).map((skill) => skill.id);
export const reorderPresetSkills = async (presetId: string, skillIds: string[]) => {
  ignoreArgs(presetId, skillIds);
};

export const getProjects = () => get<Project[]>("/api/projects");
export const addProject = (path: string) => waitForQueuedWrite(post<WebJob>("/api/projects", { path }));
export const addLinkedWorkspace = (name: string, path: string) =>
  waitForQueuedWrite(post<WebJob>("/api/projects/linked", { name, path }));
export const removeProject = (id: string) =>
  waitForQueuedWrite(del<WebJob>(`/api/projects/${encodeRef(id)}`));
export const browseDirectories = (path?: string) => {
  const params = path?.trim()
    ? `?path=${encodeURIComponent(path.trim())}`
    : "";
  return get<DirectoryListing>(`/api/fs/directories${params}`);
};
export const scanProjects = async (rootPath: string): Promise<string[]> =>
  get<string[]>(`/api/projects/scan?root=${encodeURIComponent(rootPath)}`);
export const getProjectAgentTargets = async (projectId: string): Promise<ProjectAgentTarget[]> => {
  const tools = await get<ToolInfo[]>(`/api/projects/${encodeRef(projectId)}/agent-targets`);
  return tools.map(toProjectAgentTarget);
};
export const getProjectSkills = (projectId: string) =>
  get<ProjectSkill[]>(`/api/projects/${encodeRef(projectId)}/skills`);
export const getProjectSkillDocument = (
  projectId: string,
  relativePath: string,
  agent: string,
) =>
  get<ProjectSkillDocument>(
    `/api/projects/${encodeRef(projectId)}/skills/${encodeRef(agent)}/${encodeRef(relativePath)}/document`,
  );
export const importProjectSkillToCenter = (projectId: string, relativePath: string, agent: string) => {
  ignoreArgs(projectId, relativePath, agent);
  return unsupported("Project import");
};
export const exportSkillToProject = async (skillId: string, projectId: string, agents: string[]) => {
  await waitForQueuedWrite(
    post<WebJob>(`/api/projects/${encodeRef(projectId)}/skills/export`, { skill: skillId, agents }),
  );
};
export const updateProjectSkillToCenter = (projectId: string, relativePath: string, agent: string) => {
  ignoreArgs(projectId, relativePath, agent);
  return unsupported("Project update");
};
export const updateProjectSkillFromCenter = (projectId: string, relativePath: string, agent: string) => {
  ignoreArgs(projectId, relativePath, agent);
  return unsupported("Project update");
};
export const toggleProjectSkill = (
  projectId: string,
  relativePath: string,
  agent: string,
  enabled: boolean,
) => {
  ignoreArgs(projectId, relativePath, agent, enabled);
  return unsupported("Project skill toggle");
};
export const deleteProjectSkill = async (projectId: string, relativePath: string, agent: string) => {
  await waitForQueuedWrite(del<WebJob>(
    `/api/projects/${encodeRef(projectId)}/skills/${encodeRef(agent)}/${encodeRef(relativePath)}`,
  ));
};
export const slugifySkillNames = async (names: string[]) =>
  names.map((name) =>
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, ""),
  );

export const getGlobalLocalSkills = (agentKey: string): Promise<ProjectSkill[]> =>
  get<ProjectSkill[]>(`/api/workspaces/global/${encodeRef(agentKey)}/skills`);
export const getGlobalLocalSkillDocument = (agentKey: string, relativePath: string) =>
  get<ProjectSkillDocument>(
    `/api/workspaces/global/${encodeRef(agentKey)}/skills/${encodeRef(relativePath)}/document`,
  );
export const importGlobalLocalSkillToCenter = (agentKey: string, relativePath: string) => {
  ignoreArgs(agentKey, relativePath);
  return unsupported("Global workspace import");
};
export const updateGlobalLocalSkillFromCenter = (agentKey: string, relativePath: string) => {
  ignoreArgs(agentKey, relativePath);
  return unsupported("Global workspace update");
};
export const deleteGlobalLocalSkill = async (agentKey: string, relativePath: string) => {
  await waitForQueuedWrite(del<WebJob>(
    `/api/workspaces/global/${encodeRef(agentKey)}/skills/${encodeRef(relativePath)}`,
  ));
};

export const previewPreset = (id: string) =>
  get<unknown[]>(`/api/presets/${encodeRef(id)}/preview`);

export const deactivatePreset = (id?: string) =>
  waitForQueuedWrite(
    post<WebJob>("/api/presets/deactivate", {
      confirm: true,
      ...(id ? { preset: id } : {}),
    }),
  );

export const applyPreset = (id: string) => applyPresetToDefault(id);

export const syncPreset = (preset?: string, tool?: string, dryRun = false) =>
  post<unknown>("/api/skills/sync", {
    preset,
    tool,
    dryRun,
    confirm: !dryRun,
  });

export const updateAllSkills = () => post<WebJob>("/api/skills/update-all");

export const exportSkill = (reference: string, dest: string) =>
  post<WebJob>(`/api/skills/${encodeRef(reference)}/export`, { dest });

// MCP library
export const getMcpServers = () => get<McpServerSummary[]>("/api/mcp");

export const getMcpServer = (name: string) =>
  get<McpServerDetail>(`/api/mcp/${encodeRef(name)}`);

export const installMcpServer = (content: string, description?: string) =>
  waitForQueuedWrite(
    post<WebJob>("/api/mcp/install", {
      content,
      description: description?.trim() ? description.trim() : undefined,
    }),
  );

export const editMcpServer = (
  name: string,
  content?: string,
  description?: string | null,
) =>
  waitForQueuedWrite(
    put<WebJob>(`/api/mcp/${encodeRef(name)}`, {
      content: content?.trim() ? content : undefined,
      ...(description !== undefined ? { description: description ?? "" } : {}),
    }),
  );

export const removeMcpServer = (name: string) =>
  waitForQueuedWrite(del<WebJob>(`/api/mcp/${encodeRef(name)}`, { confirm: true }));

export const syncMcp = async (preset?: string): Promise<McpSyncResult | null> => {
  const job = await waitForQueuedWrite(post<WebJob>("/api/mcp/sync", { preset }));
  const result = job.result;
  if (!result || typeof result !== "object") return null;
  return result as McpSyncResult;
};

export const getPresetMcpServers = (presetRef: string) =>
  get<McpServerSummary[]>(`/api/presets/${encodeRef(presetRef)}/mcp`);

export const addMcpToPreset = (presetRef: string, servers: string[]) =>
  waitForQueuedWrite(
    post<WebJob>(`/api/presets/${encodeRef(presetRef)}/mcp`, { servers }),
  );

export const removeMcpFromPreset = (presetRef: string, servers: string[]) =>
  waitForQueuedWrite(
    del<WebJob>(`/api/presets/${encodeRef(presetRef)}/mcp`, { servers }),
  );

export const setToolMcpSettings = (
  key: string,
  settings: { mcp_output_dir?: string | null; mcp_output_format?: string | null },
) =>
  waitForQueuedWrite(
    put<WebJob>(`/api/tools/${encodeRef(key)}/mcp`, {
      mcp_output_dir: settings.mcp_output_dir ?? undefined,
      mcp_output_format: settings.mcp_output_format ?? undefined,
    }),
  );

/** Extract `command` from a single-server MCP TOML content for list excerpts. */
export function extractMcpCommand(content: string): string | null {
  const match = content.match(/^\s*command\s*=\s*"([^"]*)"/m)
    ?? content.match(/^\s*command\s*=\s*'([^']*)'/m);
  return match?.[1] ?? null;
}
