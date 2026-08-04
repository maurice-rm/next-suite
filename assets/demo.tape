# create-next-suite — README demo
#
# Render with:   vhs assets/demo.tape          (run from the repo root)
# Install VHS:   https://github.com/charmbracelet/vhs
#
# Prerequisite: a current CLI build — `pnpm --filter create-next-suite build`.
# The hidden setup below drops a `create-next-suite` shim into the demo
# directory's node_modules/.bin, which is the first place `npx` looks — so the
# typed command is the one users actually run, but it executes your local build
# instead of downloading the published package.
#
# Every bare `Enter` accepts a prompt's default (all confirms default to Yes;
# "Quick start" defaults to No). Expect one calibration run: watch the GIF, and
# where a prompt lands on the wrong entry, add `Down`/`Left` before its Enter.

Output assets/demo.gif

Require node

Set Shell "bash"
Set FontSize 14
Set Width 1200
Set Height 820
Set Padding 24
Set Margin 28
Set MarginFill "#2563EB"
Set BorderRadius 10
Set WindowBar Colorful
Set TypingSpeed 55ms
Set Framerate 24
Set Theme { "background": "#0B0B0D", "foreground": "#E6E6E6", "cursor": "#2563EB" }

# ── hidden setup ────────────────────────────────────────────────────────────
Hide
# VHS starts a bare shell, so whichever Node its nvm defaults to may be older
# than the CLI requires. Prefer a locally installed Node 24 when there is one.
Type `N24="$(ls -d "$HOME"/.nvm/versions/node/v24* "$HOME"/.local/share/nvm/v24* 2>/dev/null | sort -V | tail -1)"; [ -n "$N24" ] && export PATH="$N24/bin:$PATH"`
Enter
Type `REPO="$PWD"; DEMO="$(mktemp -d)"; BIN="$DEMO/node_modules/.bin"; mkdir -p "$BIN"`
Enter
Type `printf '#!/bin/sh\nexec node '"$REPO"'/packages/cli/dist/index.js "$@"\n' > "$BIN/create-next-suite" && chmod +x "$BIN/create-next-suite"`
Enter
Type `cd "$DEMO"; clear`
Enter
Show
# ────────────────────────────────────────────────────────────────────────────

Sleep 700ms
Type "npx create-next-suite my-app"
Sleep 400ms
Enter

# Banner + intro, then the first prompt (project name, pre-filled from the arg).
Sleep 3s
Enter

# Package manager — the cursor starts on the DETECTED manager, which is npm
# when launched through npx. One Down moves to pnpm (list order: npm, pnpm,
# bun, yarn). Drop the Down to keep npm.
Sleep 1s
Down
Sleep 400ms
Enter

# "Quick start with recommended defaults?" — answer No to show the full wizard.
# The default is already No, so Enter accepts it.
Sleep 900ms
Enter

# ── UI ──────────────────────────────────────────────────────────────────────
# Component library: shadcn/ui is the first entry and the default.
Sleep 900ms
Enter
# shadcn base library (Base UI is first/default).
Sleep 800ms
Enter
# Pointer cursor on buttons.
Sleep 700ms
Enter
# shadcn preset code — leave empty.
Sleep 700ms
Enter

# ── Data & API ──────────────────────────────────────────────────────────────
# Database: PostgreSQL (first entry).
Sleep 900ms
Enter
# ORM: Drizzle (first entry).
Sleep 800ms
Enter
# Auth: Better-Auth (first entry).
Sleep 800ms
Enter
# API layer: tRPC is first — press Down once for oRPC.
Sleep 800ms
Down
Sleep 300ms
Enter
# OpenAPI layer for oRPC.
Sleep 700ms
Enter
# Scalar docs UI.
Sleep 700ms
Enter

# ── Integrations ────────────────────────────────────────────────────────────
# Email provider: Resend.
Sleep 900ms
Enter

# ── Deployment ──────────────────────────────────────────────────────────────
# Production Docker + nginx.
Sleep 900ms
Enter
# nginx mode — standalone is first and preselected. Add a `Down` before Enter
# to pick "proxied" instead (the mode `next-suite provision` supports).
Sleep 800ms
Enter

# ── CI/CD ───────────────────────────────────────────────────────────────────
# GitHub Actions.
Sleep 900ms
Enter
# Which steps (multiselect — accept the preselected set).
Sleep 900ms
Enter

# ── Setup ───────────────────────────────────────────────────────────────────
# Initialize git.
Sleep 900ms
Enter
# Install dependencies — answer No so the demo stays short.
Sleep 800ms
Left
Sleep 300ms
Enter

# Scaffolding + the outro (stack summary, next steps).
Sleep 10s

# Let the final frame breathe before the GIF loops.
Sleep 2500ms
