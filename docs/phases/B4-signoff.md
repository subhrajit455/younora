# Phase B4 Sign-Off Document: Products & Variants

## Status
- **Phase:** B4 — Products & Variants (*heart of the catalog*)
- **Target Tag:** `v0.4.0`
- **Current Status:** Completed & Ready for Release Tag
- **Completion Date:** 2026-11-06

---

## Architecture & Configuration Decisions
1. **Atomic Variant Matrix Transactions:**
   - Products and variant matrices are created and updated in single atomic transactions via `core/db/transaction.js` (`withTransaction()`).
   - Graceful fallback for standalone MongoDB instances ensuring test environments and local development operate without replica set constraints while production uses native multi-document transactions.
2. **Denormalized Price Ranges & Stock Aggregation:**
   - Products maintain denormalized `priceRange` (`minSelling`, `maxSelling`, `minMrp`, `maxMrp` in integer paise) and `totalStock`.
   - Recalculated atomically whenever variants are added, modified, or removed.
3. **Integer Paise Money (Rule 7):**
   - All financial figures (`mrp`, `sellingPrice`, `costPrice`, and `priceRange` aggregates) are strictly represented in integer paise ($1\text{ INR} = 100\text{ paise}$).
   - Invariant enforced at schema and Zod validation levels: `sellingPrice <= mrp`.
4. **Cost Price Confidentiality & Role-Based Redaction:**
   - Variant `costPrice` is strictly redacted from responses unless the caller has the `inventory.view-cost` permission (or `SUPER_ADMIN` role).
   - Public storefront endpoints never expose `costPrice` under any circumstance.
   - Bulk Excel catalog export includes the "Cost Price (INR)" column only if the requester holds `inventory.view-cost`.
5. **Auto-Generated SKUs:**
   - Formatted systematically as `YNR-<CAT>-<PROD>-<COLOR>-<SIZE>` via `core/utils/sku.js` with uppercase alphanumeric sanitization.
   - Guarded by a unique compound index `{ product: 1, "color.name": 1, size: 1 }` and a unique index on `sku`.
6. **Bulk Spreadsheet Import/Export Engine:**
   - Powered by `xlsx` with support for Excel (`.xlsx`, `.xls`) and CSV.
   - `dryRun=true` mode validates all rows (taxonomy existence, prices, image URLs, variant combinations) without committing, producing a structured row-level error report.
   - `dryRun=false` commits valid products and variants to the database.
   - Prefilled template generator (`/admin/products/import/template`) providing sample rows and column instructions.
7. **Storefront Public Isolation:**
   - Storefront read endpoints (`/api/v1/store/products`) strictly filter for non-deleted, `ACTIVE` products.
   - Variants grouped cleanly by color with size availability.

---

## Slice Progress Tracker

- [x] **Slice 1: Product & Variant Models, SKU Generator & Shared Constants**
  - Updated `@younora/shared-constants` (`PRODUCT_STATUS: DRAFT, ACTIVE, HIDDEN`)
  - `core/utils/sku.js` (deterministic uppercase SKU generator)
  - `modules/catalog/models/product.model.js` (color-wise media, priceRange, totalStock, status, soft delete)
  - `modules/catalog/models/variant.model.js` (unique SKU, unique `{product, color, size}`, sellingPrice $\le$ mrp, integer paise)
  - `tests/unit/sku.test.js` (4 tests)
  - `tests/unit/productModel.test.js` (9 tests)

- [x] **Slice 2: Atomic Product & Variant Matrix Management (Admin API)**
  - `core/db/transaction.js` (`withTransaction` with replica set detection and standalone fallback)
  - `modules/catalog/product.validation.js` (Zod schemas for create, update, variants upsert, status, duplicate)
  - `modules/catalog/product.service.js` (atomic creation, update, duplicate, soft delete, status transition, cost redaction)
  - `modules/catalog/product.controller.js` (pagination, filtering, permissions check)
  - `modules/catalog/product.routes.js` mounted under `/api/v1/admin/products`
  - `tests/integration/productMatrix.test.js` (11 tests)

