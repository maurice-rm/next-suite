# `@next-suite/eslint-config`

The shared ESLint flat config for this repository. It is `private: true` and never published — pnpm links it into the workspace, and `packages/cli` is its only consumer, as a devDependency.

## Usage

The package exposes one entry point, `@next-suite/eslint-config/base`, mapped to `base.js` by the `exports` field. It exports a named `config`; a consumer adds it to its own flat config and sets `parserOptions.tsconfigRootDir` for type-aware linting, as `packages/cli/eslint.config.js` does:

```js
import { config } from "@next-suite/eslint-config/base";
import { defineConfig } from "eslint/config";

export default defineConfig([
  config,
  {
    languageOptions: {
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
  },
]);
```

## What the base config contributes

| Entry                                                             | Contribution                                                                                                                                                                  |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@eslint/js` — `js.configs.recommended`                           | The core JavaScript recommended rules                                                                                                                                         |
| `typescript-eslint` — `strictTypeChecked`, `stylisticTypeChecked` | Type-aware strict and stylistic rules through `projectService`; the version is pinned exactly, since the strict configs change in minors                                      |
| Code rules                                                        | `@typescript-eslint/naming-convention` (boolean predicates need `is`/`has`/`can`/…), `max-params: 3`, `max-depth: 2`, `complexity: 15`, `@typescript-eslint/no-magic-numbers` |
| `eslint-plugin-turbo`                                             | `turbo/no-undeclared-env-vars` as an error                                                                                                                                    |
| `disableTypeChecked` for `*.{js,mjs,cjs}`                         | Config files lint without type information                                                                                                                                    |
| `eslint-config-prettier`                                          | Turns off every rule that would conflict with Prettier formatting                                                                                                             |
| `ignores: ["dist/**"]`                                            | Keeps build output out of every lint run                                                                                                                                      |

Every rule is an error, and the consumer's `lint` script runs with `--max-warnings 0`, so lint gates CI like `check-types`, `build` and `test` do.

## Notes

- The consumer overlay lives in `packages/cli/eslint.config.js`: it adds `eslint-plugin-simple-import-sort` with an explicit import-group order, `import-x/no-cycle`, and `import-x/no-restricted-paths` zones that enforce the CLI's layering (see `packages/cli/AGENTS.md`). Test files there get `turbo/no-undeclared-env-vars` and `no-magic-numbers` switched off.
- The `eslint`, `typescript` and `prettier` versions come from the `catalog:` block in `pnpm-workspace.yaml`.
