---
"create-next-suite": minor
---

Every generated project describes itself. `next-suite.config.ts` holds the project's settings, its plugins and every answer, typed with `defineSuiteConfig` from the new `create-next-suite/config` against the plugins in `.next-suite/types.d.ts`, so a misspelled plugin name or an answer that is none of the choices is an error in the editor. `.next-suite/lock.json` replaces `next-suite.json`: it records the generator, every plugin with its source and version or content hash, every answer, a hash of every generated file and which plugin did what to it. The project gets `create-next-suite` as a devDependency, pinned to the version that created it. `create-next-suite --config <file>` creates the same project again from a config, with project plugins under `next-suite/plugins/`, plugins defined in the config with `definePlugin`, and overrides under `next-suite/overrides/` that replace generated files.
