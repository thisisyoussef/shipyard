import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(packageRoot, "ui"),
  plugins: [react()],
  build: {
    outDir: path.join(packageRoot, "dist/ui"),
    emptyOutDir: false,
  },
  server: {
    host: "127.0.0.1",
  },
});
