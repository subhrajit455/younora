# Phase B1 Sign-Off Document: Auth, Users, Roles & Permissions

## Status
- **Phase:** B1 — Auth, Users, Roles & Permissions
- **Target Tag:** `v0.1.0`
- **Current Slice:** Slice 5 (Completed)

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
- [x] **Slice 2: Admin Auth, Middleware & Seed Script**
  - `src/config/env.js` (JWT and seed configuration)
  - `src/core/utils/crypto.js` (SHA-256 token hashing, UUID family generation)
  - `src/core/utils/cookies.js` (hardened cookie management: `ynr_admin_rt`, `ynr_cust_rt`)
  - `src/core/middleware/authenticate.js` (live DB-backed auth, audience separation, passwordChangedAt validation)
  - `src/core/middleware/authorize.js` (`authorizeRole`, `requirePermission` with SUPER_ADMIN bypass)
  - `src/modules/auth/auth.validation.js` (Zod login schema)
  - `src/modules/auth/auth.service.js` (admin login, logout, refresh rotation, ~10s grace window, reuse detection, max 10 active sessions)
  - `src/modules/auth/auth.controller.js`
  - `src/modules/auth/auth.routes.js` (`/api/v1/auth/admin/login`, `/logout`, `/refresh`)
  - `src/seed/admin.seed.js` (idempotent seed script, refuses placeholder password in production)
  - `tests/integration/adminAuth.test.js`
- [x] **Slice 3: Staff Management CRUD**
  - `src/modules/users/users.validation.js` (createStaffSchema, updateStaffSchema, staffQuerySchema)
  - `src/modules/users/users.service.js` (createStaff, listStaff, getStaffById, updateStaff, deactivateStaff, reactivateStaff)
  - `src/modules/users/users.controller.js`
  - `src/modules/users/users.routes.js` (`/api/v1/admin/staff` CRUD, deactivation/reactivation)
  - `tests/integration/staffManagement.test.js` (15 integration tests covering CRUD, Rule 8 self & last Super Admin protection, token revocation)
- [x] **Slice 4: Customer Auth & Password Reset Flow**
  - `src/core/mail/mailer.js` (Nodemailer abstraction, JSON transport in tests, SMTP in prod/staging, zero token logging)
  - `src/modules/auth/auth.validation.js` (register, login, forgot/reset password, email verification Zod schemas)
  - `src/modules/auth/auth.service.js` (customer registration, verification token generation, login with lockout and blocked status check, refresh rotation with ~10s grace window and family revocation, constant-time enumeration protection on forgot-password, reset password token validation & session revocation)
  - `src/modules/auth/auth.controller.js` & `src/modules/auth/auth.routes.js` (endpoints mounted under `/api/v1/auth/customer/*`)
  - `tests/integration/customerAuth.test.js` (15 integration tests covering registration, duplicate rejection, verification, login, lockout, blocked customer rejection, audience isolation, refresh rotation & reuse detection, forgot & reset password flow)
- [x] **Slice 5: Profile & Address CRUD**
  - `src/modules/users/users.validation.js` (updateAdminProfileSchema, updateCustomerProfileSchema, changePasswordSchema, createAddressSchema, updateAddressSchema)
  - `src/modules/users/users.service.js` (getAdminProfile, updateAdminProfile [name only], changeAdminPassword, getCustomerProfile, updateCustomerProfile, changeCustomerPassword, listAddresses, createAddress [auto-default, max 10], getAddressById, updateAddress, deleteAddress [hard delete + auto-promotion], setDefaultAddress)
  - `src/modules/users/users.controller.js` (profile and address request handlers)
  - `src/modules/users/users.routes.js` (mounted `/api/v1/admin/me`, `/api/v1/me`, `/api/v1/addresses/*`)
  - `tests/integration/profileAndAddress.test.js` (15 integration tests covering admin profile & password changes, customer profile & password changes, session revocations, address CRUD, Indian PIN/phone validation, max 10 address limit, auto default switching & promotion on delete, and multi-tenant customer isolation)
- [ ] **Slice 6: Audit Logging & Security Hardening**

---

## Slice Verification
- **Slice 1:** 26/26 tests passing (`models.test.js`, `health.test.js`, `error.test.js`, `env.test.js`).
- **Slice 2:** 42/42 tests passing (added `adminAuth.test.js` with 16 integration tests).
- **Slice 3:** 57/57 tests passing (added `staffManagement.test.js` with 15 integration tests).
- **Slice 4:** 72/72 tests passing (added `customerAuth.test.js` with 15 integration tests).
- **Slice 5:** 87/87 tests passing (added `profileAndAddress.test.js` with 15 integration tests).
- **Linter:** ESLint clean (0 errors, 0 warnings).
