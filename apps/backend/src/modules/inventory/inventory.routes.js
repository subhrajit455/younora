const express = require('express');
const inventoryController = require('./inventory.controller');
const validate = require('../../core/middleware/validate');
const authenticate = require('../../core/middleware/authenticate');
const { requireAnyPermission } = require('../../core/middleware/authorize');
const { handleSpreadsheetUpload } = require('../../core/middleware/upload');
const { TOKEN_AUDIENCE, PERMISSIONS } = require('@younora/shared-constants');
const {
  createBatchSchema,
  receiveIntoBatchSchema,
  updateBatchStatusSchema,
  adjustStockSchema,
  queryBatchSchema,
  queryMovementSchema,
  queryLowStockSchema,
  searchBatchQuerySchema,
} = require('./inventory.validation');

const inventoryRouter = express.Router();

inventoryRouter.use(authenticate(TOKEN_AUDIENCE.ADMIN));

// ---------------------------------------------------------------------------
// Batches Endpoints (/api/v1/admin/batches/*)
// ---------------------------------------------------------------------------

inventoryRouter.get(
  '/batches',
  requireAnyPermission(PERMISSIONS.INVENTORY_READ, PERMISSIONS.INVENTORY_MANAGE),
  validate({ query: queryBatchSchema }),
  (req, res, next) => inventoryController.listBatches(req, res, next)
);

inventoryRouter.post(
  '/batches',
  requireAnyPermission(PERMISSIONS.INVENTORY_WRITE, PERMISSIONS.INVENTORY_MANAGE),
  validate({ body: createBatchSchema }),
  (req, res, next) => inventoryController.createBatch(req, res, next)
);

// Search & Import routes must precede /batches/:id
inventoryRouter.get(
  '/batches/search',
  requireAnyPermission(
    PERMISSIONS.BATCHES_SEARCH,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_MANAGE
  ),
  validate({ query: searchBatchQuerySchema }),
  (req, res, next) => inventoryController.searchBatches(req, res, next)
);

inventoryRouter.get(
  '/batches/import/template',
  requireAnyPermission(
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_WRITE,
    PERMISSIONS.INVENTORY_MANAGE
  ),
  (req, res, next) => inventoryController.downloadReceiveTemplate(req, res, next)
);

inventoryRouter.post(
  '/batches/import',
  requireAnyPermission(PERMISSIONS.INVENTORY_WRITE, PERMISSIONS.INVENTORY_MANAGE),
  handleSpreadsheetUpload('file'),
  (req, res, next) => inventoryController.importStockReceipts(req, res, next)
);

inventoryRouter.get(
  '/batches/:id',
  requireAnyPermission(PERMISSIONS.INVENTORY_READ, PERMISSIONS.INVENTORY_MANAGE),
  (req, res, next) => inventoryController.getBatch(req, res, next)
);

inventoryRouter.post(
  '/batches/:id/receive',
  requireAnyPermission(PERMISSIONS.INVENTORY_WRITE, PERMISSIONS.INVENTORY_MANAGE),
  validate({ body: receiveIntoBatchSchema }),
  (req, res, next) => inventoryController.receiveIntoBatch(req, res, next)
);

inventoryRouter.patch(
  '/batches/:id/status',
  requireAnyPermission(PERMISSIONS.INVENTORY_WRITE, PERMISSIONS.INVENTORY_MANAGE),
  validate({ body: updateBatchStatusSchema }),
  (req, res, next) => inventoryController.updateBatchStatus(req, res, next)
);

// ---------------------------------------------------------------------------
// Inventory Ledger, Adjustments & Low-Stock (/api/v1/admin/inventory/*)
// ---------------------------------------------------------------------------

inventoryRouter.post(
  '/inventory/adjust',
  requireAnyPermission(PERMISSIONS.INVENTORY_WRITE, PERMISSIONS.INVENTORY_MANAGE),
  validate({ body: adjustStockSchema }),
  (req, res, next) => inventoryController.adjustStock(req, res, next)
);

inventoryRouter.get(
  '/inventory/movements',
  requireAnyPermission(PERMISSIONS.INVENTORY_READ, PERMISSIONS.INVENTORY_MANAGE),
  validate({ query: queryMovementSchema }),
  (req, res, next) => inventoryController.listMovements(req, res, next)
);

inventoryRouter.get(
  '/inventory/low-stock',
  requireAnyPermission(PERMISSIONS.INVENTORY_READ, PERMISSIONS.INVENTORY_MANAGE),
  validate({ query: queryLowStockSchema }),
  (req, res, next) => inventoryController.listLowStock(req, res, next)
);

// ---------------------------------------------------------------------------
// Batch-Wise Report (/api/v1/admin/reports/batch-wise)
// ---------------------------------------------------------------------------

inventoryRouter.get(
  '/reports/batch-wise',
  requireAnyPermission(
    PERMISSIONS.REPORTS_READ,
    PERMISSIONS.INVENTORY_READ,
    PERMISSIONS.INVENTORY_MANAGE
  ),
  (req, res, next) => inventoryController.getBatchWiseReport(req, res, next)
);

module.exports = inventoryRouter;

