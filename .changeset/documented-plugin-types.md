---
"create-next-suite": minor
---

`create-next-suite/plugin` exports plain TypeScript types with a description for every field, and its declarations no longer import zod. Besides `PluginManifest`, `PluginOption`, `Condition`, `Category`, `Logic`, `LogicContext` and `LogicResult`, it exports the parts they are built from, such as `Contributions`, `PluginFile`, `EnvVariable` and `PostStep`, and `CategoriesFile` and `ListedCategory` for categories.json as written. The JSON schemas describe every field with the same words and name their definitions after these types. `create-next-suite/testing` names the result of `run` as `ScriptResult`.
