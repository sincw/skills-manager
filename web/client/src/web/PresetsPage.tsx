import { useCallback, useEffect, useState } from "react";
import { Eye, PauseCircle, PlayCircle, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useWebApp } from "./WebAppContext";
import { ConfirmActionButton, EmptyState, Field, PageHeader } from "./ui";
import type { McpServerDetail, McpServerSummary } from "../lib/tauri";
import * as api from "../lib/tauri";
import { cn } from "../utils";

export function PresetsPage() {
  const { t } = useTranslation();
  const { presets, skills, tools, activePreset, refreshAll } = useWebApp();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [skillRef, setSkillRef] = useState("");
  const [preview, setPreview] = useState<unknown[] | null>(null);
  const [syncTool, setSyncTool] = useState("");
  const [syncPreview, setSyncPreview] = useState<unknown>(null);
  const [detailTab, setDetailTab] = useState<"skills" | "mcp">("skills");
  const [presetMcp, setPresetMcp] = useState<McpServerSummary[]>([]);
  const [mcpDetails, setMcpDetails] = useState<Record<string, McpServerDetail>>({});
  const [allMcp, setAllMcp] = useState<McpServerSummary[]>([]);
  const [mcpRef, setMcpRef] = useState("");
  const selectedPreset = presets.find((preset) => preset.id === selectedId) ?? activePreset ?? presets[0] ?? null;

  const presetSkills = selectedPreset
    ? skills.filter((skill) => skill.preset_ids.includes(selectedPreset.id) || skill.preset_ids.includes(selectedPreset.name))
    : [];

  const loadPresetMcp = useCallback(async (presetRef: string) => {
    try {
      const [members, library] = await Promise.all([
        api.getPresetMcpServers(presetRef),
        api.getMcpServers(),
      ]);
      setPresetMcp(members);
      setAllMcp(library);
      const details = await Promise.all(
        members.map(async (server) => {
          try {
            return [server.name, await api.getMcpServer(server.name)] as const;
          } catch {
            return null;
          }
        }),
      );
      const next: Record<string, McpServerDetail> = {};
      for (const entry of details) {
        if (entry) next[entry[0]] = entry[1];
      }
      setMcpDetails(next);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    if (!selectedPreset) {
      setPresetMcp([]);
      setDetailTab("skills");
      return;
    }
    void loadPresetMcp(selectedPreset.id);
  }, [selectedPreset, loadPresetMcp]);

  const runAction = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast.success(success);
      await refreshAll();
      if (selectedPreset) await loadPresetMcp(selectedPreset.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const availableMcp = allMcp.filter((s) => !presetMcp.some((m) => m.name === s.name));

  return (
    <div className="app-page">
      <PageHeader
        title={t("web.presets.title")}
        description={t("web.presets.description")}
        action={
          <button type="button" className="app-button-secondary" onClick={refreshAll}>
            <RefreshCw className="h-4 w-4" />
            {t("web.common.refresh")}
          </button>
        }
      />

      <div className="grid min-h-[640px] grid-cols-1 gap-4 xl:grid-cols-[360px_1fr]">
        <section className="app-panel overflow-hidden">
          {presets.length === 0 ? (
            <div className="p-4">
              <EmptyState title={t("web.presets.noPresets")} description={t("web.presets.noPresetsDescription")} />
            </div>
          ) : (
            <div className="divide-y divide-border-subtle">
              {presets.map((preset) => (
                <button
                  type="button"
                  key={preset.id}
                  onClick={() => {
                    setSelectedId(preset.id);
                    setPreview(null);
                    setDetailTab("skills");
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover ${
                    selectedPreset?.id === preset.id ? "bg-surface-active" : ""
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-primary">{preset.name}</p>
                    <p className="mt-1 text-[12px] text-muted">
                      {t("web.common.skillsCount", { count: preset.skill_count })}
                    </p>
                  </div>
                  {preset.active ? (
                    <span className="rounded-full border border-accent-border bg-accent-bg px-2 py-1 text-[11px] text-accent-light">
                      {t("web.presets.active")}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="app-panel p-4">
          {selectedPreset ? (
            <div className="flex h-full flex-col gap-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-[18px] font-semibold text-primary">{selectedPreset.name}</h2>
                  <p className="mt-2 text-[13px] leading-5 text-muted">
                    {selectedPreset.description ?? t("web.common.noDescription")}
                  </p>
                </div>
                {selectedPreset.active ? (
                  <span className="app-badge">{t("web.presets.current")}</span>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field label={t("web.fields.presetId")} value={selectedPreset.id} />
                <Field label={t("web.fields.skillCount")} value={selectedPreset.skill_count} />
                <Field label={t("web.fields.sortOrder")} value={selectedPreset.sort_order} />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="app-button-primary"
                  onClick={() => runAction(() => api.applyPresetToDefault(selectedPreset.id), t("web.presets.applyQueued"))}
                >
                  <PlayCircle className="h-4 w-4" />
                  {t("web.presets.apply")}
                </button>
                <button
                  type="button"
                  className="app-button-secondary"
                  onClick={() => runAction(() => api.deactivatePreset(selectedPreset.id), t("web.presets.deactivateQueued"))}
                >
                  <PauseCircle className="h-4 w-4" />
                  {t("web.presets.deactivate")}
                </button>
                <button
                  type="button"
                  className="app-button-secondary"
                  onClick={() =>
                    runAction(async () => {
                      const result = await api.previewPreset(selectedPreset.id);
                      setPreview(Array.isArray(result) ? result : [result]);
                    }, t("web.presets.previewLoaded"))
                  }
                >
                  <Eye className="h-4 w-4" />
                  {t("web.presets.preview")}
                </button>
              </div>

              <div className="app-panel-muted p-3">
                <h3 className="mb-3 text-[13px] font-semibold text-secondary">{t("web.presets.sync")}</h3>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto_auto]">
                  <select
                    className="app-input"
                    value={syncTool}
                    onChange={(event) => setSyncTool(event.target.value)}
                  >
                    <option value="">{t("web.presets.allEnabledTools")}</option>
                    {tools.map((tool) => (
                      <option key={tool.key} value={tool.key}>
                        {tool.display_name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="app-button-secondary"
                    onClick={() =>
                      runAction(async () => {
                        setSyncPreview(await api.syncPreset(selectedPreset.id, syncTool || undefined, true));
                      }, t("web.presets.syncDryRunComplete"))
                    }
                  >
                    {t("web.skills.dryRun")}
                  </button>
                  <ConfirmActionButton
                    className="app-button-primary"
                    title={t("web.presets.syncTitle")}
                    message={t("web.presets.syncMessage")}
                    confirmLabel={t("web.presets.sync")}
                    onConfirm={() =>
                      runAction(
                        () => api.syncPreset(selectedPreset.id, syncTool || undefined, false),
                        t("web.presets.syncQueued"),
                      )
                    }
                  >
                    {t("web.presets.sync")}
                  </ConfirmActionButton>
                </div>
                {syncPreview ? (
                  <pre className="mt-3 max-h-[180px] overflow-auto rounded-lg border border-border-subtle bg-surface p-3 text-[12px] text-secondary">
                    {JSON.stringify(syncPreview, null, 2)}
                  </pre>
                ) : null}
              </div>

              <div className="flex items-center gap-1 border-b border-border-subtle">
                <button
                  type="button"
                  onClick={() => setDetailTab("skills")}
                  className={cn(
                    "-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors outline-none",
                    detailTab === "skills"
                      ? "border-accent text-primary"
                      : "border-transparent text-muted hover:text-secondary",
                  )}
                >
                  {t("web.presets.tabs.skills", { count: presetSkills.length })}
                </button>
                <button
                  type="button"
                  onClick={() => setDetailTab("mcp")}
                  className={cn(
                    "-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors outline-none",
                    detailTab === "mcp"
                      ? "border-accent text-primary"
                      : "border-transparent text-muted hover:text-secondary",
                  )}
                >
                  {t("web.presets.tabs.mcp", { count: presetMcp.length })}
                </button>
              </div>

              {detailTab === "skills" ? (
                <>
                  <div className="app-panel-muted p-3">
                    <h3 className="mb-3 text-[13px] font-semibold text-secondary">{t("web.presets.membership")}</h3>
                    <div className="flex gap-2">
                      <input
                        className="app-input min-w-0 flex-1"
                        value={skillRef}
                        onChange={(event) => setSkillRef(event.target.value)}
                        placeholder={t("web.presets.skillRefPlaceholder")}
                      />
                      <button
                        type="button"
                        className="app-button-secondary"
                        disabled={!skillRef.trim()}
                        onClick={() => runAction(() => api.addSkillToPreset(skillRef.trim(), selectedPreset.id), t("web.presets.skillAddQueued"))}
                      >
                        <Plus className="h-4 w-4" />
                        {t("web.presets.add")}
                      </button>
                    </div>
                  </div>

                  <div>
                    <h3 className="app-section-title mb-2">{t("web.presets.presetSkills")}</h3>
                    {presetSkills.length === 0 ? (
                      <p className="text-[13px] text-muted">{t("web.presets.noPresetSkills")}</p>
                    ) : (
                      <div className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
                        {presetSkills.map((skill) => (
                          <div key={skill.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-medium text-secondary">{skill.name}</p>
                              <p className="mt-1 truncate text-[12px] text-muted">{skill.id}</p>
                            </div>
                            <button
                              type="button"
                              className="rounded-md p-2 text-muted hover:bg-danger-bg hover:text-red-500"
                              onClick={() =>
                                runAction(() => api.removeSkillFromPreset(skill.id, selectedPreset.id), t("web.presets.skillRemoveQueued"))
                              }
                              title={t("web.presets.removeSkill")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="app-panel-muted p-3">
                    <h3 className="mb-3 text-[13px] font-semibold text-secondary">{t("web.presets.mcpMembership")}</h3>
                    <div className="flex gap-2">
                      <select
                        className="app-input min-w-0 flex-1"
                        value={mcpRef}
                        onChange={(event) => setMcpRef(event.target.value)}
                      >
                        <option value="">{t("web.presets.mcpSelectPlaceholder")}</option>
                        {availableMcp.map((server) => (
                          <option key={server.id} value={server.name}>
                            {server.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="app-button-secondary"
                        disabled={!mcpRef.trim()}
                        onClick={() =>
                          runAction(
                            () => api.addMcpToPreset(selectedPreset.id, [mcpRef.trim()]),
                            t("web.presets.mcpAddQueued"),
                          )
                        }
                      >
                        <Plus className="h-4 w-4" />
                        {t("web.presets.add")}
                      </button>
                    </div>
                  </div>

                  <div>
                    <h3 className="app-section-title mb-2">{t("web.presets.presetMcp")}</h3>
                    {presetMcp.length === 0 ? (
                      <p className="text-[13px] text-muted">{t("web.presets.noPresetMcp")}</p>
                    ) : (
                      <div className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
                        {presetMcp.map((server) => {
                          const command = mcpDetails[server.name]
                            ? api.extractMcpCommand(mcpDetails[server.name].content)
                            : null;
                          return (
                            <div key={server.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                              <div className="min-w-0">
                                <p className="truncate text-[13px] font-medium text-secondary">{server.name}</p>
                                <p className="mt-1 truncate font-mono text-[12px] text-muted">
                                  {command ? `command = "${command}"` : t("web.presets.noCommand")}
                                </p>
                              </div>
                              <button
                                type="button"
                                className="rounded-md p-2 text-muted hover:bg-danger-bg hover:text-red-500"
                                onClick={() =>
                                  runAction(
                                    () => api.removeMcpFromPreset(selectedPreset.id, [server.name]),
                                    t("web.presets.mcpRemoveQueued"),
                                  )
                                }
                                title={t("web.presets.removeMcp")}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}

              {preview ? (
                <div>
                  <h3 className="app-section-title mb-2">{t("web.presets.preview")}</h3>
                  <pre className="max-h-[240px] overflow-auto rounded-lg border border-border-subtle bg-bg-secondary p-3 text-[12px] text-secondary">
                    {JSON.stringify(preview, null, 2)}
                  </pre>
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyState title={t("web.presets.noPresetSelected")} description={t("web.presets.noPresetSelectedDescription")} />
          )}
        </section>
      </div>
    </div>
  );
}
