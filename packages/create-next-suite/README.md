# create-next-suite

Create a Next.js app from plugins. Every choice, from the package manager to the database, is a
plugin, and plugins of your own, public or private, plug in the same way.

> Under construction: this version does not generate projects yet.

```bash
npx create-next-suite --help
```

The package ships two commands, `create-next-suite` and `next-suite`. For now
`create-next-suite` asks the questions of its built-in plugins, such as the package manager, and
generates nothing yet; `next-suite` answers only `--help` and `--version`. Once released,
`create-next-suite` creates a project, `next-suite` manages plugin registries and trust, and
plugin authors import the contract's types from `create-next-suite/plugin`.

Requires Node.js 24.12 or newer.

## License

MIT
