import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Plus, RefreshCw, Server, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PresetMcpTab } from "./PresetMcpTab";
import type { McpSyncResult, Preset, ToolInfo } from "../lib/tauri";
import * as api from "../lib/tauri";
import { getErrorMessage } from "../lib/error";
import { cn } from "../utils";

const EMPTY_TOML = `[mcp_servers.example]
command = "npx"
args = ["-y", "example-mcp"]
`;

function compactHomePath(path: string) {
  return path.replace(/^\/home\/[^/]+/, "~").replace(/^\/Users\/[^/]+/, "~");
}

function profilePathFor(tool: ToolInfo, presetName: string): string | null {
  const dir = tool.mcp_output_dir?.trim();
  if (!dir) return null;
  const base = dir.replace(/\/$/, "");
  const fixed = tool.mcp_output_filename?.trim();
  if (fixed) return `${base}/${fixed}`;
  const format = (tool.mcp_output_format ?? "toml").toLowerCase();
  const ext = format === "json" ? "json" : "toml";
  return `${base}/${presetName}.config.${ext}`;
}

export interface GlobalWorkspaceMcpTabProps {
  /** Tool-centric view (global workspace). When omitted, use first profile-capable tool from `tools`. */
  tool?: ToolInfo | null;
  /** Fallback tool list for project workspace (global MCP path resolution). */
  tools?: ToolInfo[];
  activePreset: Preset | null;
  /** Bump to force profile/membership refresh (e.g. after PresetBar apply). */
  refreshToken?: number;
  onMcpCountChange?: (count: number) => void;
  /** View-only: no install, no membership mutations. */
  readOnly?: boolean;
}

