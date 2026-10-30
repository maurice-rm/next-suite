# Security policy

## Supported versions

next-suite is before its first release of this code base. Security fixes land in the latest
published version of `create-next-suite`; older versions are not patched.

## What counts as a vulnerability

create-next-suite runs plugins, and a plugin is a `plugin.ts` that runs as code on your machine.
The protection is transparency and your consent, not isolation: a plugin from a source you have
not trusted runs only after you allow it.

- **A vulnerability:** anything that lets a plugin bypass that consent, write outside the project
  directory, or reach files, processes or the network through create-next-suite itself; and any
  flaw in what create-next-suite generates that makes a new project insecure by default.
- **Not a vulnerability:** what a plugin's code does after you trusted its source or allowed it
  to run. Report that to the plugin's author.

A project's `next-suite.config.ts`, the plugins under its `next-suite/plugins/` and the plugins
its config defines in place are the project's own code: creating a project from its config with
`--config` runs them without asking, as `npm run` runs a project's scripts. Only create projects
from configs you would run the scripts of. External plugins a config names still need your trust.

## Reporting a vulnerability

Please report a vulnerability privately through
[GitHub's private vulnerability reporting](https://github.com/maurice-rm/next-suite/security/advisories/new),
not in a public issue or pull request.

Include what you found, how to reproduce it, and which version is affected. You will get an
answer within seven days. Once a fix is released, the advisory is published with credit to you,
unless you prefer otherwise.
