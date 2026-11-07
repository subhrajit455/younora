const express = require('express');
const checkoutController = require('./checkout.controller');
const validate = require('../../core/middleware/validate');
const authenticate = require('../../core/middleware/authenticate');
const { checkoutPreviewSchema, checkoutPlaceSchema } = require('../orders/order.validation');
const { TOKEN_AUDIENCE } = require('@younora/shared-constants');

const checkoutRouter = express.Router();

// Allow authenticated customer or guest
checkoutRouter.use(authenticate.optional(TOKEN_AUDIENCE.CUSTOMER));

checkoutRouter.post(
  '/preview',
  validate({ body: checkoutPreviewSchema }),
  (req, res, next) => checkoutController.previewCheckout(req, res, next)
);

checkoutRouter.post(
  '/place',
  validate({ body: checkoutPlaceSchema }),
  (req, res, next) => checkoutController.placeOrder(req, res, next)
);

module.exports = checkoutRouter;

