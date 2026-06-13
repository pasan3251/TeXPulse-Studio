import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    emptyOutDir: false,
    outDir: "dist/renderer",
    sourcemap: true,
    target: "chrome142",
  },
  plugins: [react()],
});
