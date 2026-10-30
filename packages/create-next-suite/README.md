# create-next-suite

Create a Next.js app from plugins. Every choice, from the package manager to the linter, is a
plugin, and plugins of your own, public or private, plug in the same way.

> Under construction: the quick start covers a package manager, styling, linting, formatting,
> unused code, git hooks, unit tests, environment validation, logging, security headers, SEO, CI
> and AGENTS.md; more plugins follow.

## Create an app

```bash
npm create next-suite@latest
pnpm create next-suite
yarn create next-suite
bun create next-suite
```

The wizard asks for the project directory, the package manager and whether to take the quick
start, then writes the files, initializes git, installs the dependencies and makes the first
commit. The package manager that started the run is preselected.

Requires Node.js 24.12 or newer.

## Options

| Flag                         | What it does                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `[directory]`                | the project name or path, `.` for the current directory                      |
| `-y, --yes`                  | answers every open question with its default; needs a directory              |
| `--answers <file>`           | reads answers from a JSON file in the format of `answers` in next-suite.json |
| `--dry-run`                  | shows what would be created and writes nothing; `--diff` adds file contents  |
| `--overwrite`, `--empty`     | writes into a directory that has files, keeping or removing them             |
| `--plugin <address>`         | adds a plugin from a directory, npm, GitHub, GitLab, Git or a URL; see below |
| `--trust <pattern>`          | lets plugins from matching sources run code, for this run                    |
| `--package-manager <plugin>` | `npm`, `pnpm`, `yarn` or `bun`                                               |
| `--<category> <plugin>`      | picks a plugin of a category, such as `--linter biome`                       |
| `--no-<category>`            | leaves a category empty, such as `--no-styling`                              |
| `--no-git`, `--no-install`   | skips git or the install                                                     |

`npx create-next-suite@latest --help` lists every flag. With `npm create`, flags follow a `--`:
`npm create next-suite@latest my-app -- --yes`.

## Plugins of your own

```bash
npx create-next-suite@latest my-app --plugin github:acme/plugins/mail#v1 --mail
```

`--plugin` loads a plugin, a directory with a `plugin.ts`, from a local directory, npm, GitHub,
GitLab, Git, a tarball URL or a registry; its questions and flags join the built-in ones. Its
metadata are read without running it; its code runs only once you trust it: in the terminal, with
`--trust <pattern>` or through `next-suite trust add`. A local directory is trusted, and a trusted
plugin whose content changed is asked about again.

## Without questions

```bash
npx create-next-suite@latest my-app --yes --package-manager pnpm --linter biome --no-styling
```

Or keep the answers in a file, such as `answers.json`:

```json
{ "linter": "biome", "styling": [], "unit-tests": null }
```

```bash
npx create-next-suite@latest my-app --answers answers.json --yes
```

## The `next-suite` command

The package ships a second command for plugin registries, trust and plugin authors:

```bash
npx -p create-next-suite next-suite registry add @acme github:acme/next-suite-plugins
npx -p create-next-suite next-suite trust add "github:acme/*"
npx -p create-next-suite next-suite plugin validate ./my-plugin
```

| Command                                          | What it does                                              |
| ------------------------------------------------ | --------------------------------------------------------- |
| `registry add <name> <source>`, `list`, `remove` | manages the registries `--plugin @name/plugin` loads from |
| `trust add <pattern>`, `list`, `remove`          | manages the sources whose plugins may run code            |
| `plugin validate <directory>`                    | checks a plugin and runs its `plugin.ts` on its own       |

## For plugin authors

| Import                                    | What it holds                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| `create-next-suite/plugin`                | `definePlugin`, the points and the types of a plugin                             |
| `create-next-suite/testing`               | `createTestProject`, which generates a project and runs its scripts              |
| `create-next-suite/schemas/registry.json` | the JSON schema of `registry.json`                                               |

The [documentation](https://github.com/maurice-rm/next-suite/tree/main/apps/docs/content/docs)
explains how to write, test and share plugins.

## License

MIT
