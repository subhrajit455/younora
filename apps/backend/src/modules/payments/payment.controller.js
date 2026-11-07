const paymentService = require('./payment.service');
const { sendSuccess } = require('../../core/http/response');

class PaymentController {
  async verifyPayment(req, res, next) {
    try {
      const order = await paymentService.verifyPayment(req.body);
      return sendSuccess(res, {
        message: 'Payment verified successfully',
        data: order,
      });
    } catch (err) {
      return next(err);
    }
  }

  async handleWebhook(req, res, next) {
    try {
      const signature = req.headers['x-razorpay-signature'];
      const rawBody = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);

      const result = await paymentService.handleWebhook({
        rawBody,
        signature,
        event: req.body,
      });

      return res.status(200).json({ status: 'ok', ...result });
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new PaymentController();

