import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: { dedupe: ["react", "react-dom"] },
  plugins: [react()],
  server: {
    allowedHosts: [".ngrok-free.app", ".trycloudflare.com"],
    proxy: { "/api/automation": { target: "http://127.0.0.1:8765", changeOrigin: true, headers: { "X-IAD6-Proxied": "1" } } },
  },
  preview: {
    allowedHosts: [".ngrok-free.app", ".trycloudflare.com"],
    proxy: { "/api/automation": { target: "http://127.0.0.1:8765", changeOrigin: true, headers: { "X-IAD6-Proxied": "1" } } },
  },
});
