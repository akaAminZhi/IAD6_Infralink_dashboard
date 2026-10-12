import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { liveDataPlugin } from "./liveDataPlugin.js";
import { liveReportsPlugin } from "./liveReportsPlugin.js";

export default defineConfig({
  build: { copyPublicDir: process.env.IAD6_PREVIEW_BUILD !== "1" },
  resolve: { dedupe: ["react", "react-dom"] },
  plugins: [react(), liveDataPlugin(), liveReportsPlugin()],
  server: {
    allowedHosts: [".ngrok-free.app", ".trycloudflare.com"],
    proxy: { "/api/automation": { target: "http://127.0.0.1:8765", changeOrigin: true, headers: { "X-IAD6-Proxied": "1" } } },
  },
  preview: {
    allowedHosts: [".ngrok-free.app", ".trycloudflare.com"],
    proxy: { "/api/automation": { target: "http://127.0.0.1:8765", changeOrigin: true, headers: { "X-IAD6-Proxied": "1" } } },
  },
});
