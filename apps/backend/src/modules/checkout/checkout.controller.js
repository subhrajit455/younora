const checkoutService = require('./checkout.service');
const { sendSuccess } = require('../../core/http/response');

class CheckoutController {
  _getAuthContext(req) {
    const customer = req.user || null;
    const guestToken =
      req.headers['x-guest-token'] ||
      req.query.guestToken ||
      req.body?.guestToken ||
      null;

    return { customer, guestToken };
  }

  async previewCheckout(req, res, next) {
    try {
      const { customer, guestToken } = this._getAuthContext(req);
      const data = await checkoutService.previewCheckout({
        customer,
        guestToken,
        body: req.body,
      });

      return sendSuccess(res, {
        message: 'Checkout preview calculated successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async placeOrder(req, res, next) {
    try {
      const { customer, guestToken } = this._getAuthContext(req);
      const data = await checkoutService.placeOrder({
        customer,
        guestToken,
        body: req.body,
      });

      const statusCode = data.isDuplicate ? 200 : 201;
      return sendSuccess(res, {
        statusCode,
        message: data.isDuplicate ? 'Order already placed' : 'Order placed successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new CheckoutController();

