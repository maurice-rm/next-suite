import { cpSync, rmSync } from "node:fs";

import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/suite.ts"],
  format: ["esm"],
  target: "node24",
  clean: true,
  onSuccess: async () => {
    rmSync("dist/templates", { recursive: true, force: true });
    cpSync("templates", "dist/templates", { recursive: true });
  },
});
