import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8082",
      // ExecutionEngine (paper-trading order execution service) — separate app/port,
      // proxied here rather than given CORS so nothing about that service changes.
      "/exec-api": {
        target: "http://localhost:8081",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/exec-api/, "/api/v1"),
      },
    },
  },
});
