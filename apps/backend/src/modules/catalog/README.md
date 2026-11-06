# Catalog Module (`src/modules/catalog`)

## Purpose
The Catalog module provides the hierarchical taxonomy, reusable product attributes, structured size charts, media management, product and variant matrix management, and bulk spreadsheet import/export for the Younora Luxury Fashion platform.

---

## Data Models

### 1. Taxonomy & Attributes
1. **Audience (`models/audience.model.js`):**
   - High-level demographic target (e.g. `Men`, `Women`, `Kids`).
   - Fields: `name`, `slug` (unique), `image` (`url`, `publicId`), `sortOrder`, `isActive`, `isDeleted`, `deletedAt`.
2. **Category (`models/category.model.js`):**
   - Belongs to an `Audience`.
   - Fields: `audience`, `name`, `slug`, `image`, `sortOrder`, `isActive`, `defaultSizeChart`, `isDeleted`, `deletedAt`.
   - Compound index: `{ audience: 1, slug: 1 }`.
3. **Subcategory (`models/subcategory.model.js`):**
   - Belongs to a `Category`.
   - Fields: `category`, `name`, `slug`, `image`, `sortOrder`, `isActive`, `isDeleted`, `deletedAt`.
   - Compound index: `{ category: 1, slug: 1 }`.
4. **Attribute (`models/attribute.model.js`):**
   - Reusable product attributes.
   - Types: `COLOR`, `FABRIC`, `FIT`, `PATTERN`, `OCCASION`, `SLEEVE`, `NECK`.
   - Fields: `type`, `name`, `value` (e.g. hex code `#000080`), `sortOrder`, `isActive`.
   - Compound index: `{ type: 1, name: 1 }` (unique).
5. **SizeChart (`models/sizeChart.model.js`):**
   - Dimensional guidelines for garments.
   - Fields: `name`, `category` (optional ref), `unit` (`INCH` or `CM`), `columns` (`[String]`), `rows` (`[{ size, values }]`).

### 2. Products & Variants
6. **Product (`models/product.model.js`):**
   - Core product document containing taxonomy references, color-wise media, marketing copy, and denormalized aggregates.
   - Fields: `name`, `slug` (unique), `description`, `highlights`, `audience`, `category`, `subcategory`, `brand`, `fabric`, `fit`, `pattern`, `occasion`, `careInstructions`, `countryOfOrigin`, `hsnCode`, `gstPercent` (0, 5, 12, 18, 28), `sizeChart`, `colors` (array with `name`, `hex`), `media` (color-wise array of images and optional video), `status` (`DRAFT`, `ACTIVE`, `HIDDEN`), `priceRange` (`minSelling`, `maxSelling`, `minMrp`, `maxMrp` in integer paise), `totalStock`, `isFeatured`, `isNewArrival`, `isBestSeller`, `resellingEnabled`, `tags`, `seo`, `isDeleted`, `deletedAt`.
7. **Variant (`models/variant.model.js`):**
   - Individual purchasable SKU representing a specific `{product, color, size}` combination.
   - Fields: `product`, `sku` (auto-generated unique `YNR-<CAT>-<PROD>-<COLOR>-<SIZE>`), `barcode`, `color` (`{ name, hex }`), `size`, `mrp` (integer paise), `sellingPrice` (integer paise, $\le$ `mrp`), `costPrice` (integer paise, confidential), `stock`, `reservedStock`, `lowStockThreshold`, `weightGrams`, `dimensionsCm` (`{ length, breadth, height }`), `isActive`, `isDeleted`.
   - Compound unique index: `{ product: 1, "color.name": 1, size: 1 }`.

---

## Core Rules & Conventions
- **Integer Paise Money:** All monetary values (`mrp`, `sellingPrice`, `costPrice`, `priceRange`) are strictly stored and computed as integer paise (1 INR = 100 paise).
- **Cost Price Confidentiality:** Variant `costPrice` is strictly redacted/omitted from API responses unless the authenticated staff member has the `inventory.view-cost` permission. Public storefront endpoints never expose `costPrice`.
- **Atomic Variant Matrix Transactions:** Products and variant matrices are created and updated in single atomic transactions via `withTransaction()`. Denormalized `priceRange` and `totalStock` are recomputed and committed simultaneously.
- **Auto-Generated SKUs:** Generated via `generateSku()` formatted as `YNR-<CAT>-<PROD>-<COLOR>-<SIZE>` (all uppercase alphanumeric).

---

## API Endpoints

### 1. Admin Product Endpoints (Require `authenticate` + permission)
| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/api/v1/admin/products` | `products.read` | Paginated product list with search, status, category, low-stock filter |
| `POST` | `/api/v1/admin/products` | `products.manage` | Atomic creation of product + variant matrix in one transaction |
| `GET` | `/api/v1/admin/products/:id` | `products.read` | Full product details with associated variants (costPrice redacted without `inventory.view-cost`) |
| `PATCH` | `/api/v1/admin/products/:id` | `products.manage` | Update product basic fields, colors, and media |
| `PATCH` | `/api/v1/admin/products/:id/variants` | `products.manage` | Upsert / synchronize variant matrix (recomputes priceRange and totalStock) |
| `PATCH` | `/api/v1/admin/products/:id/status` | `products.manage` | Transition product status (`DRAFT`, `ACTIVE`, `HIDDEN`) |
| `POST` | `/api/v1/admin/products/:id/duplicate` | `products.manage` | Deep duplicate product and variant matrix as `DRAFT` with unique slug and SKUs |
| `DELETE` | `/api/v1/admin/products/:id` | `products.manage` | Soft delete product and all associated variants |
| `GET` | `/api/v1/admin/products/export` | `products.read` | Export complete product catalog to Excel (`.xlsx`), cost column included only with `inventory.view-cost` |
| `GET` | `/api/v1/admin/products/import/template` | `products.read` | Download Excel import template prefilled with column guide and sample rows |
| `POST` | `/api/v1/admin/products/import` | `products.manage` | Bulk upload Excel/CSV catalog with `dryRun=true` validation and row-level error reporting |

### 2. Admin Taxonomy & Size Chart Endpoints (Require `authenticate` + `categories.manage`)
- **Audiences:** `GET/POST /api/v1/admin/audiences`, `PATCH /reorder`, `GET/PATCH/DELETE /:id`
- **Categories:** `GET/POST /api/v1/admin/categories`, `PATCH /reorder`, `GET/PATCH/DELETE /:id`
- **Subcategories:** `GET/POST /api/v1/admin/subcategories`, `PATCH /reorder`, `GET/PATCH/DELETE /:id`
- **Attributes:** `GET/POST /api/v1/admin/attributes`, `GET/PATCH/DELETE /:id`
- **Size Charts:** `GET/POST /api/v1/admin/size-charts`, `GET/PATCH/DELETE /:id`
- **Media Uploads:** `POST /api/v1/admin/uploads` (multipart/form-data), `DELETE /api/v1/admin/uploads/*publicId`

### 3. Public Storefront Endpoints
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/store/menu` | Hierarchical taxonomy tree (active audiences $\rightarrow$ categories $\rightarrow$ subcategories) |
| `GET` | `/api/v1/store/size-charts/:id` | Public size chart specification |
| `GET` | `/api/v1/store/products` | Public product catalog listing (only `ACTIVE` products, filter by category, audience, price, sort) |
| `GET` | `/api/v1/store/products/:slug` | Product detail page by slug with active variants grouped and cost price strictly redacted |
| `GET` | `/api/v1/store/products/:slug/similar` | Similar active products in same category/audience (up to 8 items) |