export function GlobalWorkspaceMcpTab({
  tool = null,
  tools = [],
  activePreset,
  refreshToken = 0,
  onMcpCountChange,
  readOnly = false,
}: GlobalWorkspaceMcpTabProps) {
  const { t } = useTranslation();

  const profileTool = useMemo(() => {
    if (tool) return tool;
    return tools.find((item) => item.supports_mcp_profile) ?? tools[0] ?? null;
  }, [tool, tools]);

  const supportsProfile = profileTool?.supports_mcp_profile === true;

  const [syncResult, setSyncResult] = useState<McpSyncResult | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [installContent, setInstallContent] = useState(EMPTY_TOML);
  const [joinActivePreset, setJoinActivePreset] = useState(true);
  const [busy, setBusy] = useState(false);
  const [membershipEpoch, setMembershipEpoch] = useState(0);
  const [memberCount, setMemberCount] = useState(0);

  const expectedPath = useMemo(() => {
    if (!activePreset || !profileTool || !supportsProfile) return null;
    return profilePathFor(profileTool, activePreset.name);
  }, [activePreset, profileTool, supportsProfile]);

  const toolStatus = useMemo(() => {
    const key = profileTool?.key;
    if (key && syncResult?.tools?.[key]) return syncResult.tools[key];
    if (!activePreset) return null;
    if (!supportsProfile) {
      return { status: "skipped", reason: "tool_does_not_support_profile_mcp" };
    }
    if (expectedPath) {
      return { status: "written", path: expectedPath };
    }
    return { status: "skipped", reason: "no_mcp_output_dir" };
  }, [activePreset, expectedPath, profileTool?.key, supportsProfile, syncResult]);

  const profilePath = toolStatus?.path ?? expectedPath;
  const profileArg = syncResult?.profile_arg ?? activePreset?.name ?? null;

  const refreshMembers = useCallback(async () => {
    // Badge semantics:
    // - tool-centric view: only count if this tool supports profile MCP
    // - project/readOnly view: count active-preset members when any tool can receive them
    const badgeEligible = tool
      ? supportsProfile
      : tools.some((item) => item.supports_mcp_profile) || supportsProfile;

    if (!activePreset || !badgeEligible) {
      setMemberCount(0);
      onMcpCountChange?.(0);
      return;
    }
    try {
      const members = await api.getPresetMcpServers(activePreset.id);
      setMemberCount(members.length);
      onMcpCountChange?.(members.length);
    } catch {
      setMemberCount(0);
      onMcpCountChange?.(0);
    }
  }, [activePreset, onMcpCountChange, supportsProfile, tool, tools]);

  /** Optional: re-run CLI mcp sync to confirm disk write path (also rewrites profile). */
  const refreshProfile = useCallback(async () => {
    if (!activePreset) {
      setSyncResult(null);
      await refreshMembers();
      return;
    }
    setProfileLoading(true);
    try {
      await refreshMembers();
      if (supportsProfile) {
        const report = await api.syncMcp(activePreset.id).catch(() => null);
        if (report) setSyncResult(report);
      } else if (profileTool) {
        setSyncResult({
          preset: activePreset.name,
          profile_arg: activePreset.name,
          tools: {
            [profileTool.key]: {
              status: "skipped",
              reason: "tool_does_not_support_profile_mcp",
            },
          },
        });
      }
    } catch (error) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      setProfileLoading(false);
    }
  }, [activePreset, profileTool, refreshMembers, supportsProfile, t]);

  useEffect(() => {
    void refreshMembers();
  }, [refreshMembers, refreshToken, membershipEpoch]);

  useEffect(() => {
    setJoinActivePreset(!!activePreset);
  }, [activePreset?.id]);

  const handleMembershipChange = useCallback(() => {
    if (readOnly) return;
    setMembershipEpoch((n) => n + 1);
    if (supportsProfile && activePreset) {
      void api
        .syncMcp(activePreset.id)
        .then((report) => {
          if (report) setSyncResult(report);
        })
        .catch(() => undefined);
    }
  }, [activePreset, readOnly, supportsProfile]);

  const handleInstall = async () => {
    if (readOnly || !installContent.trim() || busy) return;
    setBusy(true);
    try {
      const job = await api.installMcpServer(installContent);
      const installedName =
        job.result && typeof job.result === "object" && "name" in (job.result as object)
          ? String((job.result as { name?: string }).name ?? "")
          : "";

      let joined = false;
      if (joinActivePreset && activePreset && installedName) {
        await api.addMcpToPreset(activePreset.id, [installedName]);
        joined = true;
      }

      toast.success(
        joined
          ? t("globalWorkspace.mcp.installedAndJoined", {
              name: installedName || t("globalWorkspace.mcp.server"),
              preset: activePreset?.name ?? "",
            })
          : t("globalWorkspace.mcp.installed"),
      );
      setInstallOpen(false);
      setInstallContent(EMPTY_TOML);
      handleMembershipChange();
    } catch (error) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = (() => {
    if (!activePreset) return t("globalWorkspace.mcp.profile.noActivePreset");
    if (!supportsProfile) return t("globalWorkspace.mcp.profile.unsupported");
    if (profileLoading) return t("common.loading");
    if (!toolStatus) return t("globalWorkspace.mcp.profile.unknown");
    if (toolStatus.status === "written") {
      return memberCount === 0
        ? t("globalWorkspace.mcp.profile.writtenEmpty")
        : t("globalWorkspace.mcp.profile.written");
    }
    if (toolStatus.status === "skipped") {
      if (toolStatus.reason === "tool_does_not_support_profile_mcp") {
        return t("globalWorkspace.mcp.profile.unsupported");
      }
      return t("globalWorkspace.mcp.profile.skipped", {
        reason: toolStatus.reason ?? "unknown",
      });
    }
    return toolStatus.status;
  })();

  const toolLabel = profileTool?.display_name ?? t("globalWorkspace.mcp.profile.toolFallback");

  return (
    <div className="space-y-4">
      {/* ① Profile status card */}
      <section className="app-panel p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[13px] font-semibold text-secondary">
                {t("globalWorkspace.mcp.profile.title")}
              </h2>
              {supportsProfile ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400"
                  title={t("globalWorkspace.mcp.profile.supportedBadge")}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {t("globalWorkspace.mcp.profile.supportedBadge")}
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-semibold text-red-600 dark:text-red-400"
                  title={t("globalWorkspace.mcp.profile.unsupportedBadge")}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  {t("globalWorkspace.mcp.profile.unsupportedBadge")}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[12px] text-muted">
              {readOnly
                ? t("globalWorkspace.mcp.profile.subtitleReadonly")
                : t("globalWorkspace.mcp.profile.subtitle", { tool: toolLabel })}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshProfile()}
            disabled={profileLoading || !activePreset}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle px-2.5 py-1.5 text-[12px] text-muted hover:bg-surface-hover hover:text-secondary disabled:opacity-50 outline-none"
            title={t("settings.refresh")}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", profileLoading && "animate-spin")} />
            {t("settings.refresh")}
          </button>
        </div>

        <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">
              {t("globalWorkspace.mcp.profile.activePreset")}
            </dt>
            <dd className="mt-0.5 font-medium text-secondary">
              {activePreset?.name ?? t("globalWorkspace.mcp.profile.none")}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">
              {t("globalWorkspace.mcp.profile.status")}
            </dt>
            <dd className="mt-0.5 font-medium text-secondary">{statusLabel}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">
              {t("globalWorkspace.mcp.profile.path")}
            </dt>
            <dd className="mt-0.5 break-all font-mono text-[12px] text-secondary">
              {profilePath
                ? compactHomePath(profilePath)
                : supportsProfile && activePreset
                  ? t("globalWorkspace.mcp.profile.pathPending")
                  : t("globalWorkspace.mcp.profile.pathNA")}
            </dd>
          </div>
          {supportsProfile && profileArg && !profileTool?.mcp_output_filename ? (
            <div className="sm:col-span-2">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">
                {t("globalWorkspace.mcp.profile.launch")}
              </dt>
              <dd className="mt-0.5 font-mono text-[12px] text-secondary">
                {profileTool?.key === "codex"
                  ? `codex --profile ${profileArg}`
                  : t("globalWorkspace.mcp.profile.launchGeneric", { arg: profileArg })}
              </dd>
            </div>
          ) : null}
          {supportsProfile && profileTool?.mcp_output_filename ? (
            <div className="sm:col-span-2">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">
                {t("globalWorkspace.mcp.profile.launch")}
              </dt>
              <dd className="mt-0.5 text-[12px] text-secondary">
                {t("globalWorkspace.mcp.profile.managedFileHint", {
                  file: profileTool.mcp_output_filename,
                })}
              </dd>
            </div>
          ) : null}
        </dl>

        {supportsProfile ? (
          <p className="mt-3 text-[12px] leading-relaxed text-muted">
            {t("globalWorkspace.mcp.profile.namingHint", {
              example: activePreset?.name ?? "test3",
            })}
          </p>
        ) : (
          <p className="mt-3 text-[12px] leading-relaxed text-muted">
            {t("globalWorkspace.mcp.profile.unsupportedHint")}{" "}
            <Link to="/mcp" className="text-accent hover:underline">
              {t("sidebar.mcpLibrary")}
            </Link>
          </p>
        )}

        {readOnly ? (
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            {t("globalWorkspace.mcp.profile.projectReadonlyHint")}{" "}
            <Link to="/mcp" className="text-accent hover:underline">
              {t("sidebar.mcpLibrary")}
            </Link>
          </p>
        ) : null}
      </section>

      {/* Unsupported tool: hide install + membership (only status card). */}
      {!supportsProfile && !readOnly ? (
        <div className="app-panel flex min-h-[120px] flex-col items-center justify-center px-4 text-center">
          <XCircle className="mb-2 h-8 w-8 text-red-500/80" />
          <p className="text-[13px] font-medium text-secondary">
            {t("globalWorkspace.mcp.profile.unsupported")}
          </p>
          <p className="mt-1 max-w-md text-[12px] text-muted">
            {t("globalWorkspace.mcp.profile.unsupportedHideHint")}{" "}
            <Link to="/settings" className="text-accent hover:underline">
              {t("settings.title")}
            </Link>
          </p>
        </div>
      ) : null}

      {/* ③ Install entry (global workspace only, profile-capable tools) */}
      {!readOnly && supportsProfile ? (
        <section className="app-panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-accent" />
              <h2 className="text-[13px] font-semibold text-secondary">
                {t("globalWorkspace.mcp.install.title")}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setInstallOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-[12px] font-medium text-white hover:bg-accent/90 outline-none"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("globalWorkspace.mcp.install.button")}
            </button>
          </div>

          {installOpen ? (
            <div className="mt-3 space-y-3">
              <p className="text-[12px] text-muted">{t("mcpLibrary.installHint")}</p>
              <textarea
                className="w-full min-h-[140px] rounded-lg border border-border-subtle bg-background px-3 py-2 font-mono text-[12px] text-secondary outline-none focus:border-accent"
                value={installContent}
                onChange={(e) => setInstallContent(e.target.value)}
                spellCheck={false}
              />
              <label
                className={cn(
                  "flex items-start gap-2 text-[12px] text-secondary",
                  !activePreset && "opacity-60",
                )}
              >
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={joinActivePreset && !!activePreset}
                  disabled={!activePreset || busy}
                  onChange={(e) => setJoinActivePreset(e.target.checked)}
                />
                <span>
                  {activePreset
                    ? t("globalWorkspace.mcp.install.joinActive", { name: activePreset.name })
                    : t("globalWorkspace.mcp.install.joinDisabled")}
                </span>
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md border border-border-subtle px-3 py-1.5 text-[12px] text-muted hover:bg-surface-hover outline-none"
                  onClick={() => setInstallOpen(false)}
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  disabled={!installContent.trim() || busy}
                  className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:bg-accent/90 disabled:opacity-50 outline-none"
                  onClick={() => void handleInstall()}
                >
                  {t("mcpLibrary.install")}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ② Active preset membership — hidden for non-supporting tools in tool-centric view */}
      {(supportsProfile || readOnly) ? (
      <section>
        <h2 className="mb-2 text-[13px] font-semibold text-secondary">
          {activePreset
            ? t("globalWorkspace.mcp.members.title", { name: activePreset.name })
            : t("globalWorkspace.mcp.members.titleNoPreset")}
        </h2>
        {activePreset ? (
          <PresetMcpTab
            key={`${activePreset.id}-${membershipEpoch}`}
            presetId={activePreset.id}
            onMembershipChange={handleMembershipChange}
            readOnly={readOnly}
            tools={profileTool ? [profileTool, ...tools] : tools}
          />
        ) : (
          <div className="app-panel flex min-h-[140px] flex-col items-center justify-center px-4 text-center">
            <p className="text-[13px] font-medium text-secondary">
              {t("globalWorkspace.mcp.members.noActiveTitle")}
            </p>
            <p className="mt-1 text-[12px] text-muted">
              {t("globalWorkspace.mcp.members.noActiveHint")}
            </p>
          </div>
        )}
      </section>
      ) : null}
    </div>
  );
}
