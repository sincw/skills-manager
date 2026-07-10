import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Pencil, Plus, RefreshCw, Server, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { AgentIcon } from "../components/AgentIcon";
import type { McpServerDetail, McpServerSummary, ToolInfo } from "../lib/tauri";
import * as api from "../lib/tauri";
import { getErrorMessage } from "../lib/error";
import { cn } from "../utils";

const EMPTY_TOML = `[mcp_servers.example]
command = "npx"
args = ["-y", "example-mcp"]
`;

export function McpLibrary() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [servers, setServers] = useState<McpServerSummary[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [detail, setDetail] = useState<McpServerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [installOpen, setInstallOpen] = useState(false);
  const [installContent, setInstallContent] = useState(EMPTY_TOML);
  const [installDescription, setInstallDescription] = useState("");
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tools, setTools] = useState<ToolInfo[]>([]);

  const mcpCapableTools = useMemo(
    () => tools.filter((tool) => tool.supports_mcp_profile),
    [tools],
  );

  const loadServers = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.getMcpServers();
      setServers(list);
      setSelectedName((prev) => {
        if (prev && list.some((s) => s.name === prev)) return prev;
        return list[0]?.name ?? null;
      });
    } catch (error) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadServers();
  }, [loadServers]);

  useEffect(() => {
    void api.getToolStatus().then(setTools).catch(() => setTools([]));
  }, []);

  // Deep-link from preset MCP lists: /mcp?name=example2&edit=1
  useEffect(() => {
    const name = searchParams.get("name");
    if (!name) return;
    setSelectedName(name);
    if (searchParams.get("edit") === "1") {
      setEditing(true);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!selectedName) {
      setDetail(null);
      setEditContent("");
      setEditing(false);
      return;
    }
    let cancelled = false;
    const wantEdit = searchParams.get("edit") === "1" && searchParams.get("name") === selectedName;
    void (async () => {
      try {
        const next = await api.getMcpServer(selectedName);
        if (cancelled) return;
        setDetail(next);
        setEditContent(next.content);
        setEditDescription(next.description ?? "");
        setEditing(wantEdit);
        if (wantEdit) {
          // Consume edit query so refresh doesn't re-force edit mode.
          const nextParams = new URLSearchParams(searchParams);
          nextParams.delete("edit");
          setSearchParams(nextParams, { replace: true });
        }
      } catch (error) {
        if (!cancelled) toast.error(getErrorMessage(error, t("common.error")));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedName, t]);

  const selected = useMemo(
    () => servers.find((s) => s.name === selectedName) ?? null,
    [selectedName, servers],
  );

  const handleInstall = async () => {
    if (!installContent.trim() || busy) return;
    setBusy(true);
    try {
      await api.installMcpServer(installContent, installDescription);
      toast.success(t("mcpLibrary.installed"));
      setInstallOpen(false);
      setInstallContent(EMPTY_TOML);
      setInstallDescription("");
      await loadServers();
    } catch (error) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!selected || !editContent.trim() || busy) return;
    setBusy(true);
    try {
      await api.editMcpServer(selected.name, editContent, editDescription);
      toast.success(t("mcpLibrary.updated"));
      const next = await api.getMcpServer(selected.name);
      setDetail(next);
      setEditContent(next.content);
      setEditDescription(next.description ?? "");
      setEditing(false);
      await loadServers();
    } catch (error) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || busy) return;
    setBusy(true);
    try {
      await api.removeMcpServer(deleteTarget);
      toast.success(t("mcpLibrary.deleted"));
      setDeleteTarget(null);
      setSelectedName(null);
      setDetail(null);
      await loadServers();
    } catch (error) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="app-page">
      <div className="app-page-header flex items-center justify-between gap-3 pr-2 pb-1">
        <h1 className="app-page-title flex items-center gap-2">
          <Server className="h-4 w-4 text-accent" />
          {t("mcpLibrary.title")}
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void loadServers()}
            className="flex items-center gap-1.5 rounded-md border border-border-subtle px-2.5 py-1.5 text-[12px] text-muted hover:bg-surface-hover hover:text-secondary outline-none"
            title={t("common.retry")}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t("common.retry")}
          </button>
          <button
            type="button"
            onClick={() => setInstallOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1.5 text-[12px] font-medium text-white hover:bg-accent/90 outline-none"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("mcpLibrary.install")}
          </button>
        </div>
      </div>

      {installOpen ? (
        <section className="app-panel mb-4 p-4">
          <h2 className="mb-1 text-[13px] font-semibold text-secondary">{t("mcpLibrary.installTitle")}</h2>
          <p className="mb-3 text-[12px] text-muted">{t("mcpLibrary.installHint")}</p>
          <label className="mb-1 block text-[12px] font-medium text-secondary">
            {t("mcpLibrary.description")}
            <span className="ml-1 font-normal text-muted">{t("mcpLibrary.optional")}</span>
          </label>
          <input
            type="text"
            className="mb-3 h-9 w-full rounded-lg border border-border-subtle bg-background px-3 text-[13px] text-secondary outline-none focus:border-accent"
            value={installDescription}
            onChange={(e) => setInstallDescription(e.target.value)}
            placeholder={t("mcpLibrary.descriptionPlaceholder")}
          />
          <textarea
            className="w-full min-h-[160px] rounded-lg border border-border-subtle bg-background px-3 py-2 font-mono text-[12px] text-secondary outline-none focus:border-accent"
            value={installContent}
            onChange={(e) => setInstallContent(e.target.value)}
            spellCheck={false}
          />
          <div className="mt-3 flex justify-end gap-2">
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
        </section>
      ) : null}

      <div className="grid min-h-[560px] grid-cols-1 gap-4 xl:grid-cols-[300px_1fr]">
        <section className="app-panel overflow-hidden">
          {loading ? (
            <div className="p-4 text-[13px] text-muted">{t("common.loading")}</div>
          ) : servers.length === 0 ? (
            <div className="flex min-h-[180px] flex-col items-center justify-center px-4 text-center">
              <p className="text-[13px] font-medium text-secondary">{t("mcpLibrary.empty")}</p>
              <p className="mt-1 text-[12px] text-muted">{t("mcpLibrary.emptyHint")}</p>
            </div>
          ) : (
            <div className="divide-y divide-border-subtle">
              {servers.map((server) => (
                <button
                  type="button"
                  key={server.id}
                  onClick={() => setSelectedName(server.name)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover outline-none",
                    selected?.name === server.name && "bg-surface-active",
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-primary">{server.name}</p>
                    {server.description ? (
                      <p className="mt-0.5 truncate text-[12px] text-secondary">{server.description}</p>
                    ) : null}
                    <p className="mt-0.5 text-[11px] text-muted">
                      {server.presets.length > 0
                        ? t("mcpLibrary.presetCount", { count: server.presets.length })
                        : t("mcpLibrary.noPresets")}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="app-panel p-4">
          {selected && detail ? (
            <div className="flex h-full flex-col gap-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h2 className="truncate text-[16px] font-semibold text-primary">{detail.name}</h2>
                    {mcpCapableTools.length > 0 ? (
                      <div className="flex shrink-0 items-center gap-1">
                        {mcpCapableTools.map((tool) => (
                          <AgentIcon
                            key={tool.key}
                            agentKey={tool.key}
                            displayName={tool.display_name}
                            className="h-5 w-5 rounded-[4px]"
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate font-mono text-[11px] text-muted" title={detail.central_path}>
                    {detail.central_path}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-md border border-border-subtle px-2.5 py-1.5 text-[12px] text-muted hover:bg-surface-hover hover:text-secondary outline-none"
                    onClick={() => {
                      setEditing((v) => !v);
                      setEditContent(detail.content);
                      setEditDescription(detail.description ?? "");
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {editing ? t("common.cancel") : t("mcpLibrary.edit")}
                  </button>
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-md border border-red-500/30 px-2.5 py-1.5 text-[12px] text-red-500 hover:bg-danger-bg outline-none"
                    onClick={() => setDeleteTarget(detail.name)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {t("mcpLibrary.delete")}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                    {t("mcpLibrary.command")}
                  </p>
                  <p className="mt-1 truncate font-mono text-[12px] text-secondary">
                    {api.extractMcpCommand(detail.content) ?? "-"}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                    {t("mcpLibrary.presets")}
                  </p>
                  <p className="mt-1 text-[12px] text-secondary">
                    {detail.presets.length > 0 ? detail.presets.join(", ") : "-"}
                  </p>
                </div>
              </div>

              {editing ? (
                <div>
                  <p className="mb-2 text-[12px] text-muted">{t("mcpLibrary.editHint")}</p>
                  <label className="mb-1 block text-[12px] font-medium text-secondary">
                    {t("mcpLibrary.description")}
                    <span className="ml-1 font-normal text-muted">{t("mcpLibrary.optional")}</span>
                  </label>
                  <input
                    type="text"
                    className="mb-3 h-9 w-full rounded-lg border border-border-subtle bg-background px-3 text-[13px] text-secondary outline-none focus:border-accent"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder={t("mcpLibrary.descriptionPlaceholder")}
                  />
                  <textarea
                    className="w-full min-h-[280px] rounded-lg border border-border-subtle bg-background px-3 py-2 font-mono text-[12px] text-secondary outline-none focus:border-accent"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    spellCheck={false}
                  />
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-border-subtle px-3 py-1.5 text-[12px] text-muted hover:bg-surface-hover outline-none"
                      onClick={() => {
                        setEditing(false);
                        setEditContent(detail.content);
                        setEditDescription(detail.description ?? "");
                      }}
                    >
                      {t("common.cancel")}
                    </button>
                    <button
                      type="button"
                      disabled={!editContent.trim() || busy}
                      className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:bg-accent/90 disabled:opacity-50 outline-none"
                      onClick={() => void handleSaveEdit()}
                    >
                      {t("mcpLibrary.save")}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="mb-2 text-[12px] font-semibold text-secondary">{t("mcpLibrary.content")}</p>
                  <pre className="max-h-[420px] overflow-auto rounded-lg border border-border-subtle bg-bg-secondary p-3 font-mono text-[12px] text-secondary whitespace-pre-wrap">
                    {detail.content}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <div className="flex min-h-[180px] flex-col items-center justify-center text-center">
              <p className="text-[13px] font-medium text-secondary">{t("mcpLibrary.selectPrompt")}</p>
              <p className="mt-1 text-[12px] text-muted">{t("mcpLibrary.selectHint")}</p>
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title={t("mcpLibrary.deleteTitle")}
        message={t("mcpLibrary.deleteMessage", { name: deleteTarget ?? "" })}
        confirmLabel={t("mcpLibrary.delete")}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
