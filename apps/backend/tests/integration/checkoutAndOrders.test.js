const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = require('../../src/app');
const { env } = require('../../src/config/env');
const { startTestDb, stopTestDb, clearTestDb } = require('../helpers/testDb');
const Customer = require('../../src/modules/users/models/customer.model');
const Audience = require('../../src/modules/catalog/models/audience.model');
const Category = require('../../src/modules/catalog/models/category.model');
const Subcategory = require('../../src/modules/catalog/models/subcategory.model');
const Product = require('../../src/modules/catalog/models/product.model');
const Variant = require('../../src/modules/catalog/models/variant.model');
const Batch = require('../../src/modules/inventory/models/batch.model');
const Settings = require('../../src/modules/settings/models/settings.model');
const Order = require('../../src/modules/orders/models/order.model');
const Invoice = require('../../src/modules/orders/models/invoice.model');
const {
  TOKEN_AUDIENCE,
  PRODUCT_STATUS,
  BATCH_STATUS,
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
} = require('@younora/shared-constants');

jest.setTimeout(60000);

describe('Slice 2: Checkout Preview, Idempotency & FIFO Atomic Order Placement', () => {
  let customer;
  let customerToken;
  let product;
  let variant;
  let batch1;
  let _batch2;

  beforeAll(async () => {
    await startTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    await Settings.getSettings();

    // 1. Seed Customer
    const passwordHash = await bcrypt.hash('Customer@123', 10);
    customer = await Customer.create({
      name: 'Pooja Sharma',
      email: 'pooja.sharma@example.com',
      passwordHash,
      phone: '9876543210',
      isVerified: true,
    });

    customerToken = jwt.sign(
      { sub: customer._id.toString(), role: 'CUSTOMER' },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '1h', audience: TOKEN_AUDIENCE.CUSTOMER }
    );

    // 2. Seed Catalog
    const audience = await Audience.create({ name: 'Women', slug: 'women' });
    const category = await Category.create({ name: 'Sarees', slug: 'sarees', audience: audience._id });
    const subcategory = await Subcategory.create({ name: 'Silk', slug: 'silk', category: category._id });

    product = await Product.create({
      name: 'Varanasi Royal Katan Silk Saree',
      slug: 'varanasi-royal-katan-silk-saree',
      description: 'Authentic handwoven Varanasi silk saree with gold zari border.',
      audience: audience._id,
      category: category._id,
      subcategory: subcategory._id,
      brand: 'Younora Atelier',
      status: PRODUCT_STATUS.ACTIVE,
      colors: [{ name: 'Royal Crimson', hex: '#DC143C', images: [{ url: 'https://img.com/saree1.jpg', publicId: 's1' }] }],
    });

    variant = await Variant.create({
      product: product._id,
      sku: 'YNR-SAR-CRIMSON-FREE',
      color: { name: 'Royal Crimson', hex: '#DC143C' },
      size: 'FREE',
      mrp: 2500000, // 25,000 INR
      sellingPrice: 1800000, // 18,000 INR = 1800000 paise
      costPrice: 900000,
      stock: 5, // total 5 units across 2 batches
      reservedStock: 0,
      isActive: true,
    });

    // 3. Seed FIFO Batches (Batch 1: 3 units received earlier; Batch 2: 2 units received later)
    batch1 = await Batch.create({
      batchNo: 'YNR-2610-WMN-0001',
      product: product._id,
      receivedOn: new Date('2026-10-01'),
      status: BATCH_STATUS.ACTIVE,
      items: [
        {
          variant: variant._id,
          qtyReceived: 3,
          qtyAvailable: 3,
          qtyReserved: 0,
          qtySold: 0,
        },
      ],
    });

    _batch2 = await Batch.create({
      batchNo: 'YNR-2611-WMN-0002',
      product: product._id,
      receivedOn: new Date('2026-11-01'),
      status: BATCH_STATUS.ACTIVE,
      items: [
        {
          variant: variant._id,
          qtyReceived: 2,
          qtyAvailable: 2,
          qtyReserved: 0,
          qtySold: 0,
        },
      ],
    });
  });

  describe('POST /api/v1/checkout/preview', () => {
    it('previews order pricing breakup and verifies stock availability', async () => {
      const res = await request(app)
        .post('/api/v1/checkout/preview')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          items: [{ variantId: variant._id.toString(), qty: 2 }],
          shippingAddress: {
            name: 'Pooja Sharma',
            phone: '9876543210',
            line1: 'B-102, Shivalik Residency',
            city: 'New Delhi',
            state: 'Delhi',
            stateCode: '07',
            pincode: '110001',
            country: 'IN',
          },
          paymentMethod: PAYMENT_METHOD.ONLINE,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.pricing.itemsTotal).toBe(3600000); // 2 * 18,000 = 36,000 INR
      expect(res.body.data.pricing.grandTotal).toBe(3600000);
      expect(res.body.data.items[0].isAvailable).toBe(true);
    });
  });

  describe('POST /api/v1/checkout/place', () => {
    it('places an ONLINE order atomically with FIFO reservation and Razorpay intent', async () => {
      const res = await request(app)
        .post('/api/v1/checkout/place')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          idempotencyKey: 'idemp-online-test-1',
          items: [{ variantId: variant._id.toString(), qty: 4 }], // Span across Batch 1 (3) + Batch 2 (1)
          shippingAddress: {
            name: 'Pooja Sharma',
            phone: '9876543210',
            line1: 'B-102, Shivalik Residency',
            city: 'New Delhi',
            state: 'Delhi',
            stateCode: '07',
            pincode: '110001',
            country: 'IN',
          },
          paymentMethod: PAYMENT_METHOD.ONLINE,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      const { order, payment } = res.body.data;

      expect(order.orderNo).toMatch(/^YNR-\d{4}-\d{5}$/);
      expect(order.status).toBe(ORDER_STATUS.PENDING_PAYMENT);
      expect(order.payment.status).toBe(PAYMENT_STATUS.PENDING);
      expect(order.expiresAt).toBeDefined();

      // Check FIFO split across 2 batches
      expect(order.items).toHaveLength(2);
      expect(order.items[0].batchNo).toBe('YNR-2610-WMN-0001');
      expect(order.items[0].qty).toBe(3);
      expect(order.items[1].batchNo).toBe('YNR-2611-WMN-0002');
      expect(order.items[1].qty).toBe(1);

      // Verify Razorpay payload returned
      expect(payment.provider).toBe('RAZORPAY');
      expect(payment.razorpayOrderId).toBeDefined();
      expect(payment.amount).toBe(7200000); // 4 * 1800000

      // Verify Variant stock reserved in DB
      const updatedVariant = await Variant.findById(variant._id);
      expect(updatedVariant.stock).toBe(1); // 5 - 4 = 1
      expect(updatedVariant.reservedStock).toBe(4);
    });

    it('idempotency: resubmitting with same key returns existing order without double-booking', async () => {
      const payload = {
        idempotencyKey: 'idemp-duplicate-safe-key',
        items: [{ variantId: variant._id.toString(), qty: 2 }],
        shippingAddress: {
          name: 'Pooja Sharma',
          phone: '9876543210',
          line1: 'B-102, Shivalik Residency',
          city: 'New Delhi',
          state: 'Delhi',
          stateCode: '07',
          pincode: '110001',
          country: 'IN',
        },
        paymentMethod: PAYMENT_METHOD.ONLINE,
      };

      const firstRes = await request(app)
        .post('/api/v1/checkout/place')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(payload);

      expect(firstRes.status).toBe(201);
      const firstOrderNo = firstRes.body.data.order.orderNo;

      // Resubmit same payload and idempotency key
      const secondRes = await request(app)
        .post('/api/v1/checkout/place')
        .set('Authorization', `Bearer ${customerToken}`)
        .send(payload);

      expect(secondRes.status).toBe(200);
      expect(secondRes.body.data.isDuplicate).toBe(true);
      expect(secondRes.body.data.order.orderNo).toBe(firstOrderNo);

      // Stock was only reserved once
      const updatedVariant = await Variant.findById(variant._id);
      expect(updatedVariant.stock).toBe(3); // 5 - 2 = 3
    });

    it('places a COD order immediately CONFIRMED, commits sale, and generates internal invoice', async () => {
      const res = await request(app)
        .post('/api/v1/checkout/place')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          idempotencyKey: 'idemp-cod-test-1',
          items: [{ variantId: variant._id.toString(), qty: 2 }],
          shippingAddress: {
            name: 'Pooja Sharma',
            phone: '9876543210',
            line1: 'B-102, Shivalik Residency',
            city: 'New Delhi',
            state: 'Delhi',
            stateCode: '07',
            pincode: '110001',
            country: 'IN',
          },
          paymentMethod: PAYMENT_METHOD.COD,
        });

      expect(res.status).toBe(201);
      const { order, payment } = res.body.data;

      expect(order.status).toBe(ORDER_STATUS.CONFIRMED);
      expect(order.payment.status).toBe(PAYMENT_STATUS.COD_PENDING);
      expect(payment.provider).toBe('COD');

      // Verify Invoices created
      const invoices = await Invoice.find({ order: order._id });
      expect(invoices.length).toBeGreaterThanOrEqual(1);
      expect(invoices[0].number).toMatch(/^INV\/\d{4}\/\d{5}$/);

      // Verify batch items marked as sold
      const b1 = await Batch.findById(batch1._id);
      expect(b1.items[0].qtySold).toBe(2);
    });

    it('rejects order with 409 conflict when requested quantity exceeds available stock', async () => {
      // Available stock is 5
      const res = await request(app)
        .post('/api/v1/checkout/place')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          idempotencyKey: 'idemp-overstock-attempt',
          items: [{ variantId: variant._id.toString(), qty: 10 }],
          shippingAddress: {
            name: 'Pooja Sharma',
            phone: '9876543210',
            line1: 'B-102, Shivalik Residency',
            city: 'New Delhi',
            state: 'Delhi',
            stateCode: '07',
            pincode: '110001',
            country: 'IN',
          },
          paymentMethod: PAYMENT_METHOD.ONLINE,
        });

      expect(res.status).toBe(409);
      expect(res.body.message).toMatch(/stock reservation failed|insufficient/i);

      // Ensure no dangling order was saved
      const orderCount = await Order.countDocuments();
      expect(orderCount).toBe(0);
    });
  });
});
