---
"create-next-suite": minor
---

Add plugins of your own with `--plugin <address>`, repeatable: a local folder loads directly, and its questions, flags and files join those of the built-in plugins. next-suite.json records the address of every external plugin. Addresses for npm, GitHub, GitLab, Git, URLs and registries are recognized; their loaders follow.
