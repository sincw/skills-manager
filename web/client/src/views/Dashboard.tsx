import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Layers,
  CheckCircle2,
  Bot,
  Plus,
  Download,
  AlertTriangle,
  Server,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useApp } from "../context/AppContext";
import type { McpServerSummary } from "../lib/tauri";
import * as api from "../lib/tauri";
import { AgentIcon } from "../components/AgentIcon";

export function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { tools, projects, managedSkills, openSkillDetailById } = useApp();
  const [mcpServers, setMcpServers] = useState<McpServerSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    void api
      .getMcpServers()
      .then((list) => {
        if (!cancelled) setMcpServers(list);
      })
      .catch(() => {
        if (!cancelled) setMcpServers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const enabledAgents = useMemo(
    () => tools.filter((tool) => tool.installed && tool.enabled),
    [tools]
  );

  const mcpCapableAgents = useMemo(
    () => tools.filter((tool) => tool.installed && tool.enabled && tool.supports_mcp_profile),
    [tools]
  );

  const totalSkills = managedSkills.length;
  const totalMcp = mcpServers.length;
  const syncedSkills = useMemo(
    () => managedSkills.filter((s) => s.targets.length > 0).length,
    [managedSkills]
  );

  const divergedCount = useMemo(
    () => projects.reduce((acc, p) => acc + p.sync_health.diverged, 0),
    [projects]
  );

  const recentSkills = useMemo(
    () => [...managedSkills].sort((a, b) => b.updated_at - a.updated_at).slice(0, 5),
    [managedSkills]
  );

  const recentMcp = useMemo(
    () => [...mcpServers].sort((a, b) => b.updated_at - a.updated_at).slice(0, 5),
    [mcpServers]
  );

  const coverageLabel = totalSkills === 0 ? "0" : `${syncedSkills}/${totalSkills}`;
  const syncCardIcon = divergedCount > 0 ? AlertTriangle : CheckCircle2;
  const syncCardColor = divergedCount > 0 ? "text-amber-400" : "text-emerald-400";
  const syncCardBg = divergedCount > 0 ? "bg-amber-500/[0.08]" : "bg-emerald-500/[0.08]";

  return (
    <div className="app-page app-page-narrow">
      <div className="app-page-header">
        <h1 className="app-page-title">{t("dashboard.greeting")}</h1>
        <p className="app-page-subtitle text-tertiary">
          {t("dashboard.summary", {
            skills: totalSkills,
            mcp: totalMcp,
            agents: enabledAgents.length,
            projects: projects.length,
          })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        {[
          {
            title: t("dashboard.librarySkills"),
            value: String(totalSkills),
            icon: Layers,
            color: "text-accent-light",
            bg: "bg-accent-bg",
            onClick: () => navigate("/my-skills"),
          },
          {
            title: t("dashboard.libraryMcp"),
            value: String(totalMcp),
            icon: Server,
            color: "text-violet-400",
            bg: "bg-violet-500/[0.08]",
            onClick: () => navigate("/mcp"),
          },
          {
            title: t("dashboard.syncCoverage"),
            value: coverageLabel,
            icon: syncCardIcon,
            color: syncCardColor,
            bg: syncCardBg,
          },
          {
            title: t("dashboard.mcpCapableAgents"),
            value: String(mcpCapableAgents.length),
            icon: Bot,
            color: "text-sky-400",
            bg: "bg-sky-500/[0.08]",
            onClick: () => navigate("/settings"),
          },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div
              key={i}
              role={stat.onClick ? "button" : undefined}
              tabIndex={stat.onClick ? 0 : undefined}
              onClick={stat.onClick}
              onKeyDown={(e) => {
                if (!stat.onClick) return;
                if (e.key === "Enter" || e.key === " ") stat.onClick();
              }}
              className={`app-panel flex items-center justify-between px-4 py-4 transition-colors hover:border-border ${
                stat.onClick ? "cursor-pointer" : ""
              }`}
            >
              <div>
                <p className="app-section-title mb-1">{stat.title}</p>
                <h3 className="text-xl font-semibold text-primary leading-none">{stat.value}</h3>
              </div>
              <div className={`p-2 rounded-md ${stat.bg} ${stat.color} border border-border-subtle`}>
                <Icon className="w-4 h-4" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => navigate("/install?tab=local")}
          className="app-button-primary flex-1 min-w-[140px]"
        >
          <Download className="w-4 h-4" />
          {t("dashboard.scanImport")}
        </button>
        <button
          onClick={() => navigate("/install")}
          className="app-button-secondary flex-1 min-w-[140px]"
        >
          <Plus className="w-4 h-4 text-tertiary" />
          {t("dashboard.installNew")}
        </button>
        <button
          onClick={() => navigate("/mcp")}
          className="app-button-secondary flex-1 min-w-[140px]"
        >
          <Server className="w-4 h-4 text-tertiary" />
          {t("dashboard.installMcp")}
        </button>
      </div>

      {/* Recent skills */}
      {recentSkills.length > 0 && (
        <div>
          <h2 className="app-section-title mb-2.5">
            {t("dashboard.recentActivity")}
          </h2>
          <div className="app-panel overflow-hidden divide-y divide-border-subtle">
            {recentSkills.map((skill) => (
              <div
                key={skill.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  openSkillDetailById(skill.id);
                  navigate("/my-skills");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    openSkillDetailById(skill.id);
                    navigate("/my-skills");
                  }
                }}
                className="flex items-center justify-between px-3.5 py-2.5 hover:bg-surface-hover transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-[4px] flex items-center justify-center text-[13px] font-semibold bg-accent-bg text-accent-light shrink-0">
                    {skill.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="text-[13px] text-secondary font-medium flex items-center gap-1.5">
                      {skill.name}
                      <span className="text-[9px] px-1.5 py-px rounded bg-surface-hover text-muted border border-border font-normal">
                        {skill.source_type}
                      </span>
                    </h4>
                    <p className="text-[13px] text-muted mt-px">
                      {skill.targets.length > 0
                        ? `${t("dashboard.synced")} → ${skill.targets.map((target) => target.tool).join(", ")}`
                        : t("dashboard.notSynced")}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent MCP */}
      {recentMcp.length > 0 && (
        <div>
          <h2 className="app-section-title mb-2.5">
            {t("dashboard.recentMcp")}
          </h2>
          <div className="app-panel overflow-hidden divide-y divide-border-subtle">
            {recentMcp.map((server) => (
              <div
                key={server.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/mcp?name=${encodeURIComponent(server.name)}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    navigate(`/mcp?name=${encodeURIComponent(server.name)}`);
                  }
                }}
                className="flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-surface-hover transition-colors cursor-pointer"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] border border-border-subtle bg-violet-500/[0.08] text-violet-400">
                    <Server className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="truncate text-[13px] font-medium text-secondary">{server.name}</h4>
                    <p className="mt-px text-[12px] text-muted">
                      {server.presets.length > 0
                        ? t("dashboard.mcpInPresets", { count: server.presets.length })
                        : t("dashboard.mcpNoPresets")}
                    </p>
                  </div>
                </div>
                {mcpCapableAgents.length > 0 ? (
                  <div className="flex shrink-0 items-center gap-1">
                    {mcpCapableAgents.slice(0, 4).map((tool) => (
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
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
