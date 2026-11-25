import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const devProxy = {
  target: "https://camera-history.com",
  changeOrigin: true,
};

export default defineConfig({
  base: "/",
  server: {
    host: "127.0.0.1",
    port: 8083,
    proxy: {
      "/api": devProxy,
      "/group": devProxy,
      "/widget": devProxy,
      "/assets": devProxy,
    },
  },
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
