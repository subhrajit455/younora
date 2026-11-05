# Younora — Project Rules (always follow)
- Stack: Node 20, Express 5, CommonJS, Mongoose 8, MongoDB Atlas. Backend first.
- Modular monolith: src/modules/<name>/ with
  <name>.model/validation/routes/controller/service.js
- Flow: route → Zod validation → controller (thin) → service (all logic) → model.
- Modules call each other via services or the event bus only.
- Money = integer paise. Never use floats. Never trust client prices, totals, stock, margin, or user IDs.
- Response format:
  success: { success:true, message, data, meta? }
  error:   { success:false, message, code, errors? }
- Errors: AppError(statusCode, code, message) + one global error middleware.
  401 = not logged in, 403 = no permission.
- Config only through config/env.js (Zod validated). No process.env elsewhere.
- Logging with pino only. No console.log. Never log secrets, tokens, OTPs.
- Soft delete for catalog and customers. Order lines store snapshots.
- Webhooks and payments must be idempotent. Use transactions for order and stock.
- Every phase ships with tests. No dead or commented-out code.
- Conventional Commits. Small commits.
- Do NOT: add libraries without asking, touch modules outside the current phase,
  change schemas outside the current phase, or build more than one phase.
- Source of truth: docs/PLAN.md (v2.0). Explain any deviation BEFORE making it.