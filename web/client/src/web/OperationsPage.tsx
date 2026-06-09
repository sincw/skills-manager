import { RefreshCw, TerminalSquare } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { WebCommandRecord } from "../lib/tauri";
import * as api from "../lib/tauri";
import { useWebApp } from "./WebAppContext";
import { EmptyState, Field, JobStatusBadge, PageHeader, formatTime } from "./ui";

export function OperationsPage() {
  const { t } = useTranslation();
  const { jobs, refreshJobs } = useWebApp();
  const [commands, setCommands] = useState<WebCommandRecord[]>([]);

  const refresh = useCallback(async () => {
    await refreshJobs();
    setCommands(await api.getWebCommands());
  }, [refreshJobs]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="app-page">
      <PageHeader
        title={t("web.operations.title")}
        description={t("web.operations.description")}
        action={
          <button type="button" className="app-button-secondary" onClick={refresh}>
            <RefreshCw className="h-4 w-4" />
            {t("web.common.refresh")}
          </button>
        }
      />

      <section className="app-panel overflow-hidden">
        <div className="border-b border-border-subtle px-4 py-3">
          <h2 className="app-section-title">{t("web.operations.jobs")}</h2>
        </div>
        {jobs.length === 0 ? (
          <div className="p-4">
            <EmptyState title={t("web.operations.noJobs")} description={t("web.operations.noJobsDescription")} />
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {jobs.map((job) => (
              <div key={job.id} className="grid grid-cols-1 gap-3 px-4 py-3 lg:grid-cols-[1fr_160px_200px]">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-primary">{job.type}</p>
                  <p className="mt-1 truncate text-[12px] text-muted">{job.id}</p>
                  {job.error ? <p className="mt-2 text-[12px] text-red-500">{job.error}</p> : null}
                </div>
                <JobStatusBadge status={job.status} />
                <div className="text-[12px] text-muted">
                  <p>{formatTime(job.createdAt)}</p>
                  <p>{job.finishedAt ? formatTime(job.finishedAt) : "-"}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="app-panel overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
          <TerminalSquare className="h-4 w-4 text-muted" />
          <h2 className="app-section-title">{t("web.operations.commands")}</h2>
        </div>
        {commands.length === 0 ? (
          <div className="p-4">
            <EmptyState title={t("web.operations.noCommands")} description={t("web.operations.noCommandsDescription")} />
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {commands.map((command) => (
              <details key={command.id} className="group px-4 py-3">
                <summary className="flex cursor-pointer items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[12px] text-secondary">
                      {command.command.join(" ")}
                    </p>
                    <p className="mt-1 text-[12px] text-muted">
                      {formatTime(command.startedAt)} · {command.durationMs}ms
                    </p>
                  </div>
                  <span className={command.ok ? "text-[12px] text-emerald-500" : "text-[12px] text-red-500"}>
                    {command.ok ? t("web.common.ok") : t("web.common.failed")}
                  </span>
                </summary>
                <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
                  <Field label={t("web.fields.stdout")} value={<pre className="max-h-[220px] overflow-auto whitespace-pre-wrap font-mono text-[12px]">{command.stdout || "-"}</pre>} />
                  <Field label={t("web.fields.stderr")} value={<pre className="max-h-[220px] overflow-auto whitespace-pre-wrap font-mono text-[12px]">{command.stderr || "-"}</pre>} />
                </div>
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
