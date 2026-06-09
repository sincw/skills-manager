/// <reference types="vite/client" />

declare module "@tauri-apps/api/event" {
  export type UnlistenFn = () => void;
  export interface Event<T> {
    payload: T;
  }
  export function listen<T = unknown>(
    event: string,
    handler: (event: Event<T>) => void,
  ): Promise<UnlistenFn>;
}

declare module "@tauri-apps/api/window" {
  export function getCurrentWindow(): {
    startDragging(): Promise<void>;
  };
}

declare module "@tauri-apps/plugin-dialog" {
  export interface DialogFilter {
    name: string;
    extensions: string[];
  }
  export interface OpenDialogOptions {
    directory?: boolean;
    multiple?: boolean;
    filters?: DialogFilter[];
  }
  export function open(options?: OpenDialogOptions): Promise<string | string[] | null>;
  export function confirm(message: string): Promise<boolean>;
}

declare module "@tauri-apps/plugin-opener" {
  export function openUrl(url: string): Promise<void>;
}

declare module "@tauri-apps/plugin-clipboard-manager" {
  export function writeText(text: string): Promise<void>;
}

declare module "@tauri-apps/plugin-updater" {
  export interface Update {
    downloadAndInstall(): Promise<void>;
  }
  export function check(): Promise<Update | null>;
}
