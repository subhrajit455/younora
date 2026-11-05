# Phase B0 Sign-Off Document: Project Foundation & Conventions

## Summary
- **Phase:** B0 — Project Foundation & Conventions
- **Tag:** `v0.1.0-b0`
- **Commit Hash:** `61d0d42`
- **Status:** Completed & Signed Off

---

## Deliverables & Architecture Implemented

### 1. Monorepo & Tooling Configuration
- Monorepo structure configured with npm workspaces: `apps/*` and `packages/*`.
- Standardized formatting and linting:
  - `.editorconfig` (2-space indentation, UTF-8, LF line endings).
  - `.prettierrc` (single quotes, 2-space tabs, trailing comma ES5).
  - `eslint.config.js` (ESLint flat config with CommonJS support, zero-console rule).
  - `commitlint.config.js` (Conventional Commits enforcement).
  - `.gitignore` (safeguards `.env`, test coverage, temporary artifacts, and reference archives like `New-Green-tree-Backend-main.zip`).

### 2. Core Backend Application Framework
- **Runtime & Framework:** Node.js 20+ with Express 5 and Mongoose 8.
- **Environment Management (`src/config/env.js`):**
  - Strict Zod validation on boot.
  - Fail-fast mechanism on missing or malformed variables.
  - Configuration frozen at startup; no raw `process.env` scattered in codebase.
  - Defaults configured for local MongoDB (`mongodb://127.0.0.1:27017/younora_dev`).
- **Database Connection (`src/config/db.js`):**
  - Mongoose 8 setup with connection listeners and structured logging.
  - Graceful disconnect handling on process termination.
- **Security Middleware Stack (`src/app.js`):**
  - `helmet`: Security HTTP headers.
  - `cors`: Restricted whitelist matching `CORS_ORIGIN`.
  - `express-rate-limit`: Rate limiting protection against brute-force traffic.
  - `express-mongo-sanitize`: Sanitization against NoSQL query injection (Express 5 compatible wrapper).
  - `hpp`: HTTP Parameter Pollution protection.
- **Structured Logging (`src/core/logger.js`):**
  - `pino` structured JSON logger with `pino-http`.
  - Sensitive data redaction (passwords, tokens, OTPs, authorization headers).
  - `pino-pretty` formatting in development; silent during unit/integration tests.

### 3. API Conventions & Error Handling
- **Response Format (`src/core/http/response.js`):**
  - Success: `{ success: true, message, data, meta? }`
- **Error Handling (`src/core/errors/`):**
  - Standard error format: `{ success: false, message, code, errors? }`
  - Centralized `errorCodes.js` constants (`VALIDATION_ERROR`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `INTERNAL_SERVER_ERROR`, `SERVICE_UNAVAILABLE`, `RATE_LIMIT_EXCEEDED`, `CONFLICT`).
  - Custom `AppError` operational class with factory helpers.
  - Single global `errorMiddleware` capturing Zod errors, Mongoose cast/validation/duplicate-key errors, and operational exceptions without leaking internal stack traces in production.
  - `notFoundHandler.js` delivering standardized 404 JSON envelopes.
- **Financial Arithmetic (`src/core/utils/money.js`):**
  - Strict integer paise arithmetic per project rules (no floating-point rounding issues).
  - `rupeesToPaise`, `paiseToRupees`, `formatRupees`.

### 4. Health & Observability Endpoints (`src/routes/health.routes.js`)
- `GET /health` (also mounted at `/api/v1/health`): Liveness probe returning server uptime and timestamp.
- `GET /health/ready`: Readiness probe verifying active database connection status (returns 200 when connected, 503 if disconnected).

---

## Verification & Test Results

### Automated Test Suite
- Test Runner: Jest with Supertest and `mongodb-memory-server` in-memory database helper (`tests/helpers/testDb.js`).
- **Tests Executed:** 15/15 passing tests across 3 suites:
  - `tests/unit/env.test.js`: Validates fail-fast behaviour on missing/malformed configuration.
  - `tests/unit/error.test.js`: Validates `AppError` factories, standard envelope contracts, and integer paise conversion.
  - `tests/integration/health.test.js`: Tests `/health`, `/health/ready` (disconnected and connected states), and standardized 404 routing.

### Code Quality
- `npm run lint`: 0 errors, 0 warnings.
- `npm run format`: All files adhere to Prettier rules.

---

## Phase B0 Gate Criteria Checklist
- [x] Monorepo structure and conventions established.
- [x] Server boots and gracefully shuts down.
- [x] Invalid `.env` fails fast on startup.
- [x] `/health` returns 200 OK with standard format.
- [x] Unknown routes return standard 404 JSON format.
- [x] Thrown errors return standard error JSON without leaks.
- [x] Automated test suite green (`npm run test:backend`).
- [x] Setup and bootable in under 5 minutes.

