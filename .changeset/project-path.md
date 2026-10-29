---
"create-next-suite": minor
---

Align the wizard with the familiar flow: the project is asked as a name or a path ("." for the current directory, nothing outside it), the package manager question lists npm, pnpm, Bun and Yarn, the quick start follows it, git comes before install, and going back shows the earlier answer again. Base settings are set by flag only. `--yes` needs a project name, an unsupported Node.js version stops with a clear message, and the banner tells when a newer version is out.