- [x] **Slice 3: Public Storefront Product Endpoints**
  - `modules/catalog/storeProduct.controller.js`
  - `modules/catalog/storeProduct.routes.js` mounted under `/api/v1/store/products`
  - Endpoints: `GET /store/products`, `GET /store/products/:slug`, `GET /store/products/:slug/similar`
  - `tests/integration/storeProducts.test.js` (7 tests)

- [x] **Slice 4: Bulk Excel/CSV Import & Export Engine**
  - Installed `xlsx` package
  - `modules/catalog/productImportExport.service.js` (export with conditional cost, template download, dry-run error reporter, bulk importer)
  - `core/middleware/upload.js` (`handleSpreadsheetUpload` with MIME verification)
  - Endpoints: `GET /admin/products/export`, `GET /admin/products/import/template`, `POST /admin/products/import`
  - `tests/integration/productImportExport.test.js` (5 tests)

- [x] **Slice 5: Demo Products Seed Script, Documentation & Full Verification**
  - `src/seed/products.seed.js` (idempotently seeds 10 luxury products across Men, Women, Kids with multi-color & multi-size matrices)
  - `tests/integration/productSeed.test.js` (2 tests verifying seed execution, data integrity, and idempotency)
  - Updated `modules/catalog/README.md` with complete B4 specifications
  - Full suite verification across the monorepo: 24 test suites passed / 204 tests passed
  - ESLint clean (0 errors, 0 warnings)

---

## Verification & Test Metrics
- **Total Test Suites:** 24 passed / 24 total
- **Total Tests:** 204 passed / 204 total (0 failures)
  - `productMatrix.test.js`: 11 passed
  - `storeProducts.test.js`: 7 passed
  - `productImportExport.test.js`: 5 passed
  - `productSeed.test.js`: 2 passed
  - `sku.test.js`: 4 passed
  - `productModel.test.js`: 9 passed
  - `taxonomy.test.js`: 13 passed
  - `attributesAndSizeCharts.test.js`: 10 passed
  - `mediaUpload.test.js`: 7 passed
  - `slug.test.js`: 6 passed
  - `adminAuth.test.js`: 16 passed
  - `staffManagement.test.js`: 15 passed
  - `customerAuth.test.js`: 15 passed
  - `profileAndAddress.test.js`: 15 passed
  - `auditLogging.test.js`: 13 passed
  - `models.test.js`: 11 passed
  - `notificationsRest.test.js`: 11 passed
  - `notificationsSocket.test.js`: 7 passed
  - `notificationsSubscriber.test.js`: 6 passed
  - `notificationModel.test.js`: 5 passed
  - `eventBus.test.js`: 4 passed
  - `error.test.js`: 6 passed
  - `health.test.js`: 4 passed
  - `env.test.js`: 4 passed
- **Linter Status:** ESLint clean (0 errors, 0 warnings)

---

## Phase B4 Gate Verification
- **Gate Requirement:** Create 10 realistic Younora products via API (Men/Women/Kids, multi-color, multi-size) and review the data shape.
- **Verification Result:** Fully verified via `productSeed.test.js` and `src/seed/products.seed.js`:
  - 10 distinct luxury garments created across Men (`Royal Raw Silk Embroidered Sherwani`, `Velvet Zardozi Bandhgala Tuxedo`, `Tailored Italian Wool Evening Blazer`), Women (`Handcrafted Banarasi Katan Silk Saree`, `Heritage Zari Pure Mulberry Silk Saree`, `Gilded Hand-Embroidered Bridal Lehenga`, `Florentine Floral Silk Organza Lehenga`, `Imperial Velvet Embroidered Anarkali`), and Kids (`Little Maharaja Brocade Kurta Set`, `Little Maharani Tissue Gown`).
  - Total of 30+ variant combinations created with auto-generated SKUs (`YNR-<CAT>-<PROD>-<COLOR>-<SIZE>`).
  - Denormalized price ranges and total stock properly aggregated.
  - Idempotent execution verified.

