# Phase B1 Sign-Off Document: Auth, Users, Roles & Permissions

## Status
- **Phase:** B1 — Auth, Users, Roles & Permissions
- **Target Tag:** `v0.1.0`
- **Current Slice:** Slice 1 (Completed & Updated)

---

## Architecture & Configuration Decisions
1. **Validation Location:** Kept in `<module>.validation.js` inside each backend module. `packages/shared-validation` removed; `packages/shared-constants` retained.
2. **Customer Model & Reseller Representation:**
   - No risk scoring fields (deferred to risk scoring phase).
   - `isBlocked`, `blockReason`, `codRestricted` retained.
   - `resellerStatus` is the **single source of truth** enum: `NONE`, `PENDING`, `APPROVED`, `REJECTED`, `SUSPENDED` (default `NONE`).
   - `isReseller` is a **virtual property** (`status === 'APPROVED'`), serialized via `{ toJSON: { virtuals: true }, toObject: { virtuals: true } }`.
   - `resellerCode` and `payoutDetails` are data-only placeholders.
   - Account lockout fields (`failedLoginAttempts`, `lockUntil`) and timestamps (`lastLoginAt`, `passwordChangedAt`) included.
   - `passwordHash` has `select: false`.
3. **Admin User Model:**
   - Account lockout fields (`failedLoginAttempts`, `lockUntil`) and timestamps (`lastLoginAt`, `passwordChangedAt`) included.
   - `passwordHash` has `select: false`.
4. **Cookie Separation:**
   - Admin refresh token: `ynr_admin_rt` (path: `/api/v1/auth/admin`)
   - Customer refresh token: `ynr_cust_rt` (path: `/api/v1/auth/customer`)
   - Attributes: `httpOnly`, `Secure` (production/staging), `SameSite: 'Lax'`
5. **Database-Backed Authentication:** `authenticate` loads user from DB; role and permissions come from DB on each request. `SUPER_ADMIN` role bypasses granular permission checks.
6. **Dedicated Refresh Token Store (`refresh_tokens`):**
   - MongoDB TTL index (`expireAfterSeconds: 0`).
   - Stores only SHA-256 token hash (`tokenHash`).
   - Positioned fields: `userId`, `userType` (`ADMIN|CUSTOMER`), `userModel` (`AdminUser|Customer`).
   - Token rotation tracking with `family`, `replacedByTokenHash`, and `replacedAt` for the ~10s parallel refresh grace window.
   - Max 10 active sessions per user.
7. **Canonical Permissions List:** Full agreed list stored in `packages/shared-constants/src/permissions.js`.
8. **Mailer:** `core/mail/mailer.js` abstraction using Nodemailer with JSON transport in tests and SMTP in staging/production. Tokens are never logged.
9. **Password Changes & Revocation:** Current password verification required; changing password revokes all other active sessions.
10. **Super Admin Protection:** A Super Admin cannot deactivate themselves or the last active Super Admin.
11. **Enumeration Protection:** `forgot-password` returns standard generic 200 message regardless of whether the email exists. Emails normalized to lowercase.
12. **Address Rules:** Hard delete for addresses; automatically promotes another address to default if the deleted address was default; maximum 10 addresses per customer.
13. **Seed Script Safety:** Idempotent seed script; rejects placeholder password in production environment.
14. **Audit Logging:** Immutable audit records (no update or delete APIs); sensitive fields automatically redacted.

---

## Slice Progress Tracker

- [x] **Slice 1: Models & Shared Constants**
  - `packages/shared-constants/src/permissions.js` (full agreed list)
  - `packages/shared-constants/src/index.js`
  - `apps/backend/src/modules/users/models/adminUser.model.js`
  - `apps/backend/src/modules/users/models/customer.model.js` (virtual `isReseller`)
  - `apps/backend/src/modules/users/models/address.model.js`
  - `apps/backend/src/modules/users/models/refreshToken.model.js` (`replacedAt`, `userType`)
  - `apps/backend/tests/unit/models.test.js`
- [ ] **Slice 2: Admin Auth, Middleware & Seed Script**
- [ ] **Slice 3: Staff Management CRUD**
- [ ] **Slice 4: Customer Auth & Password Reset Flow**
- [ ] **Slice 5: Profile & Address CRUD**
- [ ] **Slice 6: Audit Logging & Security Hardening**

---

## Slice 1 Verification
- **Automated Tests:** 26/26 passing tests (`models.test.js`, `health.test.js`, `error.test.js`, `env.test.js`).
- **Linter:** ESLint clean (0 errors, 0 warnings).
