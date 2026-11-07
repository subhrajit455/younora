const cartService = require('./cart.service');
const { sendSuccess } = require('../../core/http/response');

class CartController {
  _getAuthContext(req) {
    const customerId = req.user?._id || null;
    const guestToken =
      req.headers['x-guest-token'] ||
      req.query.guestToken ||
      req.body?.guestToken ||
      null;

    return { customerId, guestToken };
  }

  async getCart(req, res, next) {
    try {
      const { customerId, guestToken } = this._getAuthContext(req);
      const deliveryPincode = req.query.pincode || null;
      const paymentMethod = req.query.paymentMethod || null;

      const data = await cartService.getCartDetails({
        customerId,
        guestToken,
        deliveryPincode,
        paymentMethod,
      });

      return sendSuccess(res, {
        message: 'Cart retrieved successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async addItem(req, res, next) {
    try {
      const { customerId, guestToken } = this._getAuthContext(req);
      const { variantId, qty, shareToken } = req.body;

      const data = await cartService.addItem({
        customerId,
        guestToken,
        variantId,
        qty,
        shareToken,
      });

      return sendSuccess(res, {
        statusCode: 201,
        message: 'Item added to cart',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async updateItemQty(req, res, next) {
    try {
      const { customerId, guestToken } = this._getAuthContext(req);
      const { variantId } = req.params;
      const { qty } = req.body;

      const data = await cartService.updateItemQty({
        customerId,
        guestToken,
        variantId,
        qty,
      });

      return sendSuccess(res, {
        message: 'Cart item updated',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async removeItem(req, res, next) {
    try {
      const { customerId, guestToken } = this._getAuthContext(req);
      const { variantId } = req.params;

      const data = await cartService.removeItem({
        customerId,
        guestToken,
        variantId,
      });

      return sendSuccess(res, {
        message: 'Item removed from cart',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async applyCoupon(req, res, next) {
    try {
      const { customerId, guestToken } = this._getAuthContext(req);
      const { code } = req.body;

      const data = await cartService.applyCoupon({
        customerId,
        guestToken,
        code,
      });

      return sendSuccess(res, {
        message: 'Coupon applied successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async removeCoupon(req, res, next) {
    try {
      const { customerId, guestToken } = this._getAuthContext(req);

      const data = await cartService.removeCoupon({
        customerId,
        guestToken,
      });

      return sendSuccess(res, {
        message: 'Coupon removed from cart',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async mergeCart(req, res, next) {
    try {
      const customerId = req.user?._id;
      const guestToken =
        req.body?.guestToken ||
        req.headers['x-guest-token'] ||
        req.query.guestToken;

      const data = await cartService.mergeCart({
        customerId,
        guestToken,
      });

      return sendSuccess(res, {
        message: 'Guest cart merged into account successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new CartController();

