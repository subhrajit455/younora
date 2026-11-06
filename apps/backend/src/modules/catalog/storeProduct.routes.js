const express = require('express');
const storeProductController = require('./storeProduct.controller');

const storeProductRouter = express.Router();

storeProductRouter.get('/', (req, res, next) => storeProductController.listStoreProducts(req, res, next));
storeProductRouter.get('/:slug/similar', (req, res, next) =>
  storeProductController.getSimilarProducts(req, res, next)
);
storeProductRouter.get('/:slug', (req, res, next) =>
  storeProductController.getStoreProductBySlug(req, res, next)
);

module.exports = storeProductRouter;

