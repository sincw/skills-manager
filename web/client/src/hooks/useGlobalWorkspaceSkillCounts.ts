import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../lib/tauri";
import type { ManagedSkill, ToolInfo } from "../lib/tauri";

const GLOBAL_WORKSPACE_COUNTS_CHANGED = "skills-manager:global-workspace-counts-changed";

export function notifyGlobalWorkspaceSkillCountsChanged() {
  window.dispatchEvent(new Event(GLOBAL_WORKSPACE_COUNTS_CHANGED));
}

function managedTargetCounts(tools: ToolInfo[], managedSkills: ManagedSkill[]) {
  const map: Record<string, number> = {};
  for (const tool of tools) {
    map[tool.key] = managedSkills.filter((skill) =>
      skill.targets.some((target) => target.tool === tool.key)
    ).length;
  }
  return map;
}

export function useGlobalWorkspaceSkillCounts(
  tools: ToolInfo[],
  managedSkills: ManagedSkill[],
) {
  const fallbackCounts = useMemo(
    () => managedTargetCounts(tools, managedSkills),
    [tools, managedSkills],
  );
  const [localCounts, setLocalCounts] = useState<Record<string, number>>({});
  const toolKeys = useMemo(() => tools.map((tool) => tool.key).join("\0"), [tools]);

  const refreshCounts = useCallback(async () => {
    const entries = await Promise.all(
      tools.map(async (tool) => {
        try {
          const skills = await api.getGlobalLocalSkills(tool.key);
          return [tool.key, skills.length] as const;
        } catch {
          return [tool.key, fallbackCounts[tool.key] ?? 0] as const;
        }
      }),
    );
    setLocalCounts(Object.fromEntries(entries));
  }, [fallbackCounts, tools]);

  useEffect(() => {
    if (tools.length === 0) {
      setLocalCounts({});
      return;
    }
    void refreshCounts();
  }, [refreshCounts, toolKeys, tools.length]);

  useEffect(() => {
    window.addEventListener(GLOBAL_WORKSPACE_COUNTS_CHANGED, refreshCounts);
    return () => {
      window.removeEventListener(GLOBAL_WORKSPACE_COUNTS_CHANGED, refreshCounts);
    };
  }, [refreshCounts]);

  return useMemo(() => {
    const counts: Record<string, number> = {};
    for (const tool of tools) {
      counts[tool.key] = localCounts[tool.key] ?? fallbackCounts[tool.key] ?? 0;
    }
    return counts;
  }, [fallbackCounts, localCounts, tools]);
}
