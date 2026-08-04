# Documentation

Documentation for [`create-next-suite`](https://www.npmjs.com/package/create-next-suite) and its companion `next-suite` server tooling.

For a quick start, see the [project README](../README.md). This directory holds the detail.

## I want to…

| Goal                                                   | Read                                                                 |
| ------------------------------------------------------ | -------------------------------------------------------------------- |
| See every flag, wizard step, and exit code             | [CLI reference](cli-reference.md)                                    |
| Know what ends up in my project, and why               | [The generated project](generated-project.md)                        |
| Understand the env vars, scripts, or `next-suite.json` | [The generated project](generated-project.md)                        |
| Put a generated project on a server                    | [Provisioning](provisioning.md)                                      |
| Prepare a server so `provision` will run               | [Server requirements](server-requirements.md)                        |
| Fix something that went wrong                          | [Troubleshooting](troubleshooting.md)                                |
| Work on the CLI itself                                 | [Architecture](architecture.md) · [Contributing](../CONTRIBUTING.md) |
| Report a vulnerability, or audit what `provision` does | [Security](../SECURITY.md)                                           |

## The documents

**[CLI reference](cli-reference.md)** — Both binaries in full: every `create-next-suite` flag with its real default, the `--yes` validation rules and their exact messages, all wizard steps in order with their question text and branching, back-navigation keys, and exit codes.

**[The generated project](generated-project.md)** — What scaffolding produces: the file tree per feature, the feature matrix with pinned package versions, the npm scripts, every environment variable, how `package.json` / `.env.example` / `.prettierrc.json` are merged rather than overwritten, the `next-suite.json` manifest schema, and the post-generation steps with their failure behaviour.

**[Provisioning](provisioning.md)** — `next-suite provision` / `deprovision` / `config`: what runs on the server, in what order, what it creates, what a second run reuses, the GitHub integration, and the known limitations.

**[Server requirements](server-requirements.md)** — What a server needs before `provision` will run, and why each piece is there. `provision` installs nothing; this is the prerequisite side of it.

**[Troubleshooting](troubleshooting.md)** — Symptom-first. A lookup table from what you are seeing to the cause and the fix, for both scaffolding and provisioning.

**[Architecture](architecture.md)** — For working on the CLI: the monorepo layout, the two-phase flow, the import layering, the generation pipeline, the registries, and how verification works.

## Related

- [Contributing](../CONTRIBUTING.md) — setup, daily commands, the verification bar, changesets, PR expectations
- [Security](../SECURITY.md) — reporting a vulnerability, and the security model of `provision`
- [Changelog](../packages/cli/CHANGELOG.md) — released versions
- [`packages/cli/AGENTS.md`](../packages/cli/AGENTS.md) — conventions and extension points, written for coding agents

## Keeping this current

A change to flags, wizard steps, generated output, or provisioning behaviour updates the matching document here in the same pull request. Planning and design notes are not published documentation — they live in `docs/superpowers/`, which is gitignored.
