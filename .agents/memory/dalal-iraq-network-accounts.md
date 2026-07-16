---
name: Dalal Al-Iraq network accounts (offices/lawyers)
description: How the office and lawyer network account model works in this project — sequential IDs, roles, and where the spec docs came from.
---

The project has three account kinds beyond the public buyer/seller `users` table: `admin`, `office`, `lawyer`. Offices and lawyers are never self-registered — only an admin creates them (`POST /api/offices`, `POST /api/lawyers`), which auto-generates a sequential login ID (`OF-001`, `LW-001`, ...) via `nextSequentialId()` in `lib/db/src/index.ts`, plus a random password returned once in the response as `credentials`. They log in with that ID (not a phone number) via `/api/office/auth/login` / `/api/lawyer/auth/login`, and must change their password on first login (`mustChangePassword` flag).

**Why:** This mirrors a real-world workflow where the admin onboards offices/lawyers offline (WhatsApp/email) and hands them credentials, rather than open self-signup — matches the original product spec (pasted into chat as a large feature doc covering office dashboards, lawyer network, property inspection reports, contracts, commissions/wallet).

**How to apply:** When extending office/lawyer features, reuse `requireRole("office"|"lawyer")` from `api-server/src/lib/auth.ts` rather than `requireAdmin`. The full spec's business logic (mediation/referrals/deals/commissions, inspection report PDF generation, contract editor, financial wallet UI, network notifications) has DB tables already scaffolded (`lib/db/src/schema/`: network-properties, deals, inspections, contracts, finance, network-notifications) but no routes/UI yet — built incrementally, one part at a time, per user's explicit choice to do "foundation first, UI later."
