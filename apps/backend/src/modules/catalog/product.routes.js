const express = require('express');
const productController = require('./product.controller');
const validate = require('../../core/middleware/validate');
const authenticate = require('../../core/middleware/authenticate');
const { requirePermission } = require('../../core/middleware/authorize');
const { TOKEN_AUDIENCE, PERMISSIONS } = require('@younora/shared-constants');
const { handleSpreadsheetUpload } = require('../../core/middleware/upload');
const {
  createProductSchema,
  updateProductSchema,
  updateStatusSchema,
  queryProductSchema,
} = require('./product.validation');

const productRouter = express.Router();

productRouter.use(authenticate(TOKEN_AUDIENCE.ADMIN));

productRouter.get(
  '/',
  requirePermission(PERMISSIONS.PRODUCTS_READ),
  validate({ query: queryProductSchema }),
  (req, res, next) => productController.listProducts(req, res, next)
);

// Bulk Import & Export (must come before /:id)
productRouter.get(
  '/export',
  requirePermission(PERMISSIONS.PRODUCTS_READ),
  (req, res, next) => productController.exportCatalog(req, res, next)
);

productRouter.get(
  '/import/template',
  requirePermission(PERMISSIONS.PRODUCTS_WRITE),
  (req, res, next) => productController.downloadTemplate(req, res, next)
);

productRouter.post(
  '/import',
  requirePermission(PERMISSIONS.PRODUCTS_WRITE),
  handleSpreadsheetUpload('file'),
  (req, res, next) => productController.bulkImport(req, res, next)
);

productRouter.get('/:id', requirePermission(PERMISSIONS.PRODUCTS_READ), (req, res, next) =>
  productController.getProduct(req, res, next)
);

productRouter.post(
  '/',
  requirePermission(PERMISSIONS.PRODUCTS_WRITE),
  validate({ body: createProductSchema }),
  (req, res, next) => productController.createProduct(req, res, next)
);

productRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.PRODUCTS_WRITE),
  validate({ body: updateProductSchema }),
  (req, res, next) => productController.updateProduct(req, res, next)
);

productRouter.patch(
  '/:id/status',
  requirePermission(PERMISSIONS.PRODUCTS_WRITE),
  validate({ body: updateStatusSchema }),
  (req, res, next) => productController.updateStatus(req, res, next)
);

productRouter.post('/:id/duplicate', requirePermission(PERMISSIONS.PRODUCTS_WRITE), (req, res, next) =>
  productController.duplicateProduct(req, res, next)
);

productRouter.delete('/:id', requirePermission(PERMISSIONS.PRODUCTS_WRITE), (req, res, next) =>
  productController.deleteProduct(req, res, next)
);

module.exports = productRouter;
