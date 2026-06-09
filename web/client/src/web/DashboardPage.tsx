import { useMemo } from "react";
import { Activity, Bot, GitBranch, Layers, RefreshCw, WandSparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useWebApp } from "./WebAppContext";
import { Field, JobStatusBadge, PageHeader, formatTime } from "./ui";

export function DashboardPage() {
  const { t } = useTranslation();
  const { repoStatus, tools, skills, presets, activePreset, jobs, loading, refreshAll } = useWebApp();
  const installedTools = useMemo(() => tools.filter((tool) => tool.installed), [tools]);
  const latestJobs = jobs.slice(0, 5);

  const cards = [
    { title: t("web.dashboard.skillsCard"), value: String(skills.length), icon: Layers, color: "text-accent-light", bg: "bg-accent-bg" },
    { title: t("web.dashboard.presetsCard"), value: String(presets.length), icon: WandSparkles, color: "text-sky-400", bg: "bg-sky-500/[0.08]" },
    { title: t("web.dashboard.installedToolsCard"), value: String(installedTools.length), icon: Bot, color: "text-amber-400", bg: "bg-amber-500/[0.08]" },
    {
      title: t("web.dashboard.activeJobsCard"),
      value: String(jobs.filter((job) => job.status === "queued" || job.status === "running").length),
      icon: Activity,
      color: "text-rose-400",
      bg: "bg-rose-500/[0.08]",
    },
  ];

  return (
    <div className="app-page">
      <PageHeader
        title={t("web.dashboard.title")}
        description={t("web.dashboard.description")}
        action={
          <button type="button" className="app-button-secondary" onClick={refreshAll} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            {t("web.common.refresh")}
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="app-panel flex items-center justify-between px-4 py-4">
              <div>
                <p className="app-section-title mb-1">{card.title}</p>
                <p className="text-xl font-semibold leading-none text-primary">{card.value}</p>
              </div>
              <div className={`rounded-md border border-border-subtle p-2 ${card.bg} ${card.color}`}>
                <Icon className="h-4 w-4" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="app-panel p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="app-section-title">{t("web.dashboard.repository")}</h2>
            <Link to="/settings" className="text-[13px] font-medium text-accent-light hover:text-accent">
              {t("web.common.configure")}
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label={t("web.fields.baseDirectory")} value={repoStatus?.base_dir ?? "-"} />
            <Field label={t("web.fields.skillsDirectory")} value={repoStatus?.skills_dir ?? "-"} />
            <Field label={t("web.fields.database")} value={repoStatus?.db_path ?? "-"} />
            <Field label={t("web.fields.metadata")} value={repoStatus?.metadata_dir ?? "-"} />
          </div>
        </section>

        <section className="app-panel p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="app-section-title">{t("web.dashboard.currentPreset")}</h2>
            <Link to="/presets" className="text-[13px] font-medium text-accent-light hover:text-accent">
              {t("web.common.manage")}
            </Link>
          </div>
          {activePreset ? (
            <div>
              <p className="text-[16px] font-semibold text-primary">{activePreset.name}</p>
              <p className="mt-1 text-[13px] text-muted">
                {t("web.dashboard.activePresetSkills", { count: activePreset.skill_count })}
              </p>
            </div>
          ) : (
            <p className="text-[13px] text-muted">{t("web.dashboard.noActivePreset")}</p>
          )}
        </section>
      </div>

      <section className="app-panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <h2 className="app-section-title">{t("web.dashboard.recentOperations")}</h2>
          <Link to="/operations" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-light hover:text-accent">
            <GitBranch className="h-3.5 w-3.5" />
            {t("web.common.viewAll")}
          </Link>
        </div>
        {latestJobs.length === 0 ? (
          <p className="px-4 py-5 text-[13px] text-muted">{t("web.dashboard.noJobsSession")}</p>
        ) : (
          <div className="divide-y divide-border-subtle">
            {latestJobs.map((job) => (
              <div key={job.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-secondary">{job.type}</p>
                  <p className="mt-1 text-[12px] text-muted">{formatTime(job.createdAt)}</p>
                </div>
                <JobStatusBadge status={job.status} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
