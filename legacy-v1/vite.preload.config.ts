import { resolve } from "node:path";

import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, "src/electron/preload.ts"),
      fileName: () => "preload.cjs",
      formats: ["cjs"],
    },
    outDir: "dist/electron",
    rollupOptions: {
      external: ["electron"],
    },
    sourcemap: true,
    target: "node24",
  },
});
