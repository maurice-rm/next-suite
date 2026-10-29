# next-suite

next-suite creates Next.js apps from plugins. Every choice, from the package manager to the
database, is a plugin, and plugins of your own, public or private, plug in the same way.

> next-suite is under construction. `create-next-suite` does not generate projects yet; its
> first release of this code base will be 2.0.0.

## Repository

| Path                         | What it is                                                         |
| ---------------------------- | ------------------------------------------------------------------ |
| `packages/create-next-suite` | the CLI, published to npm, with the `create-next-suite` and `next-suite` commands |
| `packages/integration`       | tests that run the built CLI the way a user does                   |
| `packages/tsconfig`          | the shared TypeScript configuration                                |
| `apps/docs`                  | the documentation, a Fumadocs app exported as a static site         |

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

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md). Vulnerabilities are reported
as [SECURITY.md](SECURITY.md) describes.

## License

[MIT](LICENSE)
