import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { McpServerDetail, McpServerSummary, ToolInfo } from "../lib/tauri";
import * as api from "../lib/tauri";
import { getErrorMessage } from "../lib/error";
import { AgentIcon } from "./AgentIcon";
import { cn } from "../utils";

interface PresetMcpTabProps {
  presetId: string;
  onMembershipChange?: () => void;
  /** When true, only list members — no add/remove controls. */
  readOnly?: boolean;
  /** Tools used to render which agents can receive MCP profiles. */
  tools?: ToolInfo[];
}

export function PresetMcpTab({
  presetId,
  onMembershipChange,
  readOnly = false,
  tools: toolsProp,
}: PresetMcpTabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [members, setMembers] = useState<McpServerSummary[]>([]);
  const [library, setLibrary] = useState<McpServerSummary[]>([]);
  const [details, setDetails] = useState<Record<string, McpServerDetail>>({});
  const [loading, setLoading] = useState(true);
  const [addName, setAddName] = useState("");
  const [busy, setBusy] = useState(false);
  const [tools, setTools] = useState<ToolInfo[]>(toolsProp ?? []);

  useEffect(() => {
    if (toolsProp) setTools(toolsProp);
  }, [toolsProp]);

  const mcpCapableTools = useMemo(
    () => tools.filter((tool) => tool.supports_mcp_profile),
    [tools],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [presetServers, allServers, toolList] = await Promise.all([
        api.getPresetMcpServers(presetId),
        api.getMcpServers(),
        toolsProp ? Promise.resolve(toolsProp) : api.getToolStatus().catch(() => [] as ToolInfo[]),
      ]);
      setMembers(presetServers);
      setLibrary(allServers);
      if (!toolsProp) setTools(toolList);

      const detailEntries = await Promise.all(
        presetServers.map(async (server) => {
          try {
            const detail = await api.getMcpServer(server.name);
            return [server.name, detail] as const;
          } catch {
            return null;
          }
        }),
      );
      const next: Record<string, McpServerDetail> = {};
      for (const entry of detailEntries) {
        if (entry) next[entry[0]] = entry[1];
      }
      setDetails(next);
    } catch (error) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      setLoading(false);
    }
  }, [presetId, t, toolsProp]);

  useEffect(() => {
    void load();
  }, [load]);

  const availableToAdd = useMemo(() => {
    const memberNames = new Set(members.map((m) => m.name));
    return library.filter((s) => !memberNames.has(s.name));
  }, [library, members]);

  const handleAdd = async () => {
    const name = addName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await api.addMcpToPreset(presetId, [name]);
      toast.success(t("mySkills.mcp.added", { name }));
      setAddName("");
      await load();
      onMembershipChange?.();
    } catch (error) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async (name: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await api.removeMcpFromPreset(presetId, [name]);
      toast.success(t("mySkills.mcp.removed", { name }));
      await load();
      onMembershipChange?.();
    } catch (error) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (name: string) => {
    navigate(`/mcp?name=${encodeURIComponent(name)}&edit=1`);
  };

  if (loading) {
    return <p className="py-8 text-center text-[13px] text-muted">{t("common.loading")}</p>;
  }

  return (
    <div className="space-y-4">
      {!readOnly ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 max-w-md">
            <select
              className={cn(
                "app-input h-9 w-full appearance-none rounded-md border border-border-subtle bg-surface pr-8 text-[13px] text-secondary outline-none transition-colors",
                "hover:border-border focus:border-accent",
                !addName && "text-muted",
              )}
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
            >
              <option value="">{t("mySkills.mcp.selectServer")}</option>
              {availableToAdd.map((server) => (
                <option key={server.id} value={server.name}>
                  {server.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          </div>
          <button
            type="button"
            disabled={!addName.trim() || busy}
            onClick={() => void handleAdd()}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-[12px] font-medium text-white hover:bg-accent/90 disabled:opacity-50 outline-none"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("mySkills.mcp.add")}
          </button>
        </div>
      ) : null}

      {members.length === 0 ? (
        <div className="app-panel flex min-h-[160px] flex-col items-center justify-center px-4 text-center">
          <p className="text-[13px] font-medium text-secondary">{t("mySkills.mcp.empty")}</p>
          <p className="mt-1 text-[12px] text-muted">
            {readOnly ? t("mySkills.mcp.emptyReadOnlyHint") : t("mySkills.mcp.emptyHint")}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
          {members.map((server) => {
            const content = details[server.name]?.content ?? "";
            const command = content ? api.extractMcpCommand(content) : null;
            return (
              <div
                key={server.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-[13px] font-medium text-secondary">{server.name}</p>
                    {mcpCapableTools.length > 0 ? (
                      <div className="flex shrink-0 items-center gap-1">
                        {mcpCapableTools.map((tool) => (
                          <AgentIcon
                            key={tool.key}
                            agentKey={tool.key}
                            displayName={tool.display_name}
                            className="h-4 w-4 rounded-[3px]"
                          />
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {server.description ? (
                    <p className="mt-0.5 truncate text-[12px] text-secondary">{server.description}</p>
                  ) : null}
                  <p className="mt-0.5 truncate font-mono text-[12px] text-muted">
                    {command ? `command = "${command}"` : t("mySkills.mcp.noCommand")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => openEdit(server.name)}
                    className="rounded-md p-2 text-muted hover:bg-surface-hover hover:text-secondary outline-none"
                    title={t("mySkills.mcp.edit")}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  {!readOnly ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleRemove(server.name)}
                      className="rounded-md p-2 text-muted hover:bg-danger-bg hover:text-red-500 disabled:opacity-50 outline-none"
                      title={t("mySkills.mcp.remove")}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
