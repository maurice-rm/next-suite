# `@next-suite/typescript-config`

The shared TypeScript compiler baseline for this repository. It is `private: true` and never published — pnpm links it into the workspace, and `packages/cli` is its only consumer, as a devDependency.

## One variant, no exports map

The package ships exactly one file that consumers use: `base.json`. There are no `react-library.json` / `nextjs.json` siblings, and the package holds no JavaScript at all.

Its `package.json` declares only `name`, `version`, `private` and `license` — in particular there is **no `exports` field**. That is what makes the import path work. Without an exports map, a package's directory stays resolvable file by file, so `@next-suite/typescript-config/base.json` resolves straight to the file on disk. Adding an `exports` map would seal the package root and break that path unless `./base.json` were listed explicitly.

## Usage

Extend it from a package's `tsconfig.json` and override what that package needs:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "@next-suite/typescript-config/base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["src"]
}
```

## What `base.json` sets

| Option                     | Value                               | Purpose                                                                          |
| -------------------------- | ----------------------------------- | -------------------------------------------------------------------------------- |
| `declaration`              | `true`                              | Emit `.d.ts` files alongside the JavaScript output                               |
| `declarationMap`           | `true`                              | Emit source maps for the declarations, so "go to definition" lands in the source |
| `esModuleInterop`          | `true`                              | Allow default imports from CommonJS modules                                      |
| `incremental`              | `false`                             | No `.tsbuildinfo` cache; every run is a full check                               |
| `isolatedModules`          | `true`                              | Reject constructs a single-file transpiler cannot handle                         |
| `lib`                      | `["es2022", "DOM", "DOM.Iterable"]` | Ambient types for ES2022 plus the browser DOM                                    |
| `module`                   | `"NodeNext"`                        | Emit the module format Node infers from the nearest `package.json`               |
| `moduleDetection`          | `"force"`                           | Treat every file as a module, so no file leaks globals                           |
| `moduleResolution`         | `"NodeNext"`                        | Resolve imports the way Node does, honouring `exports` maps                      |
| `noUncheckedIndexedAccess` | `true`                              | Index access yields `T \| undefined`, so lookups must be guarded                 |
| `resolveJsonModule`        | `true`                              | Allow importing `.json` files as typed values                                    |
| `skipLibCheck`             | `true`                              | Skip type-checking of `.d.ts` files in dependencies                              |
| `strict`                   | `true`                              | The full strict family, including `strictNullChecks` and `noImplicitAny`         |
| `target`                   | `"ES2022"`                          | Downlevel emit no further than ES2022                                            |

## What the CLI overrides

`packages/cli/tsconfig.json` extends this base and then changes most of the module- and emit-related settings, because the CLI is bundled by tsup rather than compiled by `tsc`:

| Option                           | Base value                          | CLI value                        | Why                                                            |
| -------------------------------- | ----------------------------------- | -------------------------------- | -------------------------------------------------------------- |
| `lib`                            | `["es2022", "DOM", "DOM.Iterable"]` | `["ES2022"]`                     | The CLI is a Node program, so the DOM libs are dropped         |
| `module`                         | `"NodeNext"`                        | `"ESNext"`                       | The bundler decides the output format                          |
| `moduleResolution`               | `"NodeNext"`                        | `"Bundler"`                      | Matches how tsup resolves imports, and enables the `@/*` alias |
| `declaration` / `declarationMap` | `true`                              | `false`                          | An application ships no type declarations                      |
| `noEmit`                         | unset                               | `true`                           | `tsc` only type-checks; tsup produces the output               |
| `types`                          | unset                               | `["node"]`                       | Load the Node ambient types                                    |
| `baseUrl` / `paths`              | unset                               | `"."` / `{ "@/*": ["./src/*"] }` | Provides the `@/…` import alias used throughout `src/`         |

What effectively survives from the base in the CLI build is the checking behaviour rather than the emit behaviour: `strict`, `noUncheckedIndexedAccess`, `isolatedModules`, `moduleDetection: "force"`, `esModuleInterop`, `resolveJsonModule`, `skipLibCheck`, `incremental: false` and `target: "ES2022"`.
