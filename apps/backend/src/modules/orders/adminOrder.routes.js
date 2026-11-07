const express = require('express');
const orderController = require('./order.controller');
const authenticate = require('../../core/middleware/authenticate');
const { requirePermission } = require('../../core/middleware/authorize');
const { TOKEN_AUDIENCE, PERMISSIONS } = require('@younora/shared-constants');

const adminOrderRouter = express.Router();

adminOrderRouter.use(authenticate(TOKEN_AUDIENCE.ADMIN));

adminOrderRouter.get(
  '/',
  requirePermission(PERMISSIONS.ORDERS_READ),
  (req, res, next) => orderController.getAdminOrders(req, res, next)
);

adminOrderRouter.get(
  '/:orderNo',
  requirePermission(PERMISSIONS.ORDERS_READ),
  (req, res, next) => orderController.getAdminOrderDetails(req, res, next)
);

adminOrderRouter.patch(
  '/:orderNo/status',
  requirePermission(PERMISSIONS.ORDERS_WRITE),
  (req, res, next) => orderController.updateOrderStatus(req, res, next)
);

adminOrderRouter.post(
  '/:orderNo/packing-proof',
  requirePermission(PERMISSIONS.ORDERS_WRITE),
  (req, res, next) => orderController.attachPackingProof(req, res, next)
);

adminOrderRouter.post(
  '/manual',
  requirePermission(PERMISSIONS.ORDERS_WRITE),
  (req, res, next) => orderController.createManualOrder(req, res, next)
);

adminOrderRouter.get(
  '/:orderNo/invoices/:type',
  requirePermission(PERMISSIONS.ORDERS_READ),
  (req, res, next) => orderController.getAdminInvoicePdf(req, res, next)
);

module.exports = adminOrderRouter;

