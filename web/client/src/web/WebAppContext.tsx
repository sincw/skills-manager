/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ManagedSkill, Preset, RepoStatus, ToolInfo, WebJob } from "../lib/tauri";
import * as api from "../lib/tauri";

interface WebAppContextValue {
  repoStatus: RepoStatus | null;
  tools: ToolInfo[];
  skills: ManagedSkill[];
  presets: Preset[];
  activePreset: Preset | null;
  jobs: WebJob[];
  loading: boolean;
  error: string | null;
  refreshAll: () => Promise<void>;
  refreshJobs: () => Promise<void>;
}

const WebAppContext = createContext<WebAppContextValue | null>(null);

export function WebAppProvider({ children }: { children: ReactNode }) {
  const [repoStatus, setRepoStatus] = useState<RepoStatus | null>(null);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [skills, setSkills] = useState<ManagedSkill[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [activePreset, setActivePreset] = useState<Preset | null>(null);
  const [jobs, setJobs] = useState<WebJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const refreshJobs = useCallback(async () => {
    const nextJobs = await api.getWebJobs();
    setJobs(nextJobs);
  }, []);

  const refreshAll = useCallback(async () => {
    if (!loadedOnce) setLoading(true);
    const [nextRepo, nextTools, nextSkills, nextPresets, nextActivePreset, nextJobs] =
      await Promise.allSettled([
        api.getRepoStatus(),
        api.getToolStatus(),
        api.getManagedSkills(),
        api.getPresets(),
        api.getActivePreset(),
        api.getWebJobs(),
      ]);

    const errors: string[] = [];
    if (nextRepo.status === "fulfilled") setRepoStatus(nextRepo.value);
    else errors.push(nextRepo.reason instanceof Error ? nextRepo.reason.message : String(nextRepo.reason));
    if (nextTools.status === "fulfilled") setTools(nextTools.value);
    else errors.push(nextTools.reason instanceof Error ? nextTools.reason.message : String(nextTools.reason));
    if (nextSkills.status === "fulfilled") setSkills(nextSkills.value);
    else errors.push(nextSkills.reason instanceof Error ? nextSkills.reason.message : String(nextSkills.reason));
    if (nextPresets.status === "fulfilled") setPresets(nextPresets.value);
    else errors.push(nextPresets.reason instanceof Error ? nextPresets.reason.message : String(nextPresets.reason));
    if (nextActivePreset.status === "fulfilled") setActivePreset(nextActivePreset.value);
    else errors.push(nextActivePreset.reason instanceof Error ? nextActivePreset.reason.message : String(nextActivePreset.reason));
    if (nextJobs.status === "fulfilled") setJobs(nextJobs.value);
    else errors.push(nextJobs.reason instanceof Error ? nextJobs.reason.message : String(nextJobs.reason));

    setError(errors.length > 0 ? errors[0] : null);
    setLoadedOnce(true);
    setLoading(false);
  }, [loadedOnce]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshJobs();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [refreshJobs]);

  const value = useMemo<WebAppContextValue>(
    () => ({
      repoStatus,
      tools,
      skills,
      presets,
      activePreset,
      jobs,
      loading,
      error,
      refreshAll,
      refreshJobs,
    }),
    [activePreset, error, jobs, loading, presets, refreshAll, refreshJobs, repoStatus, skills, tools],
  );

  return <WebAppContext.Provider value={value}>{children}</WebAppContext.Provider>;
}

export function useWebApp() {
  const context = useContext(WebAppContext);
  if (!context) throw new Error("useWebApp must be used within WebAppProvider");
  return context;
}
