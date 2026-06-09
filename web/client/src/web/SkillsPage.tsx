import { useMemo, useState } from "react";
import { Download, RefreshCw, Search, Tags, Trash2, Upload } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useWebApp } from "./WebAppContext";
import { ConfirmActionButton, EmptyState, Field, PageHeader } from "./ui";
import type { SkillDocument, SkillsShSkill } from "../lib/tauri";
import * as api from "../lib/tauri";

type InstallKind = "auto" | "local" | "git" | "skillssh";

export function SkillsPage() {
  const { t } = useTranslation();
  const { skills, refreshAll } = useWebApp();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [installRef, setInstallRef] = useState("");
  const [installKind, setInstallKind] = useState<InstallKind>("auto");
  const [tagInput, setTagInput] = useState("");
  const [exportDest, setExportDest] = useState("");
  const [marketQuery, setMarketQuery] = useState("");
  const [marketHits, setMarketHits] = useState<SkillsShSkill[]>([]);
  const [adoptPaths, setAdoptPaths] = useState("");
  const [adoptGitUrl, setAdoptGitUrl] = useState("");
  const [adoptGitSubpath, setAdoptGitSubpath] = useState("");
  const [adoptPreview, setAdoptPreview] = useState<unknown>(null);
  const [removePreview, setRemovePreview] = useState<unknown>(null);
  const [skillDocument, setSkillDocument] = useState<SkillDocument | null>(null);

  const filteredSkills = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return skills;
    return skills.filter((skill) =>
      [skill.name, skill.description ?? "", skill.source_type, skill.source_ref ?? "", ...skill.tags]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [query, skills]);

  const selectedSkill = skills.find((skill) => skill.id === selectedId) ?? filteredSkills[0] ?? null;

  const runAction = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast.success(success);
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleInstallByKind = async () => {
    if (!installRef.trim()) return;
    if (installKind === "auto") {
      await api.installSkill({ reference: installRef.trim(), kind: "auto" });
    } else if (installKind === "local") {
      await api.installLocal(installRef.trim());
    } else if (installKind === "git") {
      await api.installGit(installRef.trim());
    } else {
      const parts = installRef.trim().split("/");
      const source = parts.slice(0, 2).join("/");
      const skillId = parts.slice(2).join("/") || parts[1] || installRef.trim();
      await api.installFromSkillssh(source, skillId);
    }
  };

  const selectedRefs = selectedSkill ? [selectedSkill.id] : [];
  const adoptPathList = adoptPaths
    .split("\n")
    .map((path) => path.trim())
    .filter(Boolean);

  return (
    <div className="app-page">
      <PageHeader
        title={t("web.skills.title")}
        description={t("web.skills.description")}
        action={
          <button type="button" className="app-button-secondary" onClick={refreshAll}>
            <RefreshCw className="h-4 w-4" />
            {t("web.common.refresh")}
          </button>
        }
      />

      <section className="app-panel p-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_180px_auto]">
          <input
            className="app-input"
            value={installRef}
            onChange={(event) => setInstallRef(event.target.value)}
            placeholder={t("web.skills.installPlaceholder")}
          />
          <select
            className="app-input"
            value={installKind}
            onChange={(event) => setInstallKind(event.target.value as InstallKind)}
          >
            <option value="auto">{t("web.skills.kindAuto")}</option>
            <option value="local">{t("web.skills.kindLocal")}</option>
            <option value="git">{t("web.skills.kindGit")}</option>
            <option value="skillssh">{t("web.skills.kindSkillssh")}</option>
          </select>
          <button
            type="button"
            className="app-button-primary"
            disabled={!installRef.trim()}
            onClick={() => runAction(handleInstallByKind, t("web.skills.installQueued"))}
          >
            <Download className="h-4 w-4" />
            {t("web.skills.install")}
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="app-panel p-4">
          <h2 className="app-section-title mb-3">{t("web.skills.skillsshSearch")}</h2>
          <div className="flex gap-2">
            <input
              className="app-input min-w-0 flex-1"
              value={marketQuery}
              onChange={(event) => setMarketQuery(event.target.value)}
              placeholder={t("web.skills.searchSkillsshPlaceholder")}
            />
            <button
              type="button"
              className="app-button-secondary"
              disabled={!marketQuery.trim()}
              onClick={() =>
                runAction(async () => {
                  const hits = await api.searchSkillssh(marketQuery.trim(), 30);
                  setMarketHits(hits);
                }, t("web.skills.searchComplete"))
              }
            >
              <Search className="h-4 w-4" />
              {t("web.skills.search")}
            </button>
          </div>
          {marketHits.length > 0 ? (
            <div className="mt-3 max-h-[260px] divide-y divide-border-subtle overflow-auto rounded-lg border border-border-subtle">
              {marketHits.map((hit) => (
                <div key={hit.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-secondary">{hit.name}</p>
                    <p className="mt-1 truncate text-[12px] text-muted">{hit.source}/{hit.skill_id}</p>
                  </div>
                  <button
                    type="button"
                    className="app-button-secondary py-1.5"
                    onClick={() =>
                      runAction(
                        () => api.installSkill({ reference: `${hit.source}/${hit.skill_id}`, kind: "skillssh" }),
                        t("web.skills.installQueued"),
                      )
                    }
                  >
                    {t("web.skills.install")}
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="app-panel p-4">
          <h2 className="app-section-title mb-3">{t("web.skills.adoptExisting")}</h2>
          <textarea
            className="app-input min-h-[84px] w-full py-2"
            value={adoptPaths}
            onChange={(event) => setAdoptPaths(event.target.value)}
            placeholder={t("web.skills.adoptPathsPlaceholder")}
          />
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
            <input
              className="app-input"
              value={adoptGitUrl}
              onChange={(event) => setAdoptGitUrl(event.target.value)}
              placeholder={t("web.skills.adoptGitUrlPlaceholder")}
            />
            <input
              className="app-input"
              value={adoptGitSubpath}
              onChange={(event) => setAdoptGitSubpath(event.target.value)}
              placeholder={t("web.skills.adoptGitSubpathPlaceholder")}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="app-button-secondary"
              disabled={adoptPathList.length === 0}
              onClick={() =>
                runAction(async () => {
                  const result = adoptGitUrl.trim()
                    ? await api.adoptGitSkill({
                        path: adoptPathList[0],
                        gitUrl: adoptGitUrl.trim(),
                        gitSubpath: adoptGitSubpath,
                        dryRun: true,
                      })
                    : await api.adoptSkills(adoptPathList, true);
                  setAdoptPreview(result);
                }, t("web.skills.adoptDryRunComplete"))
              }
            >
              {t("web.skills.dryRun")}
            </button>
            <ConfirmActionButton
              className="app-button-primary"
              disabled={adoptPathList.length === 0}
              title={t("web.skills.adoptTitle")}
              message={t("web.skills.adoptMessage")}
              confirmLabel={t("web.skills.adopt")}
              onConfirm={() =>
                runAction(
                  () =>
                    adoptGitUrl.trim()
                      ? api.adoptGitSkill({
                          path: adoptPathList[0],
                          gitUrl: adoptGitUrl.trim(),
                          gitSubpath: adoptGitSubpath,
                          dryRun: false,
                        })
                      : api.adoptSkills(adoptPathList, false),
                  t("web.skills.adoptQueued"),
                )
              }
            >
              {t("web.skills.adopt")}
            </ConfirmActionButton>
          </div>
          {adoptPreview ? (
            <pre className="mt-3 max-h-[180px] overflow-auto rounded-lg border border-border-subtle bg-bg-secondary p-3 text-[12px] text-secondary">
              {JSON.stringify(adoptPreview, null, 2)}
            </pre>
          ) : null}
        </div>
      </section>

      <div className="grid min-h-[620px] grid-cols-1 gap-4 xl:grid-cols-[420px_1fr]">
        <section className="app-panel overflow-hidden">
          <div className="border-b border-border-subtle p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <input
                className="app-input w-full pl-9"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("web.skills.searchSkillsPlaceholder")}
              />
            </div>
          </div>
          {filteredSkills.length === 0 ? (
            <div className="p-4">
              <EmptyState title={t("web.skills.noSkillsFound")} description={t("web.skills.noSkillsFoundDescription")} />
            </div>
          ) : (
            <div className="max-h-[680px] divide-y divide-border-subtle overflow-y-auto">
              {filteredSkills.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => setSelectedId(skill.id)}
                  className={`flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors hover:bg-surface-hover ${
                    selectedSkill?.id === skill.id ? "bg-surface-active" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-[14px] font-semibold text-primary">{skill.name}</p>
                    <span className="rounded border border-border-subtle bg-surface px-1.5 py-px text-[11px] text-muted">
                      {skill.source_type}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-[12px] leading-5 text-muted">
                    {skill.description ?? t("web.common.noDescription")}
                  </p>
                  {skill.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {skill.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-accent-bg px-2 py-px text-[11px] text-accent-light">
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="app-panel p-4">
          {selectedSkill ? (
            <div className="flex h-full flex-col gap-5">
              <div>
                <h2 className="text-[18px] font-semibold text-primary">{selectedSkill.name}</h2>
                <p className="mt-2 text-[13px] leading-5 text-muted">
                  {selectedSkill.description ?? t("web.common.noDescription")}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label={t("web.fields.id")} value={selectedSkill.id} />
                <Field label={t("web.fields.source")} value={selectedSkill.source_ref ?? selectedSkill.source_type} />
                <Field label={t("web.fields.path")} value={selectedSkill.central_path} />
                <Field label={t("web.fields.presets")} value={selectedSkill.preset_ids.join(", ") || "-"} />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="app-button-secondary"
                  onClick={() => runAction(() => api.checkSkillUpdate(selectedSkill.id), t("web.skills.checkQueued"))}
                >
                  <Search className="h-4 w-4" />
                  {t("web.skills.check")}
                </button>
                <button
                  type="button"
                  className="app-button-secondary"
                  onClick={() => runAction(() => api.updateSkill(selectedSkill.id), t("web.skills.updateQueued"))}
                >
                  <RefreshCw className="h-4 w-4" />
                  {t("web.skills.update")}
                </button>
                <button
                  type="button"
                  className="app-button-secondary"
                  onClick={() => runAction(() => api.checkAllSkillUpdates(false), t("web.skills.checkAllQueued"))}
                >
                  <Search className="h-4 w-4" />
                  {t("web.skills.checkAll")}
                </button>
                <button
                  type="button"
                  className="app-button-secondary"
                  onClick={() => runAction(api.updateAllSkills, t("web.skills.updateAllQueued"))}
                >
                  <RefreshCw className="h-4 w-4" />
                  {t("web.skills.updateAll")}
                </button>
                <button
                  type="button"
                  className="app-button-secondary"
                  disabled={!exportDest.trim()}
                  onClick={() => runAction(() => api.exportSkill(selectedSkill.id, exportDest.trim()), t("web.skills.exportQueued"))}
                >
                  <Upload className="h-4 w-4" />
                  {t("web.skills.export")}
                </button>
                <button
                  type="button"
                  className="app-button-secondary"
                  onClick={() =>
                    runAction(async () => {
                      setRemovePreview(await api.removeDryRun(selectedRefs));
                    }, t("web.skills.removeDryRunComplete"))
                  }
                >
                  <Search className="h-4 w-4" />
                  {t("web.skills.removeDryRun")}
                </button>
                <ConfirmActionButton
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-[13px] font-medium text-red-500 transition-colors hover:bg-red-500/15"
                  title={t("web.skills.deleteTitle")}
                  message={t("web.skills.deleteMessage", { name: selectedSkill.name })}
                  confirmLabel={t("web.skills.delete")}
                  onConfirm={() => runAction(() => api.deleteManagedSkill(selectedSkill.id), t("web.skills.deleteQueued"))}
                >
                  <Trash2 className="h-4 w-4" />
                  {t("web.skills.delete")}
                </ConfirmActionButton>
              </div>

              <input
                className="app-input"
                value={exportDest}
                onChange={(event) => setExportDest(event.target.value)}
                placeholder={t("web.skills.exportPlaceholder")}
              />

              <div className="app-panel-muted p-3">
                <div className="mb-2 flex items-center gap-2">
                  <Tags className="h-4 w-4 text-muted" />
                  <h3 className="text-[13px] font-semibold text-secondary">{t("web.skills.tags")}</h3>
                </div>
                <div className="flex gap-2">
                  <input
                    className="app-input min-w-0 flex-1"
                    value={tagInput}
                    onChange={(event) => setTagInput(event.target.value)}
                    placeholder={t("web.skills.tagsPlaceholder")}
                  />
                  <button
                    type="button"
                    className="app-button-secondary"
                    onClick={() => {
                      const tags = tagInput.split(",").map((tag) => tag.trim()).filter(Boolean);
                      void runAction(
                        () => api.setSkillTags(selectedSkill.id, [...new Set([...selectedSkill.tags, ...tags])]),
                        t("web.skills.tagsUpdated"),
                      );
                      setTagInput("");
                    }}
                  >
                    {t("web.skills.save")}
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="app-button-secondary"
                  onClick={() => runAction(() => api.legacyEnableSkills(selectedRefs), t("web.skills.legacyEnableQueued"))}
                >
                  {t("web.skills.legacyEnable")}
                </button>
                <button
                  type="button"
                  className="app-button-secondary"
                  onClick={() => runAction(() => api.legacyDisableSkills(selectedRefs), t("web.skills.legacyDisableQueued"))}
                >
                  {t("web.skills.legacyDisable")}
                </button>
                <button
                  type="button"
                  className="app-button-secondary"
                  onClick={() =>
                    runAction(async () => {
                      setSkillDocument(await api.getSkillDocument(selectedSkill.id));
                    }, t("web.skills.markdownLoaded"))
                  }
                >
                  {t("web.skills.loadMarkdown")}
                </button>
              </div>

              {removePreview ? (
                <pre className="max-h-[180px] overflow-auto rounded-lg border border-border-subtle bg-bg-secondary p-3 text-[12px] text-secondary">
                  {JSON.stringify(removePreview, null, 2)}
                </pre>
              ) : null}

              {skillDocument ? (
                <div>
                  <h3 className="app-section-title mb-2">{t("web.skills.markdown")}</h3>
                  <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap rounded-lg border border-border-subtle bg-bg-secondary p-3 text-[12px] leading-5 text-secondary">
                    {skillDocument.content}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyState title={t("web.skills.noSkillSelected")} description={t("web.skills.noSkillSelectedDescription")} />
          )}
        </section>
      </div>
    </div>
  );
}
