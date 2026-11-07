# Phase B7 Sign-Off Document: Cart, Pricing Engine, Coupons & Settings

## Status
- **Phase:** B7 — Cart, Pricing Engine, Coupons & Settings
- **Target Tag:** `v0.7.0`
- **Current Status:** Completed & Ready for Release Tag
- **Completion Date:** 2026-11-07
- **Verification Gate:** $\ge$ 25 Golden Pricing Test Cases ($\mathbf{31/31\text{ passed}}$)
- **Monorepo Test Suite:** $\mathbf{33/33\text{ test suites passed}}$, $\mathbf{298/298\text{ tests passed}}$
- **Code Quality:** $\mathbf{0\text{ ESLint errors}}$, $\mathbf{0\text{ ESLint warnings}}$

---

## Architectural Highlights & Invariants

1. **Pure Pricing Engine (`modules/pricing/pricing.engine.js`):**
   - Single source of truth for all cart and checkout calculations across the platform.
   - **Rule 7 Invariant:** All inputs, intermediate calculations, and final amounts are strictly in **integer paise** ($1\text{ INR} = 100\text{ paise}$).
   - **Reseller Margin Injection:** Automatically validates reseller share tokens against category caps (`marginLimitsByCategory`), default caps (`defaultMaxMarginPercent`), and MRP ceilings. If `priceMayExceedMrp = false`, margins exceeding MRP are capped.
   - **Coupon Pro-Ration:** Evaluates coupon scope (`ALL`, `CATEGORY`, `PRODUCT`), enforces `minCartValue` and `maxDiscount`, and pro-rates discounts across matching items with exact remainder allocation to prevent odd-paise drift.
   - **Coupon Lock on Reselling:** Disallows coupons on orders with reseller margins by default unless store settings explicitly permit it (`settings.reselling.couponsAllowedOnResellerOrders === true`).
   - **GST Back-Calculation & Division:** Defaults to tax-inclusive pricing; derives taxable value and splits GST equally between `CGST` and `SGST` for intra-state delivery (`07` Delhi), or assigns to `IGST` for inter-state delivery.
   - **Shipping & COD Rules:** Evaluates free shipping threshold against net goods total (post-coupon), verifies COD availability against status, bounds, and blocked pincodes.

2. **Store & Business Settings (`modules/settings`):**
   - Singleton pattern (`Settings.getSettings()`) providing atomic configuration across 7 business domains: `store`, `payments`, `shipping`, `returns`, `tax`, `invoice`, and `reselling`.
   - Admin CRUD at `/api/v1/admin/settings` (secured by `settings.manage` and `payments.settings`).
   - Public checkout-safe configuration endpoint at `GET /api/v1/store/settings/config`.

3. **Coupons Engine (`modules/pricing`):**
   - Model `Coupon` supporting `PERCENT` and `FLAT` discount types.
   - Per-user and global usage limits with `CouponUsage` ledger model tracking redemptions.
   - Date windowing (`startsAt`, `expiresAt`), first-time buyer restriction (`firstOrderOnly`), and payment method constraints.
   - Full Admin CRUD at `/api/v1/admin/coupons` secured by `coupons.manage`.

4. **Cart Module (`modules/cart`):**
   - Variant-aware line items with live stock checks (`variant.stock - variant.reservedStock`).
   - Quantity bounds (1 to 10 units per item).
   - Seamless guest carts (`x-guest-token`) and authenticated customer carts.
   - Atomic cart merge (`POST /api/v1/cart/merge`) on customer login, combining line items up to stock limits and carrying over share tokens and coupons.
   - Endpoints mounted at `/api/v1/cart` (`GET /`, `POST /items`, `PATCH /items/:variantId`, `DELETE /items/:variantId`, `POST /coupon`, `DELETE /coupon`, `POST /merge`).

---

## Slice Progress & Deliverables

- [x] **Slice 1: Settings Module & Constants**
  - Updated `@younora/shared-constants` (`COUPON_TYPE`, `COUPON_SCOPE`, `SETTINGS_SECTIONS`).
  - Implemented `apps/backend/src/modules/settings/models/settings.model.js`.
  - Implemented `settings.service.js`, `settings.controller.js`, `settings.routes.js`.
  - Mounted `/api/v1/admin/settings` and `/api/v1/store/settings/config`.

- [x] **Slice 2: Pure Pricing Engine & Golden Test Cases**
  - Implemented `apps/backend/src/modules/pricing/pricing.engine.js`.
  - Implemented `apps/backend/src/modules/pricing/models/resellerShare.model.js`.
  - Implemented `apps/backend/src/modules/pricing/models/coupon.model.js`.
  - Created golden test suite `apps/backend/tests/unit/pricingEngine.test.js` with **31 golden test cases** covering multi-quantity, tax inclusive/exclusive, odd-paise division, category/product scoping, MRP clamping, margin limits, COD surcharge and pincode restrictions. All 31 passing.

- [x] **Slice 3: Coupons Engine (Admin CRUD & Validation)**
  - Implemented `apps/backend/src/modules/pricing/models/couponUsage.model.js`.
  - Implemented `apps/backend/src/modules/pricing/coupon.service.js`, `coupon.controller.js`, `coupon.routes.js`.
  - Mounted `/api/v1/admin/coupons`.
  - Integration tests in `apps/backend/tests/integration/coupons.test.js` (**18/18 passed**).

- [x] **Slice 4: Cart Module**
  - Implemented `apps/backend/src/modules/cart/models/cart.model.js`.
  - Implemented `apps/backend/src/modules/cart/cart.service.js`, `cart.controller.js`, `cart.routes.js`.
  - Added `authenticate.optional` middleware to `core/middleware/authenticate.js`.
  - Mounted `/api/v1/cart` in `app.js`.
  - Integration tests in `apps/backend/tests/integration/cart.test.js` (**14/14 passed**).

- [x] **Slice 5: Documentation, Monorepo Test Run & Sign-Off**
  - Authored comprehensive engine documentation in `apps/backend/src/modules/pricing/README.md`.
  - ESLint verification: 0 errors, 0 warnings.
  - Full monorepo backend test suite execution: **33/33 test suites passing**, **298/298 tests passing**.
  - Generated Phase B7 sign-off document (`docs/phases/B7-signoff.md`).

---

## Verification Summary

| Test Suite | Tests | Result |
| :--- | :---: | :---: |
| `tests/unit/pricingEngine.test.js` | 31 | **PASS** |
| `tests/integration/coupons.test.js` | 18 | **PASS** |
| `tests/integration/cart.test.js` | 14 | **PASS** |
| Pre-existing Backend Suites (B0–B6) | 235 | **PASS** |
| **Total Monorepo Suite** | **298** | **ALL PASS (100%)** |
| ESLint Verification | Clean | **0 errors, 0 warnings** |

---

## Proposed Git Commit & Release Tag (User Action Required)
Per repository safety constraints, git commands must be executed manually by the user:

```bash
git add .
git commit -m "feat(b7): complete Cart, Pure Pricing Engine, Coupons & Settings module v0.7.0"
git tag -a v0.7.0 -m "Release v0.7.0 - Phase B7 Cart, Pricing Engine, Coupons & Settings"
```

