# `@next-suite/eslint-config`

The shared ESLint flat config for this repository. It is `private: true` and never published — pnpm links it into the workspace, and `packages/cli` is its only consumer, as a devDependency.

## Usage

The package exposes exactly one entry point, `@next-suite/eslint-config/base`, mapped to `base.js` by the `exports` field. There is no other subpath and no root export. It exports a named `config` array, so you spread it and add your own layers on top, as `packages/cli/eslint.config.js` does:

```js
import { config } from "@next-suite/eslint-config/base";
import simpleImportSort from "eslint-plugin-simple-import-sort";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  { ignores: ["dist/**", "templates/**"] },
  {
    plugins: { "simple-import-sort": simpleImportSort },
    rules: {
      "simple-import-sort/imports": ["error", { groups: [/* … */] }],
      "simple-import-sort/exports": "error",
    },
  },
];
```

## What the base config contributes

| Entry                                       | Kind         | Contribution                                                             |
| ------------------------------------------- | ------------ | ------------------------------------------------------------------------ |
| `@eslint/js` — `js.configs.recommended`     | Preset       | The core JavaScript recommended rules                                    |
| `eslint-config-prettier`                    | Preset       | Turns off every rule that would conflict with Prettier formatting        |
| `typescript-eslint` — `configs.recommended` | Preset       | The recommended TypeScript rules, spread in after the Prettier reset     |
| `eslint-plugin-turbo`                       | Plugin       | Registered as `turbo`, with `turbo/no-undeclared-env-vars` set to `warn` |
| `eslint-plugin-only-warn`                   | Plugin       | Registered for its load-time side effect — see below                     |
| `ignores: ["dist/**"]`                      | Ignore block | Keeps build output out of every lint run                                 |

## Linting is a report, not a gate

`eslint-plugin-only-warn` downgrades **every** rule severity to `warn` for the whole config, including rules a consumer sets to `"error"` explicitly. Combined with `eslint .` being run without `--max-warnings`, that means ESLint reports zero errors and exits 0 no matter what the rules find.

This is intentional — lint findings never block work — but be clear about the consequence: the CI lint job cannot fail, so it tells you something only if you read its output. The checks that actually gate a change are `check-types`, `build` and `test`.

Verify it yourself:

```bash
printf 'const x = 1\nexport const y: any = 1\n' \
  | pnpm --filter create-next-suite exec eslint --stdin --stdin-filename src/tmp.ts
# 2 problems (0 errors, 2 warnings) — exit code 0
```

## Notes

- The consumer overlay lives in `packages/cli/eslint.config.js`: it ignores `dist/**` and `templates/**`, and adds `eslint-plugin-simple-import-sort` with an explicit import-group order (side effects, `node:` builtins, npm packages, the `@/` alias, everything else, relative imports). Test files there get `turbo/no-undeclared-env-vars` switched off.
- `globals` is declared as a devDependency in `package.json`, but `base.js` never imports it. Nothing in this package uses it.
- The `eslint`, `typescript` and `prettier` versions come from the `catalog:` block in `pnpm-workspace.yaml`.
