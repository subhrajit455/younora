# Phase B6 Sign-Off Document: Storefront Read APIs

## Status
- **Phase:** B6 — Storefront Read APIs
- **Target Tag:** `v0.6.0`
- **Current Status:** Completed & Ready for Release Tag
- **Completion Date:** 2026-11-07

---

## Architecture & Configuration Decisions

1. **Storefront Listing & Dynamic Facet Aggregation:**
   - Multi-attribute query filtering (`audience`, `category`, `subcategory`, `size`, `color`, `fabric`, `occasion`, `fit`, `pattern`, `minPrice`, `maxPrice`, `inStockOnly`, `isFeatured`, `isNewArrival`, `isBestSeller`, `sort`, `search`).
   - Dynamic facet aggregator (`GET /api/v1/store/filters`) calculates available sizes, colors, fabrics, occasions, fits, patterns, and price bounds based on current taxonomy selection.
   - Prices strictly handled as integer paise (Rule 7: 1 INR = 100 paise).
   - Inactive, draft, and soft-deleted products are strictly excluded from all public endpoints.
2. **HTTP Caching & Performance (ETags):**
   - Implemented `etagMiddleware` (`core/middleware/etag.js`) attaching weak ETags (`W/"<hash>"`) and `Cache-Control: public, max-age=60, stale-while-revalidate=120` to all safe public GET requests.
   - Responds with `304 Not Modified` when the client's `If-None-Match` header matches, reducing redundant bandwidth and ensuring sub-300ms typical response times.
3. **Structured Product Detail with Color-Variant Grouping & Size Chart:**
   - `GET /api/v1/store/products/:slug` resolves complete hierarchy with navigation breadcrumbs (`Home -> Audience -> Category -> Subcategory -> Product`), attached structured size chart dimensions, and variants grouped by color with per-size stock availability.
   - Cost price (`costPrice`) and supplier information are strictly excluded and never leaked to the storefront.
4. **Search & Autocomplete:**
   - `GET /api/v1/store/search`: Full-text keyword search across name, description, fabric, and tags.
   - `GET /api/v1/store/search/suggest`: Fast prefix autocomplete returning product titles and matching categories.
5. **Customer Wishlist Module (`wishlists` collection):**
   - Secured with `authenticate(TOKEN_AUDIENCE.CUSTOMER)`.
   - Compound unique index `{ customer: 1, product: 1 }` ensures duplicate adds are idempotent.
   - Auto-populates active product metadata while silently filtering out deleted or unlisted products.
6. **Curated Home, Banners, CMS & Pincode Serviceability:**
   - `GET /api/v1/store/home`: Aggregated storefront payload providing active hero banners, featured collections, new arrivals, best sellers, and categories in a single call.
   - `GET /api/v1/store/banners`: Time-windowed active promotional banners filtered by position.
   - `GET /api/v1/store/pages/:slug`: Public CMS static pages (`about-us`, `return-policy`, etc.).
   - `GET /api/v1/store/pincode/:pin`: Validates Indian 6-digit postal code format and returns estimated transit days and COD availability.
   - `POST /api/v1/store/enquiry`: Customer contact form submission.

---

## Slice Progress Tracker

- [x] **Slice 1: Enhanced Product Listing Engine with Multi-Facet Filtering, Facet Aggregations & ETag Caching**
  - `core/middleware/etag.js` (ETag generator and `304 Not Modified` handler)
  - `modules/catalog/storeProduct.validation.js`
  - `modules/catalog/storeProduct.service.js` (`listProducts`, `getFilters`)
  - Endpoints: `GET /api/v1/store/products`, `GET /api/v1/store/filters`

- [x] **Slice 2: Product Detail, Rich Variants Grouping, Similar Products, Search & Autocomplete Suggestions**
  - Enhanced `GET /api/v1/store/products/:slug` (color-variant grouping, size availability, breadcrumbs, size chart)
  - `GET /api/v1/store/products/:slug/similar`
  - `GET /api/v1/store/search` & `GET /api/v1/store/search/suggest`
  - `tests/integration/storefrontListing.test.js` (6 tests)

- [x] **Slice 3: Customer Wishlist Module**
  - `modules/wishlist/models/wishlist.model.js` (unique compound index `{ customer, product }`)
  - `modules/wishlist/wishlist.service.js`, `wishlist.controller.js`, `wishlist.routes.js`
  - Mounted `/api/v1/wishlist` in `app.js`
  - `tests/integration/wishlist.test.js` (6 tests)

- [x] **Slice 4: CMS Banners, Home Aggregator, Pincode & Enquiry**
  - `modules/cms/models/banner.model.js`
  - `modules/cms/models/cmsPage.model.js`
  - `modules/cms/models/enquiry.model.js`
  - `modules/cms/cms.service.js`, `cms.controller.js`, `storeCms.routes.js`
  - Endpoints: `GET /store/home`, `GET /store/banners`, `GET /store/pages/:slug`, `GET /store/pincode/:pin`, `POST /store/enquiry`
  - `tests/integration/storefrontCmsAndHome.test.js` (5 tests)

- [x] **Slice 5: OpenAPI 3.0 Contract Specification, Full Monorepo Verification & Sign-Off**
  - Created frozen OpenAPI 3.0 specification in `docs/openapi/storefront.yaml` and `docs/api/storefront.yaml`
  - Full suite verification across the monorepo: 30 test suites passed / 235 tests passed
  - ESLint clean (0 errors, 0 warnings)

---

## Verification & Test Metrics
- **Total Test Suites:** 30 passed / 30 total
- **Total Tests:** 235 passed / 235 total (0 failures)
  - `storefrontListing.test.js`: 6 passed
  - `wishlist.test.js`: 6 passed
  - `storefrontCmsAndHome.test.js`: 5 passed
  - `storeProducts.test.js`: 7 passed
  - Preceding B0–B5 test suites (Auth, Notifications, Inventory, Catalog, Admin): 211 passed
- **Linter Status:** ESLint clean (0 errors, 0 warnings)

---

## Phase B6 Gate Verification
- **Gate Requirement:** Listing and detail contracts frozen in OpenAPI (frontend depends on them).
- **Verification Result:** Fully frozen in `docs/openapi/storefront.yaml` and `docs/api/storefront.yaml`.
  - Comprehensive parameter specifications for query filtering, sorting, and pagination.
  - Complete schema definitions for product cards, detail payload, color options, variants availability, size chart, facets aggregation, customer wishlist, and CMS pages.
  - All monetary fields standardized in integer paise.

