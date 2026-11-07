const express = require('express');
const storeProductController = require('./storeProduct.controller');
const validate = require('../../core/middleware/validate');
const etagMiddleware = require('../../core/middleware/etag');
const {
  storeProductQuerySchema,
  storeFiltersQuerySchema,
  storeSearchQuerySchema,
} = require('./storeProduct.validation');

const storeProductRouter = express.Router();

// Apply ETag caching on all storefront read routes
storeProductRouter.use(etagMiddleware());

// ---------------------------------------------------------------------------
// Storefront Search & Autocomplete (/api/v1/store/search/*)
// ---------------------------------------------------------------------------
storeProductRouter.get(
  '/search/suggest',
  validate({ query: storeSearchQuerySchema }),
  (req, res, next) => storeProductController.suggestSearch(req, res, next)
);

storeProductRouter.get(
  '/search',
  validate({ query: storeSearchQuerySchema }),
  (req, res, next) => storeProductController.searchProducts(req, res, next)
);

// ---------------------------------------------------------------------------
// Dynamic Filters Aggregation (/api/v1/store/filters)
// ---------------------------------------------------------------------------
storeProductRouter.get(
  '/filters',
  validate({ query: storeFiltersQuerySchema }),
  (req, res, next) => storeProductController.getFilters(req, res, next)
);

// ---------------------------------------------------------------------------
// Storefront Product Catalog (/api/v1/store/products/*)
// ---------------------------------------------------------------------------
storeProductRouter.get(
  '/products',
  validate({ query: storeProductQuerySchema }),
  (req, res, next) => storeProductController.listStoreProducts(req, res, next)
);

storeProductRouter.get(
  '/products/:slug/similar',
  (req, res, next) => storeProductController.getSimilarProducts(req, res, next)
);

storeProductRouter.get(
  '/products/:slug',
  (req, res, next) => storeProductController.getStoreProductBySlug(req, res, next)
);

module.exports = storeProductRouter;
