import { useCallback, useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { cn } from "../utils";
import { computePresetStatus } from "../lib/presetStatus";
import { getPresetIconOption } from "../lib/presetIcons";
import type { ManagedSkill, Preset } from "../lib/tauri";
import * as api from "../lib/tauri";
import { getErrorMessage } from "../lib/error";

export interface PresetBarProps {
  presets: Preset[];
  managedSkills: ManagedSkill[];
  agentKeys: string[];
  existsInWorkspace: (skill: ManagedSkill, agentKey: string) => boolean;
  onAddSkill: (skill: ManagedSkill, agentKey: string) => Promise<void>;
  onRemoveSkill: (skill: ManagedSkill, agentKey: string) => Promise<void>;
  onComplete: () => Promise<void>;
  /**
   * When true (project workspace), activation surfaces a non-blocking notice that
   * MCP profile files are written to the tool's global config dir.
   */
  projectWorkspace?: boolean;
}

export function PresetBar({
  presets,
  managedSkills,
  agentKeys,
  existsInWorkspace,
  onAddSkill,
  onRemoveSkill,
  onComplete,
  projectWorkspace = false,
}: PresetBarProps) {
  const { t } = useTranslation();
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const statuses = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computePresetStatus>>();
    for (const preset of presets) {
      map.set(preset.id, computePresetStatus(preset, managedSkills, agentKeys, existsInWorkspace));
    }
    return map;
  }, [presets, managedSkills, agentKeys, existsInWorkspace]);

  // Global workspace: unified apply (skills targets + MCP profile + active preset).
  // Project workspace: only mirror skills into the project; optionally write the
  // global MCP profile for this preset name WITHOUT switching the CLI active
  // preset (so global workspace is not stolen / restored to Default).
  const handleActivate = useCallback(async (preset: Preset) => {
    setLoadingKey(`${preset.id}-add`);
    try {
      if (!projectWorkspace) {
        await api.applyPreset(preset.id);
      }

      const presetSkills = managedSkills.filter((s) => s.preset_ids.includes(preset.id));
      for (const skill of presetSkills) {
        for (const agentKey of agentKeys) {
          if (existsInWorkspace(skill, agentKey)) continue;
          try {
            await onAddSkill(skill, agentKey);
          } catch {
            // best-effort local mirror
          }
        }
      }

      if (projectWorkspace) {
        // Write/refresh MCP profile files for this preset globally; does not
        // change active_scenario or global skill_targets.
        try {
          await api.syncMcp(preset.id);
        } catch {
          // MCP sync is best-effort on project pages
        }
        toast.success(t("presetActions.appliedToast", { name: preset.name }));
        toast.info(t("presetActions.mcpGlobalNotice"));
      } else {
        toast.success(t("presetActions.appliedToast", { name: preset.name }));
      }
      await onComplete();
    } catch (error) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      setLoadingKey(null);
    }
  }, [agentKeys, existsInWorkspace, managedSkills, onAddSkill, onComplete, projectWorkspace, t]);

  // Global workspace: unified deactivate (may switch active → Default and clear MCP).
  // Project workspace: only remove this preset's skills from the project — never
  // call global presets deactivate (that would change global active + MCP).
  const handleDeactivate = useCallback(async (preset: Preset) => {
    setLoadingKey(`${preset.id}-remove`);
    try {
      if (!projectWorkspace) {
        await api.deactivatePreset(preset.id);
      }

      const presetSkills = managedSkills.filter((s) => s.preset_ids.includes(preset.id));
      for (const skill of presetSkills) {
        for (const agentKey of agentKeys) {
          if (!existsInWorkspace(skill, agentKey)) continue;
          try {
            await onRemoveSkill(skill, agentKey);
          } catch {
            // best-effort local mirror
          }
        }
      }

      toast.success(t("presetActions.deactivatedToast", { name: preset.name }));
      await onComplete();
    } catch (error) {
      toast.error(getErrorMessage(error, t("common.error")));
    } finally {
      setLoadingKey(null);
    }
  }, [agentKeys, existsInWorkspace, managedSkills, onComplete, onRemoveSkill, projectWorkspace, t]);

  if (presets.length === 0) return null;

  const busy = loadingKey !== null;

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="shrink-0 text-[12px] text-muted">{t("sidebar.presets")}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto scrollbar-hide">
        {presets.map((preset) => {
          const s = statuses.get(preset.id)!;
          const presetIcon = getPresetIconOption(preset);
          const Icon = presetIcon.icon;
          const isLoading = loadingKey?.startsWith(preset.id) ?? false;

          return (
            <button
              key={preset.id}
              onClick={() => {
                if (busy) return;
                if (s.status === "active") handleDeactivate(preset);
                else handleActivate(preset);
              }}
              disabled={busy}
              title={preset.name}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-[12px] font-medium transition-colors disabled:opacity-50",
                s.status === "active"
                  ? `${presetIcon.activeClass} ${presetIcon.colorClass}`
                  : s.status === "partial"
                  ? "border-amber-400/50 bg-amber-500/8 text-amber-600 dark:text-amber-400 hover:bg-amber-500/12"
                  : "border-border-subtle text-faint hover:border-border hover:text-muted"
              )}
            >
              {isLoading
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : <Icon className="h-3 w-3" />}
              <span className="max-w-[140px] truncate">{preset.name}</span>
              {s.status === "active" && <Check className="h-3 w-3 shrink-0" />}
              {s.status === "partial" && (
                <span className="rounded-full bg-amber-500/20 px-1.5 py-px text-[10px] font-semibold">
                  {s.installed}/{s.total}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
