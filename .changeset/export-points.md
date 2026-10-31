---
"create-next-suite": minor
---

Every point create-next-suite defines now comes with `create-next-suite/points`, with its type and collector. The points of the core `builtDependencies`, `lintIgnores` and `ciChecks` and `createBuiltDependencies`, `createLintIgnores` and `createCiChecks` moved there from `create-next-suite/plugin`. The points of the built-in plugins are published too: `lintStaged`, `prettierPlugins`, `knip`, `csp`, `logRedact`, `testSetup` and `agents`, with `createLintStagedCommands`, `createPrettierPlugins`, `createKnipOptions`, `createCspSources`, `createLogRedact`, `createTestSetup` and `createAgentSections`, so an external plugin contributes to them typed under `extend`, exactly like a built-in plugin.
