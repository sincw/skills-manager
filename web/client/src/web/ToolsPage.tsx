import { useState } from "react";
import { FolderOpen, RefreshCw, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AgentIcon } from "../components/AgentIcon";
import { useWebApp } from "./WebAppContext";
import { EmptyState, Field, PageHeader } from "./ui";
import * as api from "../lib/tauri";

export function ToolsPage() {
  const { t } = useTranslation();
  const { tools, refreshAll } = useWebApp();
  const [mcpDirDrafts, setMcpDirDrafts] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const runSave = async (
    key: string,
    settings: { mcp_output_dir?: string | null; mcp_output_format?: string | null },
    success: string,
  ) => {
    setSavingKey(key);
    try {
      await api.setToolMcpSettings(key, settings);
      toast.success(success);
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="app-page">
      <PageHeader
        title={t("web.tools.title")}
        description={t("web.tools.description")}
        action={
          <button type="button" className="app-button-secondary" onClick={refreshAll}>
            <RefreshCw className="h-4 w-4" />
            {t("web.common.refresh")}
          </button>
        }
      />

      {tools.length === 0 ? (
        <EmptyState title={t("web.tools.noTools")} description={t("web.tools.noToolsDescription")} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {tools.map((tool) => {
            const formats =
              tool.supported_mcp_formats && tool.supported_mcp_formats.length > 0
                ? tool.supported_mcp_formats
                : ["toml", "json"];
            const dirValue = mcpDirDrafts[tool.key] ?? tool.mcp_output_dir ?? "";
            return (
              <section key={tool.key} className="app-panel p-4">
                <div className="mb-4 flex items-center gap-3">
                  <AgentIcon agentKey={tool.key} displayName={tool.display_name} className="h-9 w-9" />
                  <div className="min-w-0">
                    <h2 className="truncate text-[14px] font-semibold text-primary">{tool.display_name}</h2>
                    <p className="mt-1 text-[12px] text-muted">{tool.key}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  <Field label={t("web.fields.installed")} value={tool.installed ? t("web.common.yes") : t("web.common.no")} />
                  <Field label={t("web.fields.enabled")} value={tool.enabled ? t("web.common.yes") : t("web.common.no")} />
                  <Field label={t("web.fields.category")} value={tool.category} />
                  <Field label={t("web.fields.skillsDirectory")} value={tool.skills_dir || "-"} />
                </div>

                {tool.supports_mcp_profile !== false ? (
                  <div className="mt-4 space-y-3 border-t border-border-subtle pt-3">
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
                        {t("web.tools.mcpOutputDir")}
                      </p>
                      <div className="flex gap-2">
                        <input
                          className="app-input min-w-0 flex-1 font-mono text-[12px]"
                          value={dirValue}
                          onChange={(e) =>
                            setMcpDirDrafts((prev) => ({ ...prev, [tool.key]: e.target.value }))
                          }
                          placeholder={t("web.tools.mcpOutputDirPlaceholder")}
                        />
                        <button
                          type="button"
                          className="app-button-secondary"
                          disabled={savingKey === tool.key || !dirValue.trim()}
                          onClick={() =>
                            void runSave(
                              tool.key,
                              { mcp_output_dir: dirValue.trim() },
                              t("web.tools.mcpSaved"),
                            )
                          }
                          title={t("web.tools.saveMcp")}
                        >
                          <Save className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div>
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
                        {t("web.tools.mcpOutputFormat")}
                      </p>
                      <select
                        className="app-input"
                        value={tool.mcp_output_format ?? "toml"}
                        disabled={savingKey === tool.key}
                        onChange={(e) =>
                          void runSave(
                            tool.key,
                            { mcp_output_format: e.target.value },
                            t("web.tools.mcpSaved"),
                          )
                        }
                      >
                        {formats.map((fmt) => (
                          <option key={fmt} value={fmt}>
                            {fmt.toUpperCase()}
                          </option>
                        ))}
                      </select>
                      {!formats.includes("json") ? (
                        <p className="mt-1.5 text-[11px] text-muted">{t("web.tools.jsonHiddenHint")}</p>
                      ) : null}
                    </div>
                    {tool.mcp_output_dir ? (
                      <p className="flex items-center gap-1.5 text-[11px] text-muted">
                        <FolderOpen className="h-3 w-3" />
                        {tool.mcp_output_dir}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
