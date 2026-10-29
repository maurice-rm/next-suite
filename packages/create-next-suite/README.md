# create-next-suite

Create a Next.js app from plugins. Every choice, from the package manager to the database, is a
plugin, and plugins of your own, public or private, plug in the same way.

> Under construction: it generates a Next.js base project with a package manager of your choice;
> more plugins follow.

```bash
npx create-next-suite --help
```

The package ships two commands, `create-next-suite` and `next-suite`. `create-next-suite`
creates a project: it asks for the name and the package manager, writes the files, initializes
git, installs and commits. `next-suite` answers only `--help` and `--version` for now; once
released it manages plugin registries and trust. Plugin authors import the contract's types from
`create-next-suite/plugin`.

Requires Node.js 24.12 or newer.

## License

MIT
