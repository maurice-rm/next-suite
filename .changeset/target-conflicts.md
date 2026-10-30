---
"create-next-suite": minor
---

Handle a target directory that already has files: the wizard asks whether to empty it (everything but `.git`, never the current directory), keep the files and write over them, or cancel; without a terminal `--empty` or `--overwrite` decides. Harmless entries such as `.git`, `LICENSE` or `.vscode` do not count as files.
