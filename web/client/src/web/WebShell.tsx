import { NavLink, Outlet } from "react-router-dom";
import {
  Activity,
  Bot,
  Database,
  GitBranch,
  LayoutDashboard,
  Layers,
  Settings,
  WandSparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Toaster } from "sonner";
import { ThemeProvider, useThemeContext } from "../context/ThemeContext";
import { WebAppProvider, useWebApp } from "./WebAppContext";
import { cn } from "../utils";

function ThemedToaster() {
  const { resolvedTheme } = useThemeContext();
  return (
    <Toaster
      theme={resolvedTheme}
      position="bottom-right"
      toastOptions={{
        style: {
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          color: "var(--color-text-primary)",
        },
      }}
    />
  );
}

const NAV_ITEMS = [
  { labelKey: "web.nav.dashboard", path: "/web", icon: LayoutDashboard },
  { labelKey: "web.nav.skills", path: "/web/skills", icon: Layers },
  { labelKey: "web.nav.presets", path: "/web/presets", icon: WandSparkles },
  { labelKey: "web.nav.tools", path: "/web/tools", icon: Bot },
  { labelKey: "web.nav.git", path: "/web/git", icon: GitBranch },
  { labelKey: "web.nav.operations", path: "/web/operations", icon: Activity },
  { labelKey: "web.nav.settings", path: "/web/settings", icon: Settings },
];

function Sidebar() {
  const { t } = useTranslation();
  const { repoStatus, jobs } = useWebApp();
  const activeJobs = jobs.filter((job) => job.status === "queued" || job.status === "running").length;

  return (
    <aside className="flex h-full w-[250px] shrink-0 flex-col border-r border-border-subtle bg-bg-secondary">
      <div className="border-b border-border-subtle px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent-border bg-accent-bg text-accent-light">
            <Database className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold text-primary">{t("web.shell.title")}</p>
            <p className="truncate text-[12px] text-muted">{t("web.shell.subtitle")}</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-2.5 py-3">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/web"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-[6px] px-2.5 py-2 text-[13px] font-medium outline-none transition-colors",
                  isActive
                    ? "bg-surface-active text-primary"
                    : "text-tertiary hover:bg-surface-hover hover:text-secondary",
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{t(item.labelKey)}</span>
              {item.path === "/web/operations" && activeJobs > 0 ? (
                <span className="rounded-full bg-accent-bg px-1.5 py-px text-[11px] text-accent-light">
                  {activeJobs}
                </span>
              ) : null}
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-border-subtle px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
          {t("web.shell.skillsRoot")}
        </p>
        <p className="mt-1 truncate text-[12px] text-muted" title={repoStatus?.skills_dir ?? ""}>
          {repoStatus?.skills_dir ?? t("web.shell.notLoaded")}
        </p>
      </div>
    </aside>
  );
}

function ShellContent() {
  const { t } = useTranslation();
  const { error, refreshAll } = useWebApp();
  return (
    <div className="flex h-full w-full overflow-hidden bg-background text-primary">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto px-5 py-5">
        <div className="mx-auto flex min-h-full max-w-[1200px] flex-col gap-4">
          {error ? (
            <div className="app-panel border-red-500/30 bg-danger-bg px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] text-red-500">{error}</p>
                <button type="button" className="app-button-secondary py-1.5" onClick={refreshAll}>
                  {t("web.common.retry")}
                </button>
              </div>
            </div>
          ) : null}
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export function WebShell() {
  return (
    <ThemeProvider>
      <WebAppProvider>
        <ShellContent />
        <ThemedToaster />
      </WebAppProvider>
    </ThemeProvider>
  );
}
