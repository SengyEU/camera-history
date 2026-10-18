import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  base: "/",
  server: { host: "127.0.0.1", port: 8081 },
  build: {
    rollupOptions: {
      input: {
        landing: fileURLToPath(new URL("./index.html", import.meta.url)),
        deck: fileURLToPath(new URL("./deck/index.html", import.meta.url)),
      },
    },
  },
  test: {
    environment: "node",
  },
});
