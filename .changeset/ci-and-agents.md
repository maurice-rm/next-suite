---
"create-next-suite": minor
---

Add GitHub Actions, which runs the checks the plugins contribute with actions pinned by commit, and AGENTS.md with CLAUDE.md for coding agents. Without AGENTS.md the project sets `agentRules: false`, so `next dev` writes none. Plugins can contribute only when a condition holds, CI checks and AGENTS.md sections.
