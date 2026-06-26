export type LocalPathPickerMode = "folder" | "archive" | "batch";

export type LocalPathSelection =
  | { sourcePath: string; fallbackMode: null }
  | { sourcePath: null; fallbackMode: LocalPathPickerMode }
  | { sourcePath: null; fallbackMode: null };

export function singleSelectedPath(selected: string | string[] | null): string | null {
  if (Array.isArray(selected)) return selected[0] ?? null;
  return selected;
}

export function resolveLocalPathSelection(
  selected: string | string[] | null,
  fallbackMode: LocalPathPickerMode,
  fallbackAvailable = true,
): LocalPathSelection {
  const sourcePath = singleSelectedPath(selected);
  if (sourcePath) return { sourcePath, fallbackMode: null };
  return fallbackAvailable
    ? { sourcePath: null, fallbackMode }
    : { sourcePath: null, fallbackMode: null };
}
