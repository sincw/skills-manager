/* eslint-disable react-refresh/only-export-components */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { i18nReady } from "./i18n";
import "./index.css";
import { AppProvider } from "./context/AppContext";
import { ThemeProvider, useThemeContext } from "./context/ThemeContext";
import { HelpDialog } from "./components/HelpDialog";
import { CloseActionGuard } from "./components/CloseActionGuard";
import { Layout } from "./components/Layout";
import { Dashboard } from "./views/Dashboard";
import { MySkills } from "./views/MySkills";
import { WorkspaceView } from "./views/WorkspaceView";
import { CODING_WORKSPACE_CONFIG, LOBSTER_WORKSPACE_CONFIG } from "./views/workspaceConfigs";
import { InstallSkills } from "./views/InstallSkills";
import { Settings } from "./views/Settings";
import { ProjectDetail } from "./views/ProjectDetail";
import { WebShell } from "./web/WebShell";
import { DashboardPage } from "./web/DashboardPage";
import { SkillsPage } from "./web/SkillsPage";
import { PresetsPage } from "./web/PresetsPage";
import { ToolsPage } from "./web/ToolsPage";
import { GitPage } from "./web/GitPage";
import { OperationsPage } from "./web/OperationsPage";
import { SettingsPage } from "./web/SettingsPage";
import { Toaster } from "sonner";

await i18nReady;

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root");
}

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

function CoreShell() {
  return (
    <ThemeProvider>
      <AppProvider>
        <Layout />
        <HelpDialog />
        <CloseActionGuard />
        <ThemedToaster />
      </AppProvider>
    </ThemeProvider>
  );
}

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<CoreShell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/my-skills" element={<MySkills />} />
          <Route path="/global-workspace" element={<WorkspaceView config={CODING_WORKSPACE_CONFIG} />} />
          <Route path="/global-workspace/:agentKey" element={<WorkspaceView config={CODING_WORKSPACE_CONFIG} />} />
          <Route path="/lobster-workspace" element={<WorkspaceView config={LOBSTER_WORKSPACE_CONFIG} />} />
          <Route path="/lobster-workspace/:agentKey" element={<WorkspaceView config={LOBSTER_WORKSPACE_CONFIG} />} />
          <Route path="/install" element={<InstallSkills />} />
          <Route path="/project/:id" element={<ProjectDetail />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route element={<WebShell />}>
          <Route path="/web" element={<DashboardPage />} />
          <Route path="/web/skills" element={<SkillsPage />} />
          <Route path="/web/presets" element={<PresetsPage />} />
          <Route path="/web/tools" element={<ToolsPage />} />
          <Route path="/web/git" element={<GitPage />} />
          <Route path="/web/operations" element={<OperationsPage />} />
          <Route path="/web/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
