import { useCallback, type MouseEventHandler } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Returns a mousedown handler matching the desktop drag API shape.
 */
export function useDragWindow(): MouseEventHandler {
  return useCallback((e) => {
    if (e.buttons === 1 && e.detail === 1) {
      getCurrentWindow().startDragging();
    }
  }, []);
}
