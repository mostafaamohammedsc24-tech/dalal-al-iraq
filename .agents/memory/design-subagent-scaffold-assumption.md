---
name: Design subagent scaffold assumption
description: When the design subagent skill's expected react-vite + generated api-client-react hooks scaffold doesn't match the project, hand-build the frontend instead of delegating.
---

The `design` skill's DESIGN subagent workflow assumes a specific scaffold: a react-vite artifact under `artifacts/<slug>` with a generated `api-client-react` hooks package sitting in front of the backend.

**Why:** Projects imported from GitHub (or otherwise hand-rolled) may instead have a plain Vite SPA with a hand-written `fetch` wrapper (e.g. `src/lib/api.ts` exposing `api.get/post/put/patch/delete`) and no generated hooks package. Delegating UI build-out to the design subagent in that setup produces mismatched code because the subagent's assumptions about data-fetching don't hold.

**How to apply:** Before delegating a large frontend build to the design subagent, check whether the project has the generated hooks scaffold the skill expects. If it's a plain Vite app with a manual API wrapper instead, hand-build the frontend directly (reading existing pages/components for conventions) rather than forcing the subagent's expected pattern.
