const inventoryService = require('./inventory.service');
const batchImportService = require('./batchImport.service');
const { sendSuccess } = require('../../core/http/response');
const AppError = require('../../core/errors/appError');
const { ROLES, PERMISSIONS } = require('@younora/shared-constants');

function hasCostPermission(user) {
  if (!user) return false;
  if (user.role === ROLES.SUPER_ADMIN) return true;
  return (
    Array.isArray(user.permissions) &&
    user.permissions.includes(PERMISSIONS.INVENTORY_VIEW_COST)
  );
}

class InventoryController {
  async createBatch(req, res, next) {
    try {
      const canViewCost = hasCostPermission(req.user);
      const data = await inventoryService.createBatch(req.body, {
        actor: req.user,
        canViewCost,
      });
      return sendSuccess(res, {
        statusCode: 201,
        message: 'Batch created and stock received successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async receiveIntoBatch(req, res, next) {
    try {
      const canViewCost = hasCostPermission(req.user);
      const data = await inventoryService.receiveIntoBatch(req.params.id, req.body, {
        actor: req.user,
        canViewCost,
      });
      return sendSuccess(res, {
        message: 'Stock received into batch successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async listBatches(req, res, next) {
    try {
      const canViewCost = hasCostPermission(req.user);
      const result = await inventoryService.listBatches(req.query, { canViewCost });
      return sendSuccess(res, {
        message: 'Batches retrieved successfully',
        data: result.data,
        meta: result.meta,
      });
    } catch (err) {
      return next(err);
    }
  }

  async getBatch(req, res, next) {
    try {
      const canViewCost = hasCostPermission(req.user);
      const data = await inventoryService.getBatchById(req.params.id, { canViewCost });
      return sendSuccess(res, {
        message: 'Batch retrieved successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async updateBatchStatus(req, res, next) {
    try {
      const canViewCost = hasCostPermission(req.user);
      const data = await inventoryService.updateBatchStatus(req.params.id, req.body, {
        actor: req.user,
        canViewCost,
      });
      return sendSuccess(res, {
        message: 'Batch status updated successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async searchBatches(req, res, next) {
    try {
      const canViewCost = hasCostPermission(req.user);
      const data = await inventoryService.searchBatches(req.query.q, { canViewCost });
      return sendSuccess(res, {
        message: 'Batch search results retrieved successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async downloadReceiveTemplate(req, res, next) {
    try {
      const buffer = batchImportService.generateReceiveTemplate();
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="younora-stock-receive-template.xlsx"'
      );
      return res.status(200).send(buffer);
    } catch (err) {
      return next(err);
    }
  }

  async importStockReceipts(req, res, next) {
    try {
      if (!req.file || !req.file.buffer) {
        throw AppError.badRequest('Spreadsheet file is required');
      }

      const dryRun =
        req.query.dryRun === 'true' ||
        req.body?.dryRun === 'true' ||
        req.body?.dryRun === true;

      const canViewCost = hasCostPermission(req.user);
      const result = await batchImportService.importStockReceipts(req.file.buffer, {
        dryRun,
        actor: req.user,
        canViewCost,
      });

      const statusCode = !dryRun && result.committed ? 201 : 200;
      return sendSuccess(res, {
        statusCode,
        message: dryRun
          ? 'Stock receipt dry-run validation completed'
          : result.committed
            ? 'Stock receipts imported successfully'
            : 'Stock receipt import halted due to validation errors',
        data: result,
      });
    } catch (err) {
      return next(err);
    }
  }

  async adjustStock(req, res, next) {
    try {
      const data = await inventoryService.adjustStock(req.body, { actor: req.user });
      return sendSuccess(res, {
        message: 'Inventory adjusted successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async listMovements(req, res, next) {
    try {
      const result = await inventoryService.listMovements(req.query);
      return sendSuccess(res, {
        message: 'Stock movements retrieved successfully',
        data: result.data,
        meta: result.meta,
      });
    } catch (err) {
      return next(err);
    }
  }

  async listLowStock(req, res, next) {
    try {
      const canViewCost = hasCostPermission(req.user);
      const result = await inventoryService.listLowStock(req.query, { canViewCost });
      return sendSuccess(res, {
        message: 'Low stock variants retrieved successfully',
        data: result.data,
        meta: result.meta,
      });
    } catch (err) {
      return next(err);
    }
  }

  async getBatchWiseReport(req, res, next) {
    try {
      const canViewCost = hasCostPermission(req.user);
      const data = await inventoryService.getBatchWiseReport(req.query, { canViewCost });
      return sendSuccess(res, {
        message: 'Batch-wise report generated successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new InventoryController();

