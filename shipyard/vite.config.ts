import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const uiRoot = path.join(packageRoot, "ui");

export default defineConfig({
  root: uiRoot,
  plugins: [react()],
  build: {
    outDir: path.join(packageRoot, "dist/ui"),
    emptyOutDir: false,
    rollupOptions: {
      input: {
        main: path.resolve(uiRoot, "index.html"),
        preview: path.resolve(uiRoot, "preview.html"),
      },
    },
  },
  server: {
    host: "127.0.0.1",
  },
});
