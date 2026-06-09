/* eslint-disable react-refresh/only-export-components */
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, CheckCircle2, Clock3, Loader2, XCircle } from "lucide-react";
import { cn } from "../utils";
import type { WebJob } from "../lib/tauri";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="app-page-header flex items-start justify-between gap-4">
      <div>
        <h1 className="app-page-title">{title}</h1>
        {description ? <p className="app-page-subtitle">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="app-panel flex min-h-[180px] flex-col items-center justify-center px-6 py-8 text-center">
      <p className="text-[14px] font-semibold text-secondary">{title}</p>
      <p className="mt-2 max-w-md text-[13px] leading-5 text-muted">{description}</p>
    </div>
  );
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{label}</p>
      <div className="mt-1 min-w-0 break-words text-[13px] text-secondary">{value}</div>
    </div>
  );
}

export function JobStatusBadge({ status }: { status: WebJob["status"] }) {
  const { t } = useTranslation();
  const iconMap = {
    queued: Clock3,
    running: Loader2,
    succeeded: CheckCircle2,
    failed: XCircle,
    canceled: AlertCircle,
  };
  const Icon = iconMap[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-medium",
        status === "succeeded" && "border-emerald-500/25 bg-emerald-500/10 text-emerald-500",
        status === "failed" && "border-red-500/25 bg-red-500/10 text-red-500",
        status === "running" && "border-sky-500/25 bg-sky-500/10 text-sky-500",
        status === "queued" && "border-border-subtle bg-surface-hover text-muted",
        status === "canceled" && "border-amber-500/25 bg-amber-500/10 text-amber-500",
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", status === "running" && "animate-spin")} />
      {t(`web.status.${status}`)}
    </span>
  );
}

export function formatTime(value: number | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export function ConfirmActionButton({
  title,
  message,
  confirmLabel,
  className,
  children,
  disabled,
  onConfirm,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  className: string;
  children: ReactNode;
  disabled?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className={className} disabled={disabled} onClick={() => setOpen(true)}>
        {children}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <button
            type="button"
            aria-label={t("web.common.close")}
            className="absolute inset-0 cursor-default bg-black/60"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-2xl">
            <h2 className="text-[14px] font-semibold text-primary">{title}</h2>
            <p className="mt-2 text-[13px] leading-5 text-muted">{message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="app-button-secondary py-1.5"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                {t("web.common.cancel")}
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-500/30 bg-red-600/90 px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={busy}
                onClick={handleConfirm}
              >
                {busy ? t("web.common.working") : confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
