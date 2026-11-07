# Phase B5 Sign-Off Document: Inventory & Batches

## Status
- **Phase:** B5 — Inventory & Batches
- **Target Tag:** `v0.5.0`
- **Current Status:** Completed & Ready for Release Tag
- **Completion Date:** 2026-11-07

---

## Architecture & Configuration Decisions
1. **Atomic Sequence Counter (`counters` collection):**
   - `Counter.getNextSequence(key, session)` executes an atomic `$inc` with `upsert: true` to guarantee collision-free sequential numbering under concurrent load.
   - Batch numbers follow `YNR-<YYMM>-<AUD>-<SEQ4>` (e.g., `YNR-2611-WMN-0001`), while also permitting unique custom batch numbers when specified by an admin.
2. **Concurrency-Safe FIFO Allocation & Stock Reservation:**
   - `fifoService.reserveStock` performs a single-document atomic conditional decrement on `Variant` (`{ _id: variantId, isActive: true, stock: { $gte: requestedQty } }` with `$inc: { stock: -requestedQty, reservedStock: requestedQty }`) before claiming units across `ACTIVE` batches sorted by `{ receivedOn: 1, _id: 1 }`.
   - Each batch claim uses an atomic `$elemMatch` + `$inc` (`items.$.qtyAvailable: -take, items.$.qtyReserved: take`).
   - Compensating rollback restores variant and batch balances if any downstream step fails.
3. **Single-Crossing Threshold Alerting (`stock.low` & `stock.out`):**
   - Because each `$inc` on `Variant.stock` is serialized at the document level, `previousStock = newStock + requestedQty` uniquely identifies the single operation that crossed `lowStockThreshold` (`previousStock > threshold && newStock <= threshold`) or `0` (`previousStock > 0 && newStock === 0`), guaranteeing `stock.low` and `stock.out` are emitted **strictly once per crossing**.
4. **Immutable Stock Movement Ledger (`stock_movements` collection):**
   - Every inventory change (`RECEIVE`, `RESERVE`, `RELEASE`, `SALE`, `RETURN_RESTOCK`, `DAMAGE`, `ADJUST`, `CANCEL`) writes an immutable ledger row with `qty` (+/-) and `balanceAfter`.
   - Mongoose pre-hooks prevent updating or mutating existing movement documents.
   - For any variant, the sum of all `StockMovement.qty` rows reconciles with `Variant.stock`.
5. **Cost & Supplier Confidentiality (`inventory.view-cost`) & Public Whitelist Isolation:**
   - Admin endpoints redact `costPerUnit`, `costPrice`, `supplier`, and cost valuation metrics unless the requester holds `inventory.view-cost` (or `SUPER_ADMIN`).
   - Public storefront batch lookup (`GET /api/v1/store/batch/:batchNo`) is rate-limited and uses a strict whitelist serializer returning only authenticity confirmation, product metadata/images, and color/size combinations in the batch—never exposing costs, suppliers, stock counts, or buyer data.

---

## Slice Progress Tracker

- [x] **Slice 1: Inventory Models, Shared Constants & Atomic Batch Number Generator**
  - Updated `@younora/shared-constants` (`BATCH_STATUS`, `STOCK_MOVEMENT_TYPE`, `STOCK_MOVEMENT_REF_TYPE`, `ADJUSTMENT_REASON`)
  - `modules/inventory/models/counter.model.js`
  - `modules/inventory/models/batch.model.js`
  - `modules/inventory/models/stockMovement.model.js`
  - `modules/inventory/utils/batchNumber.js`
  - `tests/unit/inventoryModels.test.js` (7 tests, including 30-way parallel batch number uniqueness)

- [x] **Slice 2: Stock Receiving, Batch Management & Movement Ledger**
  - `modules/inventory/inventory.validation.js`
  - `modules/inventory/inventory.service.js` (`createBatch`, `receiveIntoBatch`, `listBatches`, `getBatchById`, `updateBatchStatus`, `listMovements`, `listLowStock`)
  - `modules/inventory/inventory.controller.js` & `inventory.routes.js`

- [x] **Slice 3: FIFO Allocation & Atomic Concurrency Engine (Phase Gate)**
  - `modules/inventory/fifo.service.js` (`allocate`, `reserveStock`, `releaseReservation`, `commitReservationToSale`, `emitThresholdEventsIfCrossed`)
  - Updated `modules/notifications/templates/templates.js` with `STOCK_OUT` template
  - `tests/integration/inventoryFifoAndGate.test.js` (4 tests, including the 50-parallel-reserve-on-stock-10 Gate)

- [x] **Slice 4: Adjustments, Damage Write-Off, CRM Batch Search, Public Batch Lookup & Reports**
  - Manual stock adjustments (`POST /api/v1/admin/inventory/adjust`) with mandatory reason & note
  - CRM global batch search (`GET /api/v1/admin/batches/search?q=`)
  - Public storefront batch lookup (`GET /api/v1/store/batch/:batchNo`) in `storeBatch.controller.js` & `storeBatch.routes.js`
  - Batch-wise report (`GET /api/v1/admin/reports/batch-wise`)

- [x] **Slice 5: Excel Bulk Stock-Receive Import, Documentation & Full Verification**
  - `modules/inventory/batchImport.service.js` (template generator, `dryRun=true` row validator, `dryRun=false` batch importer)
  - `tests/integration/inventoryAdjustSearchImport.test.js` (3 comprehensive end-to-end integration tests)
  - `modules/inventory/README.md`
  - Full monorepo test verification: 27 test suites passed / 218 tests passed
  - ESLint clean (0 errors, 0 warnings)

---

## Verification & Test Metrics
- **Total Test Suites:** 27 passed / 27 total
- **Total Tests:** 218 passed / 218 total (0 failures)
  - `inventoryModels.test.js`: 7 passed
  - `inventoryFifoAndGate.test.js`: 4 passed
  - `inventoryAdjustSearchImport.test.js`: 3 passed
  - Preceding B0–B4 test suites: 204 passed
- **Linter Status:** ESLint clean (0 errors, 0 warnings)

---

## Phase B5 Gate Verification
- **Gate Requirement:** 50 parallel reserve attempts on stock 10 $\rightarrow$ exactly 10 succeed.
- **Verification Result:** Verified in `tests/integration/inventoryFifoAndGate.test.js`:
  - 50 concurrent `fifoService.reserveStock({ variantId, qty: 1 })` promises executed via `Promise.allSettled` against a variant with total stock 10 split across two batches (6 + 4).
  - **Result:** Exactly 10 promises fulfilled and 40 rejected with `409 Conflict`.
  - Final `Variant.stock === 0`, `Variant.reservedStock === 10`, Batch 1 `qtyAvailable === 0, qtyReserved === 6`, Batch 2 `qtyAvailable === 0, qtyReserved === 4`.
  - Sum of `StockMovement.qty` rows equals `0` (`Variant.stock`).
  - `stock.low` (at remaining 5) and `stock.out` (at remaining 0) each fired **strictly once**.

