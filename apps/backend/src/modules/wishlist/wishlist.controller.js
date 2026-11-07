const wishlistService = require('./wishlist.service');
const { sendSuccess } = require('../../core/http/response');

class WishlistController {
  async getWishlist(req, res, next) {
    try {
      const result = await wishlistService.getWishlist(req.user.id || req.user._id, req.query);
      return sendSuccess(res, {
        message: 'Wishlist retrieved successfully',
        data: result.data,
        meta: result.meta,
      });
    } catch (err) {
      return next(err);
    }
  }

  async addToWishlist(req, res, next) {
    try {
      const data = await wishlistService.addToWishlist(
        req.user.id || req.user._id,
        req.params.productId
      );
      return sendSuccess(res, {
        statusCode: 201,
        message: 'Product added to wishlist',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async removeFromWishlist(req, res, next) {
    try {
      const data = await wishlistService.removeFromWishlist(
        req.user.id || req.user._id,
        req.params.productId
      );
      return sendSuccess(res, {
        message: 'Product removed from wishlist',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async checkInWishlist(req, res, next) {
    try {
      const data = await wishlistService.checkInWishlist(
        req.user.id || req.user._id,
        req.params.productId
      );
      return sendSuccess(res, {
        message: 'Wishlist status checked',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new WishlistController();

