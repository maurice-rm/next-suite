---
"create-next-suite": patch
---

Harden a few edge cases:

- The post-generation `fix` step no longer runs after a failed install, which
  previously surfaced a second error for the same root cause.
- `--shadcn-preset` is validated in `--yes` mode the same way the interactive
  wizard validates it, instead of being passed to `shadcn/create` unchecked.
- `--help` now shows the full package description.
- The Better-Auth and CD-workflow feature guards are self-sufficient, so a
  hand-built config can't emit a project that references files it never
  generated.
