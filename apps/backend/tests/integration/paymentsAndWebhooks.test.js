const request = require('supertest');
const crypto = require('crypto');
const app = require('../../src/app');
const { env } = require('../../src/config/env');
const { startTestDb, stopTestDb, clearTestDb } = require('../helpers/testDb');
const Audience = require('../../src/modules/catalog/models/audience.model');
const Category = require('../../src/modules/catalog/models/category.model');
const Subcategory = require('../../src/modules/catalog/models/subcategory.model');
const Product = require('../../src/modules/catalog/models/product.model');
const Variant = require('../../src/modules/catalog/models/variant.model');
const Batch = require('../../src/modules/inventory/models/batch.model');
const Settings = require('../../src/modules/settings/models/settings.model');
const Order = require('../../src/modules/orders/models/order.model');
const Invoice = require('../../src/modules/orders/models/invoice.model');
const paymentService = require('../../src/modules/payments/payment.service');
const checkoutService = require('../../src/modules/checkout/checkout.service');
const {
  PRODUCT_STATUS,
  BATCH_STATUS,
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
} = require('@younora/shared-constants');

jest.setTimeout(60000);

describe('Slice 3: Razorpay Payment Verification, Webhook Raw Signature & Order Expiry', () => {
  let variant;
  let batch;

  beforeAll(async () => {
    await startTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    await Settings.getSettings();

    const audience = await Audience.create({ name: 'Women', slug: 'women' });
    const category = await Category.create({ name: 'Suits', slug: 'suits', audience: audience._id });
    const subcategory = await Subcategory.create({ name: 'Anarkali', slug: 'anarkali', category: category._id });

    const product = await Product.create({
      name: 'Emerald Velvet Anarkali Suit',
      slug: 'emerald-velvet-anarkali-suit',
      description: 'Luxurious silk-velvet Anarkali with gold tilla embroidery.',
      audience: audience._id,
      category: category._id,
      subcategory: subcategory._id,
      status: PRODUCT_STATUS.ACTIVE,
      colors: [{ name: 'Emerald', hex: '#097969', images: [{ url: 'https://img.com/anarkali.jpg', publicId: 'a1' }] }],
    });

    variant = await Variant.create({
      product: product._id,
      sku: 'YNR-ANR-EMERALD-M',
      color: { name: 'Emerald', hex: '#097969' },
      size: 'M',
      mrp: 3500000,
      sellingPrice: 2800000, // Rs 28,000 = 2800000 paise
      costPrice: 1400000,
      stock: 4,
      reservedStock: 0,
      isActive: true,
    });

    batch = await Batch.create({
      batchNo: 'YNR-2611-WMN-0088',
      product: product._id,
      receivedOn: new Date(),
      status: BATCH_STATUS.ACTIVE,
      items: [
        {
          variant: variant._id,
          qtyReceived: 4,
          qtyAvailable: 4,
          qtyReserved: 0,
          qtySold: 0,
        },
      ],
    });
  });

  function generateClientSignature(orderId, paymentId) {
    const payload = `${orderId}|${paymentId}`;
    return crypto.createHmac('sha256', env.RAZORPAY_KEY_SECRET).update(payload).digest('hex');
  }

  function generateWebhookSignature(rawBody) {
    return crypto.createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  }

  describe('POST /api/v1/payments/razorpay/verify', () => {
    let placedOrder;
    let rzpOrderId;

    beforeEach(async () => {
      const checkoutResult = await checkoutService.placeOrder({
        body: {
          idempotencyKey: 'idemp-verify-test-1',
          items: [{ variantId: variant._id.toString(), qty: 1 }],
          shippingAddress: {
            name: 'Kavita Singh',
            phone: '9876543210',
            line1: '404 Heritage Towers',
            city: 'New Delhi',
            state: 'Delhi',
            stateCode: '07',
            pincode: '110001',
            country: 'IN',
          },
          paymentMethod: PAYMENT_METHOD.ONLINE,
          guest: {
            name: 'Kavita Singh',
            email: 'kavita@example.com',
            phone: '9876543210',
          },
        },
      });

      placedOrder = checkoutResult.order;
      rzpOrderId = checkoutResult.payment.razorpayOrderId;
    });

    it('verifies valid HMAC payment signature, confirms order, commits sale and creates invoice', async () => {
      const paymentId = 'pay_test_payment_999';
      const validSig = generateClientSignature(rzpOrderId, paymentId);

      const res = await request(app)
        .post('/api/v1/payments/razorpay/verify')
        .send({
          orderNo: placedOrder.orderNo,
          razorpayOrderId: rzpOrderId,
          razorpayPaymentId: paymentId,
          razorpaySignature: validSig,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe(ORDER_STATUS.CONFIRMED);
      expect(res.body.data.payment.status).toBe(PAYMENT_STATUS.PAID);
      expect(res.body.data.payment.razorpayPaymentId).toBe(paymentId);

      // Verify batch items marked as sold
      const updatedBatch = await Batch.findById(batch._id);
      expect(updatedBatch.items[0].qtySold).toBe(1);

      // Verify invoice generated
      const invoices = await Invoice.find({ order: placedOrder._id });
      expect(invoices.length).toBeGreaterThanOrEqual(1);
    });

    it('rejects tampered or invalid payment signature with 400', async () => {
      const res = await request(app)
        .post('/api/v1/payments/razorpay/verify')
        .send({
          orderNo: placedOrder.orderNo,
          razorpayOrderId: rzpOrderId,
          razorpayPaymentId: 'pay_test_999',
          razorpaySignature: 'invalid_tampered_signature',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid payment signature/i);
    });
  });

  describe('POST /api/v1/payments/razorpay/webhook', () => {
    let placedOrder;
    let rzpOrderId;

    beforeEach(async () => {
      const checkoutResult = await checkoutService.placeOrder({
        body: {
          idempotencyKey: 'idemp-webhook-test-1',
          items: [{ variantId: variant._id.toString(), qty: 1 }],
          shippingAddress: {
            name: 'Kavita Singh',
            phone: '9876543210',
            line1: '404 Heritage Towers',
            city: 'New Delhi',
            state: 'Delhi',
            stateCode: '07',
            pincode: '110001',
            country: 'IN',
          },
          paymentMethod: PAYMENT_METHOD.ONLINE,
          guest: {
            name: 'Kavita Singh',
            email: 'kavita@example.com',
            phone: '9876543210',
          },
        },
      });

      placedOrder = checkoutResult.order;
      rzpOrderId = checkoutResult.payment.razorpayOrderId;
    });

    it('processes payment.captured webhook, confirms order and commits batch sale', async () => {
      const eventPayload = {
        entity: 'event',
        account_id: 'acc_test_123',
        event: 'payment.captured',
        id: 'evt_captured_unique_001',
        payload: {
          payment: {
            entity: {
              id: 'pay_webhook_captured_111',
              order_id: rzpOrderId,
              amount: placedOrder.pricing.grandTotal,
              status: 'captured',
              notes: {
                orderNo: placedOrder.orderNo,
              },
            },
          },
        },
      };

      const rawBody = JSON.stringify(eventPayload);
      const signature = generateWebhookSignature(rawBody);

      const res = await request(app)
        .post('/api/v1/payments/razorpay/webhook')
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');

      // Verify order confirmed in DB
      const dbOrder = await Order.findById(placedOrder._id);
      expect(dbOrder.status).toBe(ORDER_STATUS.CONFIRMED);
      expect(dbOrder.payment.status).toBe(PAYMENT_STATUS.PAID);
    });

    it('webhook idempotency: replay of same eventId is skipped cleanly', async () => {
      const eventPayload = {
        entity: 'event',
        event: 'payment.captured',
        id: 'evt_captured_unique_replay',
        payload: {
          payment: {
            entity: {
              id: 'pay_webhook_replay_222',
              order_id: rzpOrderId,
              amount: placedOrder.pricing.grandTotal,
              status: 'captured',
            },
          },
        },
      };

      const rawBody = JSON.stringify(eventPayload);
      const signature = generateWebhookSignature(rawBody);

      // First webhook post
      const firstRes = await request(app)
        .post('/api/v1/payments/razorpay/webhook')
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(firstRes.status).toBe(200);

      // Replay same webhook post
      const replayRes = await request(app)
        .post('/api/v1/payments/razorpay/webhook')
        .set('x-razorpay-signature', signature)
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(replayRes.status).toBe(200);
      expect(replayRes.body.duplicate).toBe(true);
    });

    it('rejects spoofed webhook signature with 400', async () => {
      const eventPayload = { event: 'payment.captured', id: 'evt_fake' };
      const rawBody = JSON.stringify(eventPayload);

      const res = await request(app)
        .post('/api/v1/payments/razorpay/webhook')
        .set('x-razorpay-signature', 'fake_signature')
        .set('Content-Type', 'application/json')
        .send(rawBody);

      expect(res.status).toBe(400);
    });
  });

  describe('Unpaid Order Expiry & Stock Release', () => {
    it('cancels expired pending orders and releases reserved stock back to batches', async () => {
      // Place order with 2 units
      const checkoutResult = await checkoutService.placeOrder({
        body: {
          idempotencyKey: 'idemp-expire-test-1',
          items: [{ variantId: variant._id.toString(), qty: 2 }],
          shippingAddress: {
            name: 'Kavita Singh',
            phone: '9876543210',
            line1: '404 Heritage Towers',
            city: 'New Delhi',
            state: 'Delhi',
            stateCode: '07',
            pincode: '110001',
            country: 'IN',
          },
          paymentMethod: PAYMENT_METHOD.ONLINE,
          guest: {
            name: 'Kavita Singh',
            email: 'kavita@example.com',
            phone: '9876543210',
          },
        },
      });

      const order = checkoutResult.order;

      // Check stock decremented
      const reservedVariant = await Variant.findById(variant._id);
      expect(reservedVariant.stock).toBe(2); // 4 - 2 = 2
      expect(reservedVariant.reservedStock).toBe(2);

      // Backdate expiresAt to simulate 15-minute timeout
      order.expiresAt = new Date(Date.now() - 60000);
      await order.save();

      // Trigger expiry processor
      const expiredCount = await paymentService.expirePendingOrders();
      expect(expiredCount).toBe(1);

      // Verify order cancelled
      const cancelledOrder = await Order.findById(order._id);
      expect(cancelledOrder.status).toBe(ORDER_STATUS.CANCELLED);

      // Verify stock restored to Variant and Batch
      const restoredVariant = await Variant.findById(variant._id);
      expect(restoredVariant.stock).toBe(4);
      expect(restoredVariant.reservedStock).toBe(0);

      const restoredBatch = await Batch.findById(batch._id);
      expect(restoredBatch.items[0].qtyAvailable).toBe(4);
      expect(restoredBatch.items[0].qtyReserved).toBe(0);
    });
  });
});

