import { useEffect, useState } from "react";
import { Download, GitBranch, RefreshCw, RotateCcw, Save, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ConfirmActionButton, EmptyState, Field, PageHeader } from "./ui";
import type { GitBackupStatus, GitBackupVersion } from "../lib/tauri";
import * as api from "../lib/tauri";

export function GitPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<GitBackupStatus | null>(null);
  const [versions, setVersions] = useState<GitBackupVersion[]>([]);
  const [remoteUrl, setRemoteUrl] = useState("");
  const [commitMessage, setCommitMessage] = useState(() => t("web.git.defaultCommitMessage"));
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const [nextStatus, nextVersions] = await Promise.all([
        api.gitBackupStatus(),
        api.gitBackupListVersions(30).catch(() => []),
      ]);
      setStatus(nextStatus);
      setVersions(nextVersions);
      setRemoteUrl(nextStatus.remote_url ?? "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const runAction = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast.success(success);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="app-page">
      <PageHeader
        title={t("web.git.title")}
        description={t("web.git.description")}
        action={
          <button type="button" className="app-button-secondary" onClick={refresh} disabled={loading}>
            <RefreshCw className="h-4 w-4" />
            {t("web.common.refresh")}
          </button>
        }
      />

      <section className="app-panel p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <Field label={t("web.fields.repository")} value={status?.is_repo ? t("web.git.initialized") : t("web.git.notInitialized")} />
          <Field label={t("web.fields.branch")} value={status?.branch ?? "-"} />
          <Field label={t("web.fields.aheadBehind")} value={`${status?.ahead ?? 0} / ${status?.behind ?? 0}`} />
          <Field label={t("web.fields.changes")} value={status?.has_changes ? t("web.git.pending") : t("web.git.clean")} />
        </div>
      </section>

      <section className="app-panel p-4">
        <h2 className="app-section-title mb-3">{t("web.git.remote")}</h2>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto_auto]">
          <input
            className="app-input"
            value={remoteUrl}
            onChange={(event) => setRemoteUrl(event.target.value)}
            placeholder={t("web.git.remotePlaceholder")}
          />
          <button
            type="button"
            className="app-button-secondary"
            disabled={!remoteUrl.trim()}
            onClick={() => runAction(() => api.gitBackupSetRemote(remoteUrl.trim()), t("web.git.setRemoteQueued"))}
          >
            <GitBranch className="h-4 w-4" />
            {t("web.git.setRemote")}
          </button>
          <ConfirmActionButton
            className="app-button-secondary"
            disabled={!remoteUrl.trim()}
            title={t("web.git.cloneTitle")}
            message={t("web.git.cloneMessage")}
            confirmLabel={t("web.git.clone")}
            onConfirm={() => runAction(() => api.gitBackupClone(remoteUrl.trim()), t("web.git.cloneQueued"))}
          >
            <Download className="h-4 w-4" />
            {t("web.git.clone")}
          </ConfirmActionButton>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="app-panel p-4">
          <h2 className="app-section-title mb-3">{t("web.git.actions")}</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="app-button-secondary" onClick={() => runAction(api.gitBackupInit, t("web.git.initQueued"))}>
              <GitBranch className="h-4 w-4" />
              {t("web.git.init")}
            </button>
            <ConfirmActionButton
              className="app-button-secondary"
              title={t("web.git.pullTitle")}
              message={t("web.git.pullMessage")}
              confirmLabel={t("web.git.pull")}
              onConfirm={() => runAction(api.gitBackupPull, t("web.git.pullQueued"))}
            >
              <Download className="h-4 w-4" />
              {t("web.git.pull")}
            </ConfirmActionButton>
            <button
              type="button"
              className="app-button-secondary"
              onClick={() => runAction(api.gitBackupPush, t("web.git.pushQueued"))}
            >
              <Upload className="h-4 w-4" />
              {t("web.git.push")}
            </button>
          </div>
          <div className="mt-4 flex gap-2">
            <input
              className="app-input min-w-0 flex-1"
              value={commitMessage}
              onChange={(event) => setCommitMessage(event.target.value)}
              placeholder={t("web.git.commitPlaceholder")}
            />
            <button
              type="button"
              className="app-button-primary"
              disabled={!commitMessage.trim()}
              onClick={() => runAction(() => api.gitBackupCommit(commitMessage.trim()), t("web.git.commitQueued"))}
            >
              <Save className="h-4 w-4" />
              {t("web.git.commitButton")}
            </button>
          </div>
        </div>

        <div className="app-panel p-4">
          <h2 className="app-section-title mb-3">{t("web.git.lastCommit")}</h2>
          <div className="grid grid-cols-1 gap-4">
            <Field label={t("web.fields.commit")} value={status?.last_commit ?? "-"} />
            <Field label={t("web.fields.time")} value={status?.last_commit_time ?? "-"} />
            <Field label={t("web.fields.snapshotTag")} value={status?.current_snapshot_tag ?? "-"} />
          </div>
        </div>
      </section>

      <section className="app-panel overflow-hidden">
        <div className="border-b border-border-subtle px-4 py-3">
          <h2 className="app-section-title">{t("web.git.versions")}</h2>
        </div>
        {versions.length === 0 ? (
          <div className="p-4">
            <EmptyState title={t("web.git.noVersions")} description={t("web.git.noVersionsDescription")} />
          </div>
        ) : (
          <div className="divide-y divide-border-subtle">
            {versions.map((version) => (
              <div key={version.tag} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-secondary">{version.tag}</p>
                  <p className="mt-1 truncate text-[12px] text-muted">{version.message}</p>
                </div>
                <ConfirmActionButton
                  className="app-button-secondary py-1.5"
                  title={t("web.git.restoreVersionTitle")}
                  message={t("web.git.restoreVersionMessage", { tag: version.tag })}
                  confirmLabel={t("web.git.restore")}
                  onConfirm={() => runAction(() => api.gitBackupRestoreVersion(version.tag), t("web.git.restoreQueued"))}
                >
                  <RotateCcw className="h-4 w-4" />
                  {t("web.git.restore")}
                </ConfirmActionButton>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
