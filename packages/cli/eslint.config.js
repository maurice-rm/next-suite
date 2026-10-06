import { config } from "@next-suite/eslint-config/base";
import { defineConfig } from "eslint/config";
import { createNodeResolver, importX } from "eslint-plugin-import-x";
import simpleImportSort from "eslint-plugin-simple-import-sort";

const LEAVES = [
  "./src/branding.ts",
  "./src/latest-version.ts",
  "./src/options.ts",
  "./src/package-managers.ts",
];
const ENTRY_POINTS = ["./src/index.ts", "./src/suite.ts"];
const WIZARD = "./src/wizard.ts";

/** The layering from AGENTS.md: each zone lists what its target must not import. */
const LAYER_ZONES = [
  ...LEAVES.map((leaf) => ({
    target: leaf,
    from: [
      "./src/core",
      "./src/ui",
      "./src/prompts",
      "./src/generator",
      "./src/post-steps",
      "./src/provision",
      WIZARD,
      ...ENTRY_POINTS,
    ],
  })),
  {
    target: WIZARD,
    from: [
      "./src/core",
      "./src/ui",
      "./src/prompts",
      "./src/generator",
      "./src/post-steps",
      "./src/provision",
      "./src/latest-version.ts",
      "./src/options.ts",
      "./src/package-managers.ts",
      ...ENTRY_POINTS,
    ],
  },
  {
    target: "./src/core",
    from: [
      "./src/ui",
      "./src/prompts",
      "./src/generator",
      "./src/post-steps",
      "./src/provision",
      WIZARD,
      ...ENTRY_POINTS,
    ],
  },
  {
    target: "./src/ui",
    from: [
      "./src/prompts",
      "./src/generator",
      "./src/post-steps",
      "./src/provision",
      ...ENTRY_POINTS,
    ],
  },
  {
    target: "./src/prompts",
    from: [
      "./src/generator",
      "./src/post-steps",
      "./src/provision",
      ...ENTRY_POINTS,
    ],
  },
  {
    target: ["./src/generator", "./src/post-steps"],
    from: [
      "./src/ui",
      "./src/prompts",
      "./src/provision",
      WIZARD,
      ...ENTRY_POINTS,
    ],
  },
  { target: "./src/generator", from: "./src/post-steps" },
  { target: "./src/post-steps", from: "./src/generator" },
  {
    target: "./src/provision",
    from: ["./src/prompts", "./src/post-steps", ...ENTRY_POINTS],
  },
  {
    target: "./src/provision",
    from: "./src/generator",
    except: ["./manifest.ts"],
  },
  {
    target: ["./src/prompts", "./src/provision", WIZARD, ...ENTRY_POINTS],
    from: "./src/ui",
    except: ["./index.ts"],
  },
];

export default defineConfig([
  config,
  { ignores: ["dist/**", "templates/**"] },
  {
    languageOptions: {
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    plugins: { "import-x": importX },
    settings: {
      "import-x/resolver-next": [
        createNodeResolver({
          extensions: [".ts", ".js", ".json"],
          tsconfig: { configFile: "./tsconfig.json" },
        }),
      ],
    },
    rules: {
      "import-x/no-cycle": "error",
      "import-x/no-restricted-paths": ["error", { zones: LAYER_ZONES }],
    },
  },
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
    files: ["**/*.test.ts", "src/**/__tests__/**"],
    rules: {
      "turbo/no-undeclared-env-vars": "off",
      "@typescript-eslint/no-magic-numbers": "off",
    },
  },
]);
