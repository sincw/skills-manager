import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ConfirmActionButton, EmptyState, Field, PageHeader } from "./ui";
import type { McpServerDetail, McpServerSummary } from "../lib/tauri";
import * as api from "../lib/tauri";

const EMPTY_TOML = `[mcp_servers.example]
command = "npx"
args = ["-y", "example-mcp"]
`;

export function McpPage() {
  const { t } = useTranslation();
  const [servers, setServers] = useState<McpServerSummary[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [detail, setDetail] = useState<McpServerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [installContent, setInstallContent] = useState(EMPTY_TOML);
  const [editContent, setEditContent] = useState("");
  const [editing, setEditing] = useState(false);
  const [showInstall, setShowInstall] = useState(false);

  const loadServers = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.getMcpServers();
      setServers(list);
      if (selectedName && !list.some((s) => s.name === selectedName)) {
        setSelectedName(list[0]?.name ?? null);
        setDetail(null);
        setEditing(false);
      } else if (!selectedName && list.length > 0) {
        setSelectedName(list[0].name);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [selectedName]);

  useEffect(() => {
    void loadServers();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  useEffect(() => {
    if (!selectedName) {
      setDetail(null);
      setEditContent("");
      setEditing(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const next = await api.getMcpServer(selectedName);
        if (cancelled) return;
        setDetail(next);
        setEditContent(next.content);
        setEditing(false);
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : String(error));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedName]);

  const selected = useMemo(
    () => servers.find((s) => s.name === selectedName) ?? servers[0] ?? null,
    [selectedName, servers],
  );

  const runAction = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast.success(success);
      await loadServers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleInstall = async () => {
    const content = installContent.trim();
    if (!content) return;
    await runAction(async () => {
      await api.installMcpServer(content);
      setShowInstall(false);
      setInstallContent(EMPTY_TOML);
    }, t("web.mcp.installQueued"));
  };

  const handleSaveEdit = async () => {
    if (!selected || !editContent.trim()) return;
    await runAction(async () => {
      await api.editMcpServer(selected.name, editContent);
      setEditing(false);
      const next = await api.getMcpServer(selected.name);
      setDetail(next);
      setEditContent(next.content);
    }, t("web.mcp.editQueued"));
  };

  return (
    <div className="app-page">
      <PageHeader
        title={t("web.mcp.title")}
        description={t("web.mcp.description")}
        action={
          <div className="flex gap-2">
            <button type="button" className="app-button-secondary" onClick={() => void loadServers()}>
              <RefreshCw className="h-4 w-4" />
              {t("web.common.refresh")}
            </button>
            <button
              type="button"
              className="app-button-primary"
              onClick={() => setShowInstall((v) => !v)}
            >
              <Plus className="h-4 w-4" />
              {t("web.mcp.install")}
            </button>
          </div>
        }
      />

      {showInstall ? (
        <section className="app-panel p-4">
          <h2 className="app-section-title mb-2">{t("web.mcp.installTitle")}</h2>
          <p className="mb-3 text-[12px] text-muted">{t("web.mcp.installHint")}</p>
          <textarea
            className="app-input min-h-[180px] font-mono text-[12px]"
            value={installContent}
            onChange={(event) => setInstallContent(event.target.value)}
            spellCheck={false}
          />
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              className="app-button-secondary"
              onClick={() => setShowInstall(false)}
            >
              {t("web.common.cancel")}
            </button>
            <button
              type="button"
              className="app-button-primary"
              disabled={!installContent.trim()}
              onClick={() => void handleInstall()}
            >
              {t("web.mcp.install")}
            </button>
          </div>
        </section>
      ) : null}

      <div className="grid min-h-[560px] grid-cols-1 gap-4 xl:grid-cols-[320px_1fr]">
        <section className="app-panel overflow-hidden">
          {loading ? (
            <div className="p-4 text-[13px] text-muted">{t("web.common.working")}</div>
          ) : servers.length === 0 ? (
            <div className="p-4">
              <EmptyState title={t("web.mcp.noServers")} description={t("web.mcp.noServersDescription")} />
            </div>
          ) : (
            <div className="divide-y divide-border-subtle">
              {servers.map((server) => (
                <button
                  type="button"
                  key={server.id}
                  onClick={() => setSelectedName(server.name)}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover ${
                    selected?.name === server.name ? "bg-surface-active" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-primary">{server.name}</p>
                    <p className="mt-1 text-[12px] text-muted">
                      {server.presets.length > 0
                        ? t("web.mcp.presetMembership", { count: server.presets.length })
                        : t("web.mcp.noPresets")}
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
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-[18px] font-semibold text-primary">{detail.name}</h2>
                  <p className="mt-1 text-[12px] text-muted">{detail.central_path}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="app-button-secondary"
                    onClick={() => {
                      setEditing((v) => !v);
                      setEditContent(detail.content);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                    {editing ? t("web.common.cancel") : t("web.mcp.edit")}
                  </button>
                  <ConfirmActionButton
                    className="app-button-secondary"
                    title={t("web.mcp.deleteTitle")}
                    message={t("web.mcp.deleteMessage", { name: detail.name })}
                    confirmLabel={t("web.mcp.delete")}
                    onConfirm={() =>
                      runAction(async () => {
                        await api.removeMcpServer(detail.name);
                        setSelectedName(null);
                        setDetail(null);
                      }, t("web.mcp.deleteQueued"))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                    {t("web.mcp.delete")}
                  </ConfirmActionButton>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field label={t("web.fields.id")} value={detail.id} />
                <Field
                  label={t("web.fields.presets")}
                  value={detail.presets.length > 0 ? detail.presets.join(", ") : "-"}
                />
                <Field
                  label={t("web.mcp.command")}
                  value={api.extractMcpCommand(detail.content) ?? "-"}
                />
              </div>

              {editing ? (
                <div>
                  <h3 className="app-section-title mb-2">{t("web.mcp.editTitle")}</h3>
                  <p className="mb-2 text-[12px] text-muted">{t("web.mcp.editHint")}</p>
                  <textarea
                    className="app-input min-h-[280px] font-mono text-[12px]"
                    value={editContent}
                    onChange={(event) => setEditContent(event.target.value)}
                    spellCheck={false}
                  />
                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      className="app-button-secondary"
                      onClick={() => {
                        setEditing(false);
                        setEditContent(detail.content);
                      }}
                    >
                      {t("web.common.cancel")}
                    </button>
                    <button
                      type="button"
                      className="app-button-primary"
                      disabled={!editContent.trim()}
                      onClick={() => void handleSaveEdit()}
                    >
                      {t("web.mcp.save")}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <h3 className="app-section-title mb-2">{t("web.mcp.content")}</h3>
                  <pre className="max-h-[420px] overflow-auto rounded-lg border border-border-subtle bg-bg-secondary p-3 font-mono text-[12px] text-secondary whitespace-pre-wrap">
                    {detail.content}
                  </pre>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              title={t("web.mcp.noServerSelected")}
              description={t("web.mcp.noServerSelectedDescription")}
            />
          )}
        </section>
      </div>
    </div>
  );
}
