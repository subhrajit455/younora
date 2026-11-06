# Phase B3 Sign-Off Document: Catalog Taxonomy, Attributes, Size Charts, Media

## Status
- **Phase:** B3 — Catalog Taxonomy, Attributes, Size Charts, Media
- **Target Tag:** `v0.3.0`
- **Current Status:** Completed & Ready for Release Tag
- **Completion Date:** 2026-11-06

---

## Architecture & Configuration Decisions
1. **Taxonomy Hierarchy & Soft Delete Protection:**
   - Strict 3-level taxonomy: `Audience` $\rightarrow$ `Category` $\rightarrow$ `Subcategory`.
   - Soft deletion with integrity safeguards: an Audience cannot be deleted if active categories exist; a Category cannot be deleted if active subcategories exist.
   - Slugs are auto-generated via `core/utils/slug.js` from entity names, lowercased, accent-stripped, with collision prevention.
2. **Reusable Attributes Matrix:**
   - Standardized `Attribute` model storing canonical clothing parameters (`COLOR`, `FABRIC`, `FIT`, `PATTERN`, `OCCASION`, `SLEEVE`, `NECK`).
   - Enforces unique `{ type, name }` compound index.
3. **Structured Size Charts:**
   - Multi-column, multi-row matrix storing dimensional garment measurements in either `INCH` or `CM`.
   - Categories can reference a `defaultSizeChart`. Soft-deleting a size chart atomically detaches it from referencing categories.
4. **Media Pipeline & Cloudinary Storage:**
   - Reusable media upload service (`upload.service.js`) with folder segregation (`younora/categories`, `younora/products`, `younora/audiences`).
   - Express 5 wildcard parameter matching (`/{*publicId}`) allowing asset deletion by full public ID across nested folders.
   - Multer middleware enforces 5MB size limits and image-only MIME verification (`JPEG`, `PNG`, `WEBP`, `AVIF`).
   - Test mode fallback provides deterministic offline responses without requiring external network connectivity during automated unit/integration runs.
5. **Public Navigation Tree:**
   - `GET /api/v1/store/menu` outputs nested JSON representation of all active, non-deleted audiences, categories, and subcategories ordered by `sortOrder`.

---

## Slice Progress Tracker

- [x] **Slice 1: Taxonomy Models, Shared Constants & Slug Utility**
  - Updated `@younora/shared-constants` (`ATTRIBUTE_TYPE`, `SIZE_CHART_UNIT`, `AUDIENCE_NAMES`)
  - `core/utils/slug.js` (accent normalization, kebab-case generation)
  - `modules/catalog/models/audience.model.js`
  - `modules/catalog/models/category.model.js`
  - `modules/catalog/models/subcategory.model.js`
  - `tests/unit/slug.test.js` (6 tests)

- [x] **Slice 2: Taxonomy CRUD & Public Storefront Menu API**
  - `modules/catalog/catalog.validation.js`
  - `modules/catalog/catalog.service.js` (audience, category, subcategory CRUD + menu tree)
  - `modules/catalog/catalog.controller.js`
  - `modules/catalog/catalog.routes.js`
  - Mounted routes in `src/app.js` (`/admin/audiences`, `/admin/categories`, `/admin/subcategories`, `/store/menu`)
  - `tests/integration/taxonomy.test.js` (13 tests)

- [x] **Slice 3: Attributes & Size Charts Modules**
  - `modules/catalog/models/attribute.model.js`
  - `modules/catalog/models/sizeChart.model.js`
  - Extended validation, service, controller, and routes for Attributes and Size Charts
  - Public route: `GET /store/size-charts/:id`
  - `tests/integration/attributesAndSizeCharts.test.js` (10 tests)

- [x] **Slice 4: Media Upload Service**
  - Installed `cloudinary` and `multer`
  - `src/config/cloudinary.js` & updated `src/config/env.js`
  - `core/middleware/upload.js` (Multer memoryStorage, 5MB limit, image MIME check)
  - `modules/catalog/upload.service.js`, `upload.controller.js`, `upload.routes.js`
  - Express 5 wildcard deletion support: `DELETE /api/v1/admin/uploads/*`
  - `tests/integration/mediaUpload.test.js` (7 tests)

- [x] **Slice 5: Taxonomy Seed Script, Documentation & Full Verification**
  - `src/seed/taxonomy.seed.js` (idempotent audience & attribute seeder)
  - `src/modules/catalog/README.md`
  - Full suite verification (169/169 tests passing)
  - ESLint clean (0 errors, 0 warnings)

---

## Verification & Test Metrics
- **Total Test Suites:** 17 passed / 17 total
- **Total Tests:** 169 passed / 169 total (0 failures)
  - `slug.test.js`: 6 passed
  - `taxonomy.test.js`: 13 passed
  - `attributesAndSizeCharts.test.js`: 10 passed
  - `mediaUpload.test.js`: 7 passed
  - `eventBus.test.js`: 4 passed
  - `notificationModel.test.js`: 5 passed
  - `notificationsRest.test.js`: 11 passed
  - `notificationsSocket.test.js`: 7 passed
  - `notificationsSubscriber.test.js`: 6 passed
  - `adminAuth.test.js`: 16 passed
  - `staffManagement.test.js`: 15 passed
  - `customerAuth.test.js`: 15 passed
  - `profileAndAddress.test.js`: 15 passed
  - `auditLogging.test.js`: 13 passed
  - `models.test.js`: 11 passed
  - `error.test.js`: 6 passed
  - `health.test.js`: 4 passed
  - `env.test.js`: 4 passed (updated for Cloudinary env)
- **Linter Status:** ESLint clean (0 errors, 0 warnings)

