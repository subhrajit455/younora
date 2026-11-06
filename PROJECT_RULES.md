Agent Operating Protocol (MANDATORY)

The Antigravity agent must follow this section exactly, every phase, without being re-prompted. If this file and a chat message conflict, stop and ask the owner. PROJECT_RULES.md must contain a copy of §2 and §3.

2.1 Trigger

The owner starts work by saying "Start Phase <ID>" (for example "Start Phase B2"). The agent then works only on that phase, using the phase's section in §17 or §18 as the full specification.

2.2 The six-step loop (never skip, never reorder)

STEP 1 — Read. Read docs/PLAN.md (this file), PROJECT_RULES.md, docs/phases/PROGRESS.md and the previous phase's sign-off. Confirm the previous phase is signed off. If not, say so and stop.

STEP 2 — Phase Briefing (NO CODE). Reply with a briefing in this exact structure:

Phase goal (2–3 sentences, plain language)
What will be built (modules, models, endpoints/screens)
File list (every file to create or change, by path)
New packages (name, version, reason; "none" if none)
Environment variables added
Test plan (the specific tests, mapped to the phase's test checklist)
Manual checks the owner should do (Postman or UI steps)
Risks / assumptions / open questions (anything unclear in the plan)
Explicitly out of scope for this phase
Slices (the internal build order, 3–6 slices)

STEP 3 — Ask permission. End the briefing with exactly: "Shall I start writing code for Phase <ID>? (yes / change plan)" and STOP. Write no code until the owner answers yes.

STEP 4 — Implement. After "yes", build the entire phase slice by slice without asking again, unless blocked by a genuine ambiguity or a missing credential. After each slice, run npm run lint and npm test, fix failures, then continue. Rules during implementation:

Follow §3 Engineering Rules strictly. Touch only files that belong to this phase.
Do not add libraries beyond the briefing without asking.
Never run git commands, never commit, never tag, never push. The owner does that.
If the plan needs a deviation, stop, explain, and wait for the owner's answer.
Reference code from the old Green Tree backend (folder reference/) is read-only. Read it for ideas; rewrite to our rules. Never copy .env values.

STEP 5 — Verify and sign off. When all slices are done:

Run the full lint and test suites and show the real output summary.
Create docs/phases/<ID>-signoff.md using the template in §26.3, filled in honestly (tests run, manual checks for the owner, known issues, deferred items).
Update docs/phases/PROGRESS.md, the module README files, and the Postman/OpenAPI files for new endpoints.
Update this plan's Decision Log (§25) if any decision changed.

STEP 6 — Hand over, then STOP. Final message must contain, in this order:

Summary (what was built, test counts, anything deferred)
Owner manual checklist (short list)
Commit message and tag command, together, in one copy-paste block (format in §22.3)
The line: "Phase <ID> is complete. Waiting for your 'Start Phase <next ID>'."

Then do nothing further. The agent never starts the next phase on its own.

2.3 Hard guardrails
One phase per session. Never begin work for a later phase "while here".
Never invent third-party API details (Bigship, Razorpay). Read their official docs at the start of the relevant phase, save sample payloads under docs/api/samples/, and mark anything unverified [VERIFY] in the briefing.
Never trust client input for price, margin, total, stock, discount, role or user id.
Never print secrets. Never log tokens, OTPs, passwords or payout details.
If tests fail and cannot be fixed within the phase, report plainly. Do not mark the phase done.

Engineering Rules
Modular monolith, modules under src/modules/<name>/, talking through service functions or the event bus, never through each other's models (read-only populate is allowed).
Layering: route → Zod validation → controller (thin) → service (all business logic) → model.
CommonJS (require/module.exports). Node 20, Express 5 (async errors forwarded natively).
Validation: Zod schemas live in each module's <name>.validation.js. Never trust client prices, margins, totals, stock, discounts, roles or user ids.
Money: integer paise everywhere. No floating-point money math. Convert only at UI edges.
Response format (always):
json
   { "success": true, "message": "…", "data": {}, "meta": { "page": 1, "limit": 20, "total": 100 } }
   { "success": false, "message": "…", "code": "STOCK_UNAVAILABLE", "errors": [ { "field": "…", "message": "…" } ] }
Errors: AppError(statusCode, code, message) + one global error middleware. 401 = not authenticated, 403 = not permitted, 404, 409, 422 as appropriate. No stack traces to clients.
Config: all config via config/env.js (Zod-validated, fail fast). No process.env elsewhere.
Logging: pino only. No console.log. Never log secrets, tokens, OTPs, passwords, payout details.
Transactions for order placement, stock changes, refunds, wallet changes. Idempotency for payments, webhooks, shipment creation, refunds, wallet credits.
Snapshots: order lines store product name, SKU, color, size, base price, margin, final price, GST, batch number, image at purchase time.
Soft delete for catalog and customers. Ledgers (stock, wallet, audit) are immutable: corrections are new rows.
Naming: files camelCase.js with module suffixes (order.service.js), collections plural, constants UPPER_SNAKE, enums in packages/shared-constants.
Tests: every phase ships automated tests for its critical logic. A phase without passing tests is not done.
Docs: each module has a short README.md (purpose, endpoints, events). New endpoints go into the Postman/OpenAPI files.
No dead code, no commented-out blocks, no console.log, no secrets in git.
Small, conventional commits (see §22). The owner commits; the agent only proposes the message.