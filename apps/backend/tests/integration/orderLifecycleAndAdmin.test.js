const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = require('../../src/app');
const { env } = require('../../src/config/env');
const { startTestDb, stopTestDb, clearTestDb } = require('../helpers/testDb');
const AdminUser = require('../../src/modules/users/models/adminUser.model');
const Customer = require('../../src/modules/users/models/customer.model');
const Audience = require('../../src/modules/catalog/models/audience.model');
const Category = require('../../src/modules/catalog/models/category.model');
const Subcategory = require('../../src/modules/catalog/models/subcategory.model');
const Product = require('../../src/modules/catalog/models/product.model');
const Variant = require('../../src/modules/catalog/models/variant.model');
const Batch = require('../../src/modules/inventory/models/batch.model');
const Settings = require('../../src/modules/settings/models/settings.model');
const checkoutService = require('../../src/modules/checkout/checkout.service');
const {
  ROLES,
  TOKEN_AUDIENCE,
  PERMISSIONS,
  PRODUCT_STATUS,
  BATCH_STATUS,
  ORDER_STATUS,
  PAYMENT_METHOD,
} = require('@younora/shared-constants');

jest.setTimeout(60000);

describe('Slice 4: Order Lifecycle State Machine, Admin CRM Orders & Manual Orders', () => {
  let superAdminToken;
  let unauthorizedStaffToken;
  let customer;
  let customerToken;
  let otherCustomerToken;
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

    const passwordHash = await bcrypt.hash('Admin@123', 10);

    // 1. Super Admin
    const superAdmin = await AdminUser.create({
      name: 'Super Admin',
      email: 'admin@younora.com',
      passwordHash,
      role: ROLES.SUPER_ADMIN,
      permissions: [],
      isActive: true,
    });
    superAdminToken = jwt.sign(
      { sub: superAdmin._id.toString(), role: superAdmin.role },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '1h', audience: TOKEN_AUDIENCE.ADMIN }
    );

    // 2. Staff without orders permissions
    const unauthorizedStaff = await AdminUser.create({
      name: 'Auditor',
      email: 'auditor@younora.com',
      passwordHash,
      role: ROLES.STAFF,
      permissions: [PERMISSIONS.AUDIT_READ],
      isActive: true,
    });
    unauthorizedStaffToken = jwt.sign(
      { sub: unauthorizedStaff._id.toString(), role: unauthorizedStaff.role },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '1h', audience: TOKEN_AUDIENCE.ADMIN }
    );

    // 3. Customers
    customer = await Customer.create({
      name: 'Sneha Patel',
      email: 'sneha@example.com',
      passwordHash,
      phone: '9876543210',
      isVerified: true,
    });
    customerToken = jwt.sign(
      { sub: customer._id.toString(), role: 'CUSTOMER' },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '1h', audience: TOKEN_AUDIENCE.CUSTOMER }
    );

    const otherCustomer = await Customer.create({
      name: 'Other Buyer',
      email: 'other@example.com',
      passwordHash,
      phone: '9876543211',
      isVerified: true,
    });
    otherCustomerToken = jwt.sign(
      { sub: otherCustomer._id.toString(), role: 'CUSTOMER' },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '1h', audience: TOKEN_AUDIENCE.CUSTOMER }
    );

    // 4. Catalog & Batches
    const audience = await Audience.create({ name: 'Women', slug: 'women' });
    const category = await Category.create({ name: 'Gowns', slug: 'gowns', audience: audience._id });
    const subcategory = await Subcategory.create({ name: 'Bridal', slug: 'bridal', category: category._id });

    const product = await Product.create({
      name: 'Imperial Crimson Embroidered Gown',
      slug: 'imperial-crimson-gown',
      description: 'Opulent designer gown with French lace and zardozi.',
      audience: audience._id,
      category: category._id,
      subcategory: subcategory._id,
      status: PRODUCT_STATUS.ACTIVE,
      colors: [{ name: 'Crimson', hex: '#DC143C', images: [{ url: 'https://img.com/gown.jpg', publicId: 'g1' }] }],
    });

    variant = await Variant.create({
      product: product._id,
      sku: 'YNR-GWN-CRIMSON-S',
      color: { name: 'Crimson', hex: '#DC143C' },
      size: 'S',
      mrp: 5000000,
      sellingPrice: 4200000, // 42,000 INR = 4200000 paise
      costPrice: 2000000,
      stock: 5,
      reservedStock: 0,
      isActive: true,
    });

    batch = await Batch.create({
      batchNo: 'YNR-2611-WMN-0099',
      product: product._id,
      receivedOn: new Date(),
      status: BATCH_STATUS.ACTIVE,
      items: [{ variant: variant._id, qtyReceived: 5, qtyAvailable: 5, qtyReserved: 0, qtySold: 0 }],
    });
  });

  describe('Customer Order Endpoints', () => {
    let order;

    beforeEach(async () => {
      const checkoutRes = await checkoutService.placeOrder({
        customer,
        body: {
          idempotencyKey: 'idemp-customer-order-1',
          items: [{ variantId: variant._id.toString(), qty: 1 }],
          shippingAddress: {
            name: 'Sneha Patel',
            phone: '9876543210',
            line1: 'Flat 501, Sun City',
            city: 'Ahmedabad',
            state: 'Gujarat',
            stateCode: '24',
            pincode: '380015',
            country: 'IN',
          },
          paymentMethod: PAYMENT_METHOD.COD,
        },
      });
      order = checkoutRes.order;
    });

    it('GET /api/v1/orders lists orders belonging to the authenticated customer', async () => {
      const res = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].orderNo).toBe(order.orderNo);
    });

    it('GET /api/v1/orders isolation: other customer cannot see this order in their list', async () => {
      const res = await request(app)
        .get('/api/v1/orders')
        .set('Authorization', `Bearer ${otherCustomerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it('POST /api/v1/orders/:orderNo/cancel cancels order before shipment and releases stock', async () => {
      const res = await request(app)
        .post(`/api/v1/orders/${order.orderNo}/cancel`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ reason: 'Changed mind regarding size' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(ORDER_STATUS.CANCELLED);

      // Verify stock released back to batch
      const updatedBatch = await Batch.findById(batch._id);
      expect(updatedBatch.items[0].qtyAvailable).toBe(5);
    });
  });

  describe('Admin Order Management & State Machine Enforcement', () => {
    let order;

    beforeEach(async () => {
      const checkoutRes = await checkoutService.placeOrder({
        customer,
        body: {
          idempotencyKey: 'idemp-admin-order-1',
          items: [{ variantId: variant._id.toString(), qty: 1 }],
          shippingAddress: {
            name: 'Sneha Patel',
            phone: '9876543210',
            line1: 'Flat 501, Sun City',
            city: 'Ahmedabad',
            state: 'Gujarat',
            stateCode: '24',
            pincode: '380015',
            country: 'IN',
          },
          paymentMethod: PAYMENT_METHOD.COD,
        },
      });
      order = checkoutRes.order;
    });

    it('rejects unauthorized staff from accessing admin orders', async () => {
      const res = await request(app)
        .get('/api/v1/admin/orders')
        .set('Authorization', `Bearer ${unauthorizedStaffToken}`);

      expect(res.status).toBe(403);
    });

    it('GET /api/v1/admin/orders lists all orders for authorized admin', async () => {
      const res = await request(app)
        .get('/api/v1/admin/orders')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].orderNo).toBe(order.orderNo);
    });

    it('valid state transitions: CONFIRMED -> PACKED -> READY_TO_SHIP -> SHIPPED', async () => {
      // 1. CONFIRMED -> PACKED
      const packedRes = await request(app)
        .patch(`/api/v1/admin/orders/${order.orderNo}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: ORDER_STATUS.PACKED, note: 'Order packed in luxury velvet box' });

      expect(packedRes.status).toBe(200);
      expect(packedRes.body.data.status).toBe(ORDER_STATUS.PACKED);

      // 2. PACKED -> READY_TO_SHIP
      const readyRes = await request(app)
        .patch(`/api/v1/admin/orders/${order.orderNo}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: ORDER_STATUS.READY_TO_SHIP, note: 'Manifested' });

      expect(readyRes.status).toBe(200);
      expect(readyRes.body.data.status).toBe(ORDER_STATUS.READY_TO_SHIP);

      // 3. READY_TO_SHIP -> SHIPPED
      const shippedRes = await request(app)
        .patch(`/api/v1/admin/orders/${order.orderNo}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: ORDER_STATUS.SHIPPED, note: 'Dispatched via courier' });

      expect(shippedRes.status).toBe(200);
      expect(shippedRes.body.data.status).toBe(ORDER_STATUS.SHIPPED);
    });

    it('rejects illegal status transition (e.g. CONFIRMED directly to DELIVERED) with 400', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/orders/${order.orderNo}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ status: ORDER_STATUS.DELIVERED });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid status transition/i);
    });

    it('attaches packing proof photo via POST /api/v1/admin/orders/:orderNo/packing-proof', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/orders/${order.orderNo}/packing-proof`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          url: 'https://cloudinary.com/younora/proof1.jpg',
          publicId: 'proof1',
          type: 'IMAGE',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.packingProof).toHaveLength(1);
      expect(res.body.data.packingProof[0].url).toBe('https://cloudinary.com/younora/proof1.jpg');
    });

    it('creates manual phone order via POST /api/v1/admin/orders/manual', async () => {
      const res = await request(app)
        .post('/api/v1/admin/orders/manual')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          items: [{ variantId: variant._id.toString(), qty: 1 }],
          guest: {
            name: 'Phone Buyer',
            email: 'phonebuyer@example.com',
            phone: '9876543299',
          },
          shippingAddress: {
            name: 'Phone Buyer',
            phone: '9876543299',
            line1: 'B-404, Grand Palace',
            city: 'New Delhi',
            state: 'Delhi',
            stateCode: '07',
            pincode: '110001',
            country: 'IN',
          },
          paymentMethod: PAYMENT_METHOD.COD,
          notes: 'Customer ordered via WhatsApp concierge service',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.source).toBe('ADMIN');
      expect(res.body.data.status).toBe(ORDER_STATUS.CONFIRMED);
      expect(res.body.data.orderNo).toMatch(/^YNR-\d{4}-\d{5}$/);
    });
  });
});

