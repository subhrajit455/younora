# Inventory & Batches Module (`src/modules/inventory`)

## Purpose
The Inventory & Batches module provides atomic batch numbering, stock receiving, FIFO batch allocation, concurrency-safe stock reservation, manual stock adjustments, immutable stock movement ledger tracking, global CRM batch search, public batch authenticity verification, and bulk Excel stock-receive imports.

---

## Data Models

1. **Counter (`models/counter.model.js`):**
   - Stores atomic sequence counters (`batch-YYMM`, `order-YYMM`, `invoice-YYMM`).
   - Static method: `Counter.getNextSequence(key, session)` using atomic `$inc`.

2. **Batch (`models/batch.model.js`):**
   - Represents one received lot of a product with per-variant quantities.
   - Fields:
     - `batchNo` (unique, uppercase, auto-generated as `YNR-<YYMM>-<AUD>-<SEQ4>` or custom)
     - `product` (`ObjectId` ref to `Product`)
     - `receivedOn` (`Date`)
     - `supplier` (`{ name, ref }`, confidential)
     - `costPerUnit` (integer paise, confidential)
     - `items`: `[{ variant, qtyReceived, qtyAvailable, qtyReserved, qtySold, qtyReturned, qtyDamaged, costPerUnit }]`
     - `status`: `ACTIVE | EXHAUSTED | QUARANTINED`
     - `notes`, `createdBy`
   - Compound indexes for FIFO lookup: `{ 'items.variant': 1, status: 1, receivedOn: 1, _id: 1 }`.

3. **StockMovement (`models/stockMovement.model.js`):**
   - **Immutable** audit ledger of every inventory change (`collection: 'stock_movements'`).
   - Fields:
     - `variant` (`ObjectId` ref to `Variant`)
     - `batch` (`ObjectId` ref to `Batch`, nullable)
     - `type`: `RECEIVE | RESERVE | RELEASE | SALE | RETURN_RESTOCK | DAMAGE | ADJUST | CANCEL`
     - `qty` (signed non-zero integer)
     - `balanceAfter` (non-negative integer)
     - `refType`: `ORDER | MANUAL_RETURN | MANUAL | BATCH`
     - `refId`, `reason`, `actor`, `note`, `createdAt`

---

## Core Services

- **`fifoService` (`fifo.service.js`):**
  - `allocate(variantId, qty)`: Computes FIFO split across active batches (`receivedOn` ascending, `_id` ascending) without mutating DB.
  - `reserveStock({ variantId, qty, refType, refId, actor, note })`: Concurrency-safe atomic decrement on `Variant` (`stock >= qty`) followed by atomic FIFO claims across active `Batch` documents, `Product.totalStock` sync, `StockMovement` creation, and single-crossing `stock.low` / `stock.out` event emission.
  - `releaseReservation({ variantId, allocations, ... })`: Restores reserved stock back to original batches and variant.
  - `commitReservationToSale({ variantId, allocations })`: Finalizes reserved units as sold (`qtySold += qty`, `qtyReserved -= qty`) and transitions depleted batches to `EXHAUSTED`.

- **`inventoryService` (`inventory.service.js`):**
  - Stock receiving, manual adjustments (reconciliation, damage write-off, quarantine), movement ledger queries, low-stock queries, CRM batch search, public batch lookup, and batch-wise reporting.
  - Strictly redacts `costPerUnit`, `costPrice`, and `supplier` when caller lacks `inventory.view-cost`.

- **`batchImportService` (`batchImport.service.js`):**
  - Generates Excel template and processes bulk stock-receive spreadsheets with `dryRun=true` row-level error reporting and `dryRun=false` transactional commit.

---

## API Endpoints

### 1. Admin Endpoints (`/api/v1/admin/*`)
| Method | Endpoint | Permission | Description |
|---|---|---|---|
| `GET` | `/api/v1/admin/batches` | `inventory.read` | Paginated batch list with product, variant, status, and batchNo filters |
| `POST` | `/api/v1/admin/batches` | `inventory.write` | Receive stock by creating a new batch (auto or custom `batchNo`) |
| `GET` | `/api/v1/admin/batches/search?q=` | `batches.search` / `inventory.read` | Global CRM batch search by partial batchNo, product name, or SKU |
| `GET` | `/api/v1/admin/batches/import/template` | `inventory.read` | Download Excel template for bulk stock receiving |
| `POST` | `/api/v1/admin/batches/import` | `inventory.write` | Bulk import stock receipts from Excel/CSV (`?dryRun=true` supported) |
| `GET` | `/api/v1/admin/batches/:id` | `inventory.read` | Get batch details (cost & supplier redacted without `inventory.view-cost`) |
| `POST` | `/api/v1/admin/batches/:id/receive` | `inventory.write` | Receive additional stock into an existing batch |
| `PATCH` | `/api/v1/admin/batches/:id/status` | `inventory.write` | Transition batch status (`ACTIVE`, `QUARANTINED`, `EXHAUSTED`) |
| `POST` | `/api/v1/admin/inventory/adjust` | `inventory.write` | Manual stock adjustment or damage write-off (mandatory reason & note) |
| `GET` | `/api/v1/admin/inventory/movements` | `inventory.read` | Paginated immutable stock movement ledger |
| `GET` | `/api/v1/admin/inventory/low-stock` | `inventory.read` | List active variants at or below `lowStockThreshold` |
| `GET` | `/api/v1/admin/reports/batch-wise` | `reports.read` / `inventory.read` | Batch-wise stock, sales, damages, and valuation report |

### 2. Public Storefront Endpoint (`/api/v1/store/*`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/v1/store/batch/:batchNo` | Public (Rate-limited) | Whitelisted batch authenticity verification (product name, images, color/size, link; never exposes cost, supplier, stock counts, or buyers) |

