import { config } from "@next-suite/eslint-config/base";
import simpleImportSort from "eslint-plugin-simple-import-sort";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  { ignores: ["dist/**", "templates/**"] },
  {
    plugins: { "simple-import-sort": simpleImportSort },
    rules: {
      "simple-import-sort/imports": [
        "error",
        {
          groups: [
            ["^\\u0000"], // Side-effect imports.
            ["^node:"], // Node.js builtins.
            ["^@?\\w"], // npm packages.
            ["^@/"], // Internal alias.
            ["^"], // Anything else (e.g. ../package.json).
            ["^\\."], // Relative imports.
          ],
        },
      ],
      "simple-import-sort/exports": "error",
    },
  },
  {
    files: ["**/*.test.ts"],
    rules: { "turbo/no-undeclared-env-vars": "off" },
  },
];
