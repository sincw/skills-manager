import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@tauri-apps/api/core": path.resolve(__dirname, "src/lib/browser-shims.ts"),
      "@tauri-apps/api/event": path.resolve(__dirname, "src/lib/browser-shims.ts"),
      "@tauri-apps/api/window": path.resolve(__dirname, "src/lib/browser-shims.ts"),
      "@tauri-apps/plugin-dialog": path.resolve(__dirname, "src/lib/browser-shims.ts"),
      "@tauri-apps/plugin-opener": path.resolve(__dirname, "src/lib/browser-shims.ts"),
      "@tauri-apps/plugin-clipboard-manager": path.resolve(__dirname, "src/lib/browser-shims.ts"),
      "@tauri-apps/plugin-updater": path.resolve(__dirname, "src/lib/browser-shims.ts"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: false,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:17321",
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: false,
  },
});
