# next-suite

next-suite creates Next.js apps from plugins. Every choice, from the package manager to the
database, is a plugin, and plugins of your own, public or private, plug in the same way.

> next-suite is under construction. `create-next-suite` generates the Next.js base project with
> the plugins of the quick start, from the package manager to CI; more plugins follow. The first
> release of this code base will be 2.0.0.

## Repository

| Path                         | What it is                                                                |
| ---------------------------- | ------------------------------------------------------------------------- |
| `packages/create-next-suite` | the CLI, published to npm, with its built-in plugins and the base project |
| `packages/integration`       | tests that run the built CLI the way a user does                          |
| `packages/tsconfig`          | the shared TypeScript configuration                                       |
| `apps/docs`                  | the documentation, a Fumadocs app exported as a static site               |

## Prerequisites

- Node.js 24.12 or newer (`.nvmrc` names the major version)
- pnpm, in the version `packageManager` in `package.json` pins; Corepack or pnpm itself picks it

## Setup

```bash
pnpm install
```

## Commands

| Command            | What it does                                              |
| ------------------ | --------------------------------------------------------- |
| `pnpm build`       | builds every package and the documentation                |
| `pnpm test`        | runs the tests; the integration tests build the CLI first |
| `pnpm test:types`  | runs the type tests                                       |
| `pnpm check-types` | type-checks every package                                 |
| `pnpm lint`        | checks formatting and lint rules with Biome               |
| `pnpm lint:fix`    | applies Biome's fixes                                     |
| `pnpm knip`        | finds unused files, exports and dependencies              |
| `pnpm boundaries`  | checks which packages may depend on which                 |
| `pnpm dev`         | serves the documentation on http://localhost:3020         |
| `pnpm changeset`   | records a change for the next release                     |

Try the CLI after a build:

```bash
node packages/create-next-suite/dist/create-next-suite.mjs --help
```

Generate a scenario of `packages/integration/scenarios` with a package manager, install it and run
the generated project's checks, as CI does:

```bash
pnpm turbo build --filter=create-next-suite
pnpm --filter @next-suite/integration matrix base pnpm
```

`NEXT_SUITE_ENGINE=v2` in front of either command generates with the engine that assembles the
project from plugins written as `plugin.ts`; so far it runs the base project and the package
managers, as in the scenario `bare`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md). Vulnerabilities are reported
as [SECURITY.md](SECURITY.md) describes.

## License

[MIT](LICENSE)
