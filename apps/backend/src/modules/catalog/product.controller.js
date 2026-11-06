const productService = require('./product.service');
const productImportExportService = require('./productImportExport.service');
const { sendSuccess } = require('../../core/http/response');
const { ROLES, PERMISSIONS } = require('@younora/shared-constants');
const AppError = require('../../core/errors/appError');

function hasCostPermission(user) {
  if (!user) return false;
  if (user.role === ROLES.SUPER_ADMIN) return true;
  return Array.isArray(user.permissions) && user.permissions.includes(PERMISSIONS.INVENTORY_VIEW_COST);
}

class ProductController {
  async listProducts(req, res, next) {
    try {
      const canViewCost = hasCostPermission(req.user);
      const result = await productService.listProducts(req.query, { canViewCost });
      return sendSuccess(res, {
        message: 'Products retrieved successfully',
        data: result.data,
        meta: result.meta,
      });
    } catch (err) {
      return next(err);
    }
  }

  async getProduct(req, res, next) {
    try {
      const canViewCost = hasCostPermission(req.user);
      const data = await productService.getProductById(req.params.id, { canViewCost });
      return sendSuccess(res, {
        message: 'Product retrieved successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async createProduct(req, res, next) {
    try {
      const data = await productService.createProduct(req.body);
      return sendSuccess(res, {
        statusCode: 201,
        message: 'Product and variants created successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async updateProduct(req, res, next) {
    try {
      const data = await productService.updateProduct(req.params.id, req.body);
      return sendSuccess(res, {
        message: 'Product and variants updated successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async updateStatus(req, res, next) {
    try {
      const data = await productService.updateProductStatus(req.params.id, req.body.status);
      return sendSuccess(res, {
        message: 'Product status updated successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async duplicateProduct(req, res, next) {
    try {
      const data = await productService.duplicateProduct(req.params.id);
      return sendSuccess(res, {
        statusCode: 201,
        message: 'Product duplicated successfully as draft',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async deleteProduct(req, res, next) {
    try {
      const data = await productService.deleteProduct(req.params.id);
      return sendSuccess(res, {
        message: 'Product deleted successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async downloadTemplate(req, res, next) {
    try {
      const buffer = productImportExportService.generateImportTemplate();
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="younora_product_import_template.xlsx"'
      );
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      return res.send(buffer);
    } catch (err) {
      return next(err);
    }
  }

  async bulkImport(req, res, next) {
    try {
      if (!req.file) {
        throw AppError.badRequest('Excel or CSV file is required for bulk import');
      }

      const dryRun = req.query.dryRun === 'true';
      const result = await productImportExportService.processBulkImport(req.file.buffer, {
        dryRun,
      });

      if (result.errors && result.errors.length > 0 && !dryRun) {
        return res.status(400).json({
          success: false,
          message: 'Import failed with validation errors',
          data: result,
        });
      }

      return sendSuccess(res, {
        message: dryRun ? 'Dry run completed' : 'Bulk import completed successfully',
        data: result,
      });
    } catch (err) {
      return next(err);
    }
  }

  async exportCatalog(req, res, next) {
    try {
      const canViewCost = hasCostPermission(req.user);
      const buffer = await productImportExportService.exportCatalog({ canViewCost });

      res.setHeader(
        'Content-Disposition',
        'attachment; filename="younora_catalog_export.xlsx"'
      );
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      return res.send(buffer);
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new ProductController();
