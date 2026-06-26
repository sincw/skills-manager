import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Check, ChevronRight, Folder, Loader2, RefreshCw, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../utils";
import * as api from "../lib/tauri";
import type { DirectoryListing } from "../lib/tauri";

interface Props {
  open: boolean;
  title: string;
  initialPath?: string;
  confirmLabel?: string;
  description?: string;
  allowManualPath?: boolean;
  onClose: () => void;
  onSelect: (path: string) => Promise<void> | void;
}

export function DirectoryPickerDialog({
  open,
  title,
  initialPath,
  confirmLabel,
  description,
  allowManualPath = false,
  onClose,
  onSelect,
}: Props) {
  const { t } = useTranslation();
  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [inputPath, setInputPath] = useState("");
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const loadDirectory = useCallback(async (path?: string) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const next = await api.browseDirectories(path);
      if (requestId !== requestIdRef.current) return;
      setListing(next);
      setInputPath(next.path);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError(err instanceof Error ? err.message : t("project.directoryPickerError"));
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [t]);

  useEffect(() => {
    if (!open) return;
    setListing(null);
    setInputPath(initialPath?.trim() ?? "");
    setError(null);
    setSelecting(false);
    void loadDirectory(initialPath?.trim() || undefined);
  }, [initialPath, loadDirectory, open]);

  if (!open) return null;

  const handleSelect = async () => {
    const selectedPath = allowManualPath ? inputPath.trim() : listing?.path;
    if (!selectedPath) return;
    setSelecting(true);
    setError(null);
    try {
      await onSelect(selectedPath);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.requestFailed"));
    } finally {
      setSelecting(false);
    }
  };

  const canInteract = !loading && !selecting;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => canInteract && onClose()} />
      <div className="relative flex max-h-[min(640px,calc(100vh-48px))] w-full max-w-[560px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border-subtle p-5 pb-4">
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-primary">{title}</h2>
            {description ? (
              <p className="mt-1 text-[12px] leading-5 text-muted">{description}</p>
            ) : null}
            <p className="mt-1 truncate text-[12px] text-muted" title={listing?.path ?? inputPath}>
              {listing?.path ?? inputPath}
            </p>
          </div>
          <button
            onClick={() => canInteract && onClose()}
            disabled={!canInteract}
            className="rounded p-1 text-muted outline-none transition-colors hover:text-secondary disabled:opacity-50"
            title={t("project.directoryPickerClose")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-3 p-5">
          <div className="flex gap-2">
            <input
              type="text"
              value={inputPath}
              onChange={(event) => setInputPath(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && inputPath.trim()) {
                  void loadDirectory(inputPath.trim());
                }
              }}
              placeholder={t("project.directoryPickerPathPlaceholder")}
              className="min-w-0 flex-1 rounded-[4px] border border-border-subtle bg-background px-3 py-2 text-[13px] text-secondary outline-none transition-colors placeholder-faint focus:border-border"
              disabled={!canInteract}
            />
            <button
              onClick={() => void loadDirectory(inputPath.trim() || undefined)}
              disabled={!canInteract}
              className="rounded-[4px] border border-border-subtle bg-background px-2.5 text-muted outline-none transition-all hover:border-border hover:text-secondary disabled:opacity-50"
              title={t("project.directoryPickerRefresh")}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </button>
          </div>

          {error ? (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[12px] text-red-500">
              {error}
            </div>
          ) : null}

          <div className="min-h-[260px] flex-1 overflow-y-auto rounded-lg border border-border-subtle bg-background">
            {listing?.parent ? (
              <button
                onClick={() => void loadDirectory(listing.parent ?? undefined)}
                disabled={!canInteract}
                className="flex w-full items-center gap-2 border-b border-border-subtle px-3 py-2.5 text-left text-[13px] text-tertiary outline-none transition-colors hover:bg-surface-hover hover:text-secondary disabled:opacity-50"
              >
                <ArrowUp className="h-4 w-4 text-muted" />
                <span className="min-w-0 flex-1 truncate">..</span>
              </button>
            ) : null}

            {listing && listing.entries.length === 0 ? (
              <div className="px-3 py-8 text-center text-[13px] text-muted">
                {t("project.directoryPickerEmpty")}
              </div>
            ) : null}

            {listing?.entries.map((entry) => (
              <button
                key={entry.path}
                onClick={() => void loadDirectory(entry.path)}
                disabled={!canInteract}
                className="flex w-full items-center gap-2 border-b border-border-subtle px-3 py-2.5 text-left text-[13px] text-tertiary outline-none transition-colors last:border-b-0 hover:bg-surface-hover hover:text-secondary disabled:opacity-50"
                title={entry.path}
              >
                <Folder className="h-4 w-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
              </button>
            ))}

            {loading && !listing ? (
              <div className="flex min-h-[260px] items-center justify-center text-muted">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border-subtle p-5 pt-4">
          <button
            onClick={() => canInteract && onClose()}
            disabled={!canInteract}
            className="rounded-[4px] px-3 py-1.5 text-[13px] font-medium text-tertiary outline-none transition-colors hover:bg-surface-hover hover:text-secondary disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSelect}
            disabled={!(allowManualPath ? inputPath.trim() : listing) || loading || selecting}
            className={cn(
              "flex items-center gap-2 rounded-[4px] border border-accent-border bg-accent-dark px-3 py-1.5 text-[13px] font-medium text-white outline-none transition-colors hover:bg-accent",
              (!(allowManualPath ? inputPath.trim() : listing) || loading || selecting) && "cursor-not-allowed opacity-50",
            )}
          >
            {selecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {selecting ? t("common.loading") : confirmLabel ?? t("project.directoryPickerSelect")}
          </button>
        </div>
      </div>
    </div>
  );
}
