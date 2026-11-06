# Catalog Module (`src/modules/catalog`)

## Purpose
The Catalog module provides the hierarchical taxonomy, reusable product attributes, structured size charts, and media management service for the Younora Luxury Fashion platform.

---

## Data Models
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

---

## API Endpoints

### Admin Endpoints (Require `authenticate` + `categories.manage` permission)
- **Audiences:**
  - `GET /api/v1/admin/audiences`
  - `POST /api/v1/admin/audiences`
  - `PATCH /api/v1/admin/audiences/reorder`
  - `GET /api/v1/admin/audiences/:id`
  - `PATCH /api/v1/admin/audiences/:id`
  - `DELETE /api/v1/admin/audiences/:id` (soft delete guarded against active categories)
- **Categories:**
  - `GET /api/v1/admin/categories`
  - `POST /api/v1/admin/categories`
  - `PATCH /api/v1/admin/categories/reorder`
  - `GET /api/v1/admin/categories/:id`
  - `PATCH /api/v1/admin/categories/:id`
  - `DELETE /api/v1/admin/categories/:id` (soft delete guarded against active subcategories)
- **Subcategories:**
  - `GET /api/v1/admin/subcategories`
  - `POST /api/v1/admin/subcategories`
  - `PATCH /api/v1/admin/subcategories/reorder`
  - `GET /api/v1/admin/subcategories/:id`
  - `PATCH /api/v1/admin/subcategories/:id`
  - `DELETE /api/v1/admin/subcategories/:id` (soft delete)
- **Attributes:**
  - `GET /api/v1/admin/attributes` (filter by `type`, `isActive`, `search`)
  - `POST /api/v1/admin/attributes`
  - `GET /api/v1/admin/attributes/:id`
  - `PATCH /api/v1/admin/attributes/:id`
  - `DELETE /api/v1/admin/attributes/:id`
- **Size Charts:**
  - `GET /api/v1/admin/size-charts`
  - `POST /api/v1/admin/size-charts`
  - `GET /api/v1/admin/size-charts/:id`
  - `PATCH /api/v1/admin/size-charts/:id`
  - `DELETE /api/v1/admin/size-charts/:id` (soft delete; unlinks from linked categories)
- **Media Uploads:**
  - `POST /api/v1/admin/uploads` (multipart/form-data with `file` and optional `folder`)
  - `DELETE /api/v1/admin/uploads/*publicId` (deletes asset from Cloudinary)

### Public Storefront Endpoints
- `GET /api/v1/store/menu`: Returns hierarchical tree of active, non-deleted audiences $\rightarrow$ categories $\rightarrow$ subcategories.
- `GET /api/v1/store/size-charts/:id`: Returns size chart details for product pages.

