---
"create-next-suite": minor
---

Add pnpm, npm, Yarn and Bun as package manager plugins with supply-chain defaults: new releases install after a day, dependency builds run only when allowed, and package.json pins the manager in `packageManager` and `devEngines`. After writing, the run initializes git, installs, runs the plugins' post-step scripts and commits, each on a best-effort basis; `--no-install` and `--no-git` or the wizard turn them off. The package manager that started the run is preselected and marked as detected; Yarn 1 is rejected with the way to Yarn 4.

`create-next-suite` asks the questions of its built-in plugins, grouped by wizard section.
