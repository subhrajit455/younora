const express = require('express');
const cartController = require('./cart.controller');
const authenticate = require('../../core/middleware/authenticate');
const { TOKEN_AUDIENCE } = require('@younora/shared-constants');

const cartRouter = express.Router();

// Allow authenticated customer or guest with token
cartRouter.use(authenticate.optional(TOKEN_AUDIENCE.CUSTOMER));

cartRouter.get('/', (req, res, next) => cartController.getCart(req, res, next));
cartRouter.post('/items', (req, res, next) => cartController.addItem(req, res, next));
cartRouter.patch('/items/:variantId', (req, res, next) => cartController.updateItemQty(req, res, next));
cartRouter.delete('/items/:variantId', (req, res, next) => cartController.removeItem(req, res, next));
cartRouter.post('/coupon', (req, res, next) => cartController.applyCoupon(req, res, next));
cartRouter.delete('/coupon', (req, res, next) => cartController.removeCoupon(req, res, next));

// Merging requires customer authentication
cartRouter.post(
  '/merge',
  authenticate(TOKEN_AUDIENCE.CUSTOMER),
  (req, res, next) => cartController.mergeCart(req, res, next)
);

module.exports = cartRouter;

