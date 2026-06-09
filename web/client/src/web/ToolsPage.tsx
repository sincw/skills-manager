import { RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AgentIcon } from "../components/AgentIcon";
import { useWebApp } from "./WebAppContext";
import { EmptyState, Field, PageHeader } from "./ui";

export function ToolsPage() {
  const { t } = useTranslation();
  const { tools, refreshAll } = useWebApp();

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
          {tools.map((tool) => (
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
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
