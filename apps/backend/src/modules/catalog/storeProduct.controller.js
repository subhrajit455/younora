const storeProductService = require('./storeProduct.service');
const { sendSuccess } = require('../../core/http/response');

class StoreProductController {
  async listStoreProducts(req, res, next) {
    try {
      const result = await storeProductService.listProducts(req.query);
      return sendSuccess(res, {
        message: 'Products retrieved successfully',
        data: result.data,
        meta: result.meta,
      });
    } catch (err) {
      return next(err);
    }
  }

  async getFilters(req, res, next) {
    try {
      const data = await storeProductService.getFilters(req.query);
      return sendSuccess(res, {
        message: 'Storefront filters retrieved successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async getStoreProductBySlug(req, res, next) {
    try {
      const data = await storeProductService.getProductBySlug(req.params.slug);
      return sendSuccess(res, {
        message: 'Product retrieved successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async getSimilarProducts(req, res, next) {
    try {
      const data = await storeProductService.getSimilarProducts(req.params.slug);
      return sendSuccess(res, {
        message: 'Similar products retrieved successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async searchProducts(req, res, next) {
    try {
      const data = await storeProductService.searchProducts(req.query.q, req.query.limit);
      return sendSuccess(res, {
        message: 'Search results retrieved successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async suggestSearch(req, res, next) {
    try {
      const data = await storeProductService.suggestSearch(req.query.q, req.query.limit);
      return sendSuccess(res, {
        message: 'Search suggestions retrieved successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new StoreProductController();
