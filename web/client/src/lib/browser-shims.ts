export type UnlistenFn = () => void;

export async function open(options?: { directory?: boolean; multiple?: boolean }): Promise<string | string[] | null> {
  void options;
  return null;
}

export async function confirm(_message: string): Promise<boolean> {
  void _message;
  return false;
}

export async function openUrl(url: string): Promise<void> {
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function writeText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export async function listen(_event: string, _handler: (event: unknown) => void): Promise<UnlistenFn> {
  void _event;
  void _handler;
  return () => {};
}

export function getCurrentWindow() {
  return {
    async startDragging(): Promise<void> {
      return undefined;
    },
  };
}

export async function check(): Promise<{ downloadAndInstall(): Promise<void> } | null> {
  return null;
}

export async function invoke<T>(_command: string, _args?: unknown): Promise<T> {
  void _command;
  void _args;
  throw new Error("Tauri invoke is not available in the Web companion");
}
