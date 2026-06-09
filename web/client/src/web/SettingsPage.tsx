import { useState } from "react";
import { Copy, RefreshCw, RotateCcw, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useThemeContext } from "../context/ThemeContext";
import { useWebApp } from "./WebAppContext";
import { ConfirmActionButton, Field, PageHeader } from "./ui";
import * as api from "../lib/tauri";

const LANGUAGE_STORAGE_KEY = "language";

const ENVIRONMENT_ROWS = [
  ["SKILLS_MANAGER_CLI", "web.settings.env.cli"],
  ["SKILLS_MANAGER_WEB_HOST", "web.settings.env.host"],
  ["SKILLS_MANAGER_WEB_PORT", "web.settings.env.port"],
  ["SKILLS_MANAGER_WEB_TOKEN", "web.settings.env.token"],
  ["SKILLS_MANAGER_SKILLS_ROOT", "web.settings.env.root"],
] as const;

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const { repoStatus, refreshAll } = useWebApp();
  const { theme, setTheme } = useThemeContext();
  const [repoPath, setRepoPath] = useState(repoStatus?.base_dir ?? "");

  const themeOptions = [
    { value: "light", label: t("web.settings.themeLight") },
    { value: "dark", label: t("web.settings.themeDark") },
    { value: "system", label: t("web.settings.themeSystem") },
  ] as const;

  const languageOptions = [
    { value: "zh", label: t("web.settings.languageChinese") },
    { value: "en", label: t("web.settings.languageEnglish") },
  ] as const;

  const runAction = async (action: () => Promise<unknown>, success: string) => {
    try {
      await action();
      toast.success(success);
      await refreshAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const handleLanguageChange = (language: "zh" | "en") => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    void i18n.changeLanguage(language);
    void api.setSettings("language", language);
  };

  return (
    <div className="app-page">
      <PageHeader
        title={t("web.settings.title")}
        description={t("web.settings.description")}
        action={
          <button type="button" className="app-button-secondary" onClick={refreshAll}>
            <RefreshCw className="h-4 w-4" />
            {t("web.common.refresh")}
          </button>
        }
      />

      <section className="app-panel p-4">
        <h2 className="app-section-title mb-3">{t("web.settings.appearance")}</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-[13px] font-medium text-secondary">{t("web.settings.theme")}</p>
            <div className="app-segmented inline-flex">
              {themeOptions.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setTheme(item.value)}
                  className={`app-segmented-button ${theme === item.value ? "app-segmented-button-active" : ""}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-[13px] font-medium text-secondary">{t("web.settings.language")}</p>
            <div className="app-segmented inline-flex">
              {languageOptions.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => handleLanguageChange(item.value)}
                  className={`app-segmented-button ${
                    i18n.resolvedLanguage === item.value ? "app-segmented-button-active" : ""
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="app-panel p-4">
        <h2 className="app-section-title mb-3">{t("web.settings.repositoryPath")}</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={t("web.fields.baseDirectory")} value={repoStatus?.base_dir ?? "-"} />
          <Field label={t("web.fields.skillsDirectory")} value={repoStatus?.skills_dir ?? "-"} />
          <Field label={t("web.fields.database")} value={repoStatus?.db_path ?? "-"} />
          <Field label={t("web.fields.metadata")} value={repoStatus?.metadata_dir ?? "-"} />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-[1fr_auto_auto]">
          <input
            className="app-input"
            value={repoPath}
            onChange={(event) => setRepoPath(event.target.value)}
            placeholder={t("web.settings.pathPlaceholder")}
          />
          <ConfirmActionButton
            className="app-button-primary"
            disabled={!repoPath.trim()}
            title={t("web.settings.setPathTitle")}
            message={t("web.settings.setPathMessage")}
            confirmLabel={t("web.settings.setPath")}
            onConfirm={() => runAction(() => api.setRepoPath(repoPath.trim()), t("web.settings.setPathQueued"))}
          >
            <Save className="h-4 w-4" />
            {t("web.settings.setPath")}
          </ConfirmActionButton>
          <ConfirmActionButton
            className="app-button-secondary"
            title={t("web.settings.resetPathTitle")}
            message={t("web.settings.resetPathMessage")}
            confirmLabel={t("web.settings.reset")}
            onConfirm={() => runAction(api.resetRepoPath, t("web.settings.resetPathQueued"))}
          >
            <RotateCcw className="h-4 w-4" />
            {t("web.settings.reset")}
          </ConfirmActionButton>
        </div>
      </section>

      <section className="app-panel p-4">
        <h2 className="app-section-title mb-3">{t("web.settings.environment")}</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {ENVIRONMENT_ROWS.map(([name, descriptionKey]) => (
            <div key={name} className="rounded-lg border border-border-subtle bg-bg-secondary p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-[12px] font-semibold text-secondary">{name}</p>
                <button
                  type="button"
                  className="rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-secondary"
                  onClick={() => {
                    void navigator.clipboard.writeText(name);
                    toast.success(t("web.common.copied"));
                  }}
                  title={t("web.settings.copyEnv")}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
              <p className="mt-2 text-[12px] leading-5 text-muted">{t(descriptionKey)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
