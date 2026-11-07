const crypto = require('crypto');
const Razorpay = require('razorpay');
const { env } = require('../../config/env');
const AppError = require('../../core/errors/appError');
const logger = require('../../core/logger');

class RazorpayService {
  constructor() {
    this._client = null;
  }

  getClient() {
    if (!this._client) {
      this._client = new Razorpay({
        key_id: env.RAZORPAY_KEY_ID,
        key_secret: env.RAZORPAY_KEY_SECRET,
      });
    }
    return this._client;
  }

  /**
   * Creates an order with Razorpay
   *
   * @param {Object} params
   * @param {string} params.orderNo
   * @param {number} params.amount - in integer paise
   * @param {string} [params.currency='INR']
   * @param {Object} [params.notes={}]
   * @returns {Promise<{ id: string, amount: number, currency: string, receipt: string }>}
   */
  async createOrder({ orderNo, amount, currency = 'INR', notes = {} }) {
    if (!amount || amount <= 0) {
      throw AppError.badRequest('Order amount must be a positive integer in paise');
    }

    try {
      // In test environment or when using placeholder credentials, return deterministic mock
      if (
        env.NODE_ENV === 'test' ||
        env.RAZORPAY_KEY_ID === 'rzp_test_placeholder' ||
        !env.RAZORPAY_KEY_ID
      ) {
        return {
          id: `order_mock_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
          amount,
          currency,
          receipt: orderNo,
          status: 'created',
          notes,
        };
      }

      const client = this.getClient();
      const rzpOrder = await client.orders.create({
        amount: Math.round(amount), // integer paise
        currency,
        receipt: orderNo,
        notes: {
          ...notes,
          orderNo,
        },
      });

      return rzpOrder;
    } catch (err) {
      logger.error({ err, orderNo, amount }, 'Razorpay orders.create failed');
      throw new AppError(500, 'PAYMENT_GATEWAY_ERROR', `Failed to create payment order: ${err.message}`);
    }
  }

  /**
   * Verifies client-side Razorpay payment signature
   */
  verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      return false;
    }

    const payload = `${razorpayOrderId}|${razorpayPaymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
      .update(payload)
      .digest('hex');

    try {
      const expectedBuf = Buffer.from(expectedSignature, 'utf8');
      const actualBuf = Buffer.from(razorpaySignature, 'utf8');

      if (expectedBuf.length !== actualBuf.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuf, actualBuf);
    } catch {
      return false;
    }
  }

  /**
   * Verifies incoming webhook raw body signature
   */
  verifyWebhookSignature(rawBody, signature) {
    if (!rawBody || !signature) {
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    try {
      const expectedBuf = Buffer.from(expectedSignature, 'utf8');
      const actualBuf = Buffer.from(signature, 'utf8');

      if (expectedBuf.length !== actualBuf.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuf, actualBuf);
    } catch {
      return false;
    }
  }

  /**
   * Issues a refund via Razorpay
   */
  async createRefund({ paymentId, amount, notes = {} }) {
    try {
      if (
        env.NODE_ENV === 'test' ||
        env.RAZORPAY_KEY_ID === 'rzp_test_placeholder' ||
        !env.RAZORPAY_KEY_ID
      ) {
        return {
          id: `rfnd_mock_${Date.now()}`,
          payment_id: paymentId,
          amount,
          status: 'processed',
          notes,
        };
      }

      const client = this.getClient();
      return await client.payments.refund(paymentId, {
        amount: Math.round(amount),
        notes,
      });
    } catch (err) {
      logger.error({ err, paymentId, amount }, 'Razorpay refund failed');
      throw new AppError(500, 'REFUND_FAILED', `Razorpay refund failed: ${err.message}`);
    }
  }
}

module.exports = new RazorpayService();

