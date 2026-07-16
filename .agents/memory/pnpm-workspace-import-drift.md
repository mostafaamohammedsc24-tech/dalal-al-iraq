---
name: pnpm-workspace import drift after GitHub re-import
description: A previously-Replit-structured pnpm workspace (packages under artifacts/*) that gets exported to GitHub and re-imported can lose the artifacts/ nesting, leaving config pointing at paths that no longer exist.
---

Symptom: `pnpm-workspace.yaml` lists `artifacts/*`, and package tsconfigs use `../../tsconfig.base.json` / `../../lib/...` (two levels up), but the actual project packages sit at the repo root (e.g. `dalal-app/`, `api-server/`) — one level up, not two. Root `package.json` typecheck/build filters (`--filter "./artifacts/**"`) also silently no-op.

**Why:** Replit's artifact convention nests app packages under `artifacts/<name>/`. Exporting to GitHub and re-importing (or a manual re-upload) can flatten that nesting while leaving the workspace/tsconfig files untouched, since they're just text and nothing errors until you run typecheck or install.

**How to apply:** When setting up an imported project that has this `artifacts/*` convention in `pnpm-workspace.yaml` or `replit.md` but the directories aren't actually under `artifacts/`, check: (1) `pnpm-workspace.yaml` packages list, (2) root `package.json` `--filter` paths, (3) each moved package's `tsconfig.json` `extends`/`references` relative paths. Fix all three to match the real depth, then verify with `pnpm run typecheck` before trusting the workspace is wired correctly — `pnpm install` alone won't catch it.
