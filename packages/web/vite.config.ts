import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/",
  server: {
    host: "127.0.0.1",
    port: 8080,
    proxy: { "/api": { target: "http://127.0.0.1:3000", changeOrigin: true } },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});