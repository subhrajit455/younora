const express = require('express');
const orderController = require('./order.controller');
const authenticate = require('../../core/middleware/authenticate');
const { TOKEN_AUDIENCE } = require('@younora/shared-constants');

const orderRouter = express.Router();

// Customer authenticated routes
orderRouter.get(
  '/',
  authenticate(TOKEN_AUDIENCE.CUSTOMER),
  (req, res, next) => orderController.getCustomerOrders(req, res, next)
);

// Order details: allows customer or guest with token
orderRouter.get(
  '/:orderNo',
  authenticate.optional(TOKEN_AUDIENCE.CUSTOMER),
  (req, res, next) => orderController.getCustomerOrderDetails(req, res, next)
);

orderRouter.post(
  '/:orderNo/cancel',
  authenticate(TOKEN_AUDIENCE.CUSTOMER),
  (req, res, next) => orderController.cancelCustomerOrder(req, res, next)
);

// Download customer invoice
orderRouter.get(
  '/:orderNo/invoices/:type',
  authenticate.optional(TOKEN_AUDIENCE.CUSTOMER),
  (req, res, next) => orderController.downloadInvoice(req, res, next)
);

module.exports = orderRouter;

