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
const Coupon = require('../../src/modules/pricing/models/coupon.model');
const ResellerShare = require('../../src/modules/pricing/models/resellerShare.model');
const Cart = require('../../src/modules/cart/models/cart.model');
const Settings = require('../../src/modules/settings/models/settings.model');
const { TOKEN_AUDIENCE, PRODUCT_STATUS, COUPON_TYPE } = require('@younora/shared-constants');

jest.setTimeout(60000);

describe('Slice 4: Cart Module, Stock Checks, Guest Merge & Pricing Integration', () => {
  let customer;
  let customerToken;
  let audience;
  let category;
  let subcategory;
  let product;
  let variant1;
  let variant2;
  let outOfStockVariant;

  beforeAll(async () => {
    await startTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    // Ensure default settings exist
    await Settings.getSettings();

    // 1. Seed Customer
    const passwordHash = await bcrypt.hash('Customer@123', 10);
    customer = await Customer.create({
      name: 'Pooja Sharma',
      email: 'pooja.sharma@example.com',
      passwordHash,
      phone: '9876543210',
      resellerStatus: 'APPROVED',
      isVerified: true,
    });

    customerToken = jwt.sign(
      { sub: customer._id.toString(), role: 'CUSTOMER' },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '1h', audience: TOKEN_AUDIENCE.CUSTOMER }
    );

    // 2. Seed Catalog
    audience = await Audience.create({
      name: 'Women',
      slug: 'women',
    });

    category = await Category.create({
      name: 'Ethnic Wear',
      slug: 'ethnic-wear',
      audience: audience._id,
    });

    subcategory = await Subcategory.create({
      name: 'Lehengas',
      slug: 'lehengas',
      category: category._id,
    });

    product = await Product.create({
      name: 'Royal Heritage Silk Lehenga',
      slug: 'royal-heritage-silk-lehenga',
      description: 'Handcrafted pure raw silk bridal lehenga with zardozi embroidery.',
      audience: audience._id,
      category: category._id,
      subcategory: subcategory._id,
      brand: 'Younora Atelier',
      status: PRODUCT_STATUS.ACTIVE,
      resellingEnabled: true,
      colors: [
        {
          name: 'Ruby Red',
          hex: '#9B111E',
          images: [{ url: 'https://img.com/ruby1.jpg', publicId: 'ruby1' }],
        },
      ],
    });

    variant1 = await Variant.create({
      product: product._id,
      sku: 'YNR-LEH-RED-38',
      color: { name: 'Ruby Red', hex: '#9B111E' },
      size: '38',
      mrp: 6500000, // Rs 65,000
      sellingPrice: 5000000, // Rs 50,000
      costPrice: 2500000,
      stock: 5,
      reservedStock: 0,
      isActive: true,
    });

    variant2 = await Variant.create({
      product: product._id,
      sku: 'YNR-LEH-RED-40',
      color: { name: 'Ruby Red', hex: '#9B111E' },
      size: '40',
      mrp: 6500000,
      sellingPrice: 5000000,
      costPrice: 2500000,
      stock: 3,
      reservedStock: 0,
      isActive: true,
    });

    outOfStockVariant = await Variant.create({
      product: product._id,
      sku: 'YNR-LEH-RED-42',
      color: { name: 'Ruby Red', hex: '#9B111E' },
      size: '42',
      mrp: 6500000,
      sellingPrice: 5000000,
      costPrice: 2500000,
      stock: 0,
      reservedStock: 0,
      isActive: true,
    });
  });

  describe('GET /api/v1/cart', () => {
    it('returns 400 Bad Request when neither user token nor x-guest-token is provided', async () => {
      const res = await request(app).get('/api/v1/cart');
      expect(res.status).toBe(400);
    });

    it('creates and returns an empty cart for a guest with x-guest-token', async () => {
      const res = await request(app)
        .get('/api/v1/cart')
        .set('x-guest-token', 'guest_abc_123');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.pricing.grandTotal).toBe(0);
    });

    it('returns cart for authenticated customer', async () => {
      const res = await request(app)
        .get('/api/v1/cart')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
    });
  });

  describe('POST /api/v1/cart/items', () => {
    it('adds an item to guest cart and computes pricing breakdown', async () => {
      const res = await request(app)
        .post('/api/v1/cart/items')
        .set('x-guest-token', 'guest_abc_123')
        .send({
          variantId: variant1._id.toString(),
          qty: 2,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.items).toHaveLength(1);
      expect(res.body.data.items[0].qty).toBe(2);
      expect(res.body.data.items[0].variant.sku).toBe('YNR-LEH-RED-38');
      expect(res.body.data.pricing.itemsCount).toBe(2);
      expect(res.body.data.pricing.itemsTotal).toBe(10000000); // 2 * 50,000 = 1,00,000 INR = 10000000 paise
      expect(res.body.data.pricing.grandTotal).toBe(10000000);
    });

    it('rejects adding an out-of-stock variant', async () => {
      const res = await request(app)
        .post('/api/v1/cart/items')
        .set('x-guest-token', 'guest_abc_123')
        .send({
          variantId: outOfStockVariant._id.toString(),
          qty: 1,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/out of stock/i);
    });

    it('increments quantity when same variant is added again', async () => {
      await request(app)
        .post('/api/v1/cart/items')
        .set('x-guest-token', 'guest_abc_123')
        .send({ variantId: variant1._id.toString(), qty: 1 });

      const res = await request(app)
        .post('/api/v1/cart/items')
        .set('x-guest-token', 'guest_abc_123')
        .send({ variantId: variant1._id.toString(), qty: 2 });

      expect(res.status).toBe(201);
      expect(res.body.data.items[0].qty).toBe(3);
    });

    it('rejects adding quantity exceeding available stock', async () => {
      // Stock is 5
      const res = await request(app)
        .post('/api/v1/cart/items')
        .set('x-guest-token', 'guest_abc_123')
        .send({ variantId: variant1._id.toString(), qty: 8 });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/units available in stock/i);
    });
  });

  describe('PATCH & DELETE /api/v1/cart/items/:variantId', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/v1/cart/items')
        .set('x-guest-token', 'guest_abc_123')
        .send({ variantId: variant1._id.toString(), qty: 2 });
    });

    it('updates item quantity successfully', async () => {
      const res = await request(app)
        .patch(`/api/v1/cart/items/${variant1._id}`)
        .set('x-guest-token', 'guest_abc_123')
        .send({ qty: 4 });

      expect(res.status).toBe(200);
      expect(res.body.data.items[0].qty).toBe(4);
      expect(res.body.data.pricing.itemsCount).toBe(4);
    });

    it('removes item when quantity is updated to 0', async () => {
      const res = await request(app)
        .patch(`/api/v1/cart/items/${variant1._id}`)
        .set('x-guest-token', 'guest_abc_123')
        .send({ qty: 0 });

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(0);
      expect(res.body.data.pricing.itemsCount).toBe(0);
    });

    it('deletes item explicitly via DELETE', async () => {
      const res = await request(app)
        .delete(`/api/v1/cart/items/${variant1._id}`)
        .set('x-guest-token', 'guest_abc_123');

      expect(res.status).toBe(200);
      expect(res.body.data.items).toHaveLength(0);
    });
  });

  describe('POST & DELETE /api/v1/cart/coupon', () => {
    beforeEach(async () => {
      await Coupon.create({
        code: 'ROYAL10',
        description: '10% off wedding royal collection',
        type: COUPON_TYPE.PERCENT,
        value: 10,
        maxDiscount: 200000, // Rs 2,000 cap = 200000 paise
        minCartValue: 1000000,
        isActive: true,
      });

      await request(app)
        .post('/api/v1/cart/items')
        .set('x-guest-token', 'guest_abc_123')
        .send({ variantId: variant1._id.toString(), qty: 1 }); // 50,000 INR
    });

    it('applies coupon and recalculates discounted grand total', async () => {
      const res = await request(app)
        .post('/api/v1/cart/coupon')
        .set('x-guest-token', 'guest_abc_123')
        .send({ code: 'royal10' });

      expect(res.status).toBe(200);
      expect(res.body.data.couponCode).toBe('ROYAL10');
      // 10% of 50,000 is 5,000, capped at maxDiscount 2,000 (200000 paise)
      expect(res.body.data.pricing.couponDiscount).toBe(200000);
      expect(res.body.data.pricing.grandTotal).toBe(5000000 - 200000);
    });

    it('removes applied coupon', async () => {
      await request(app)
        .post('/api/v1/cart/coupon')
        .set('x-guest-token', 'guest_abc_123')
        .send({ code: 'ROYAL10' });

      const res = await request(app)
        .delete('/api/v1/cart/coupon')
        .set('x-guest-token', 'guest_abc_123');

      expect(res.status).toBe(200);
      expect(res.body.data.couponCode).toBeNull();
      expect(res.body.data.pricing.couponDiscount).toBe(0);
      expect(res.body.data.pricing.grandTotal).toBe(5000000);
    });
  });

  describe('Reseller share token in cart', () => {
    it('applies reseller margin when shareToken is provided', async () => {
      await ResellerShare.create({
        reseller: customer._id,
        product: product._id,
        token: 'share_pooja_123',
        marginPerUnit: 250000, // Rs 2,500 margin = 250000 paise
        isActive: true,
      });

      const res = await request(app)
        .post('/api/v1/cart/items')
        .set('x-guest-token', 'guest_buyer_999')
        .send({
          variantId: variant1._id.toString(),
          qty: 1,
          shareToken: 'share_pooja_123',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.shareToken).toBe('share_pooja_123');
      // Base selling 50,000 + 2,500 = 52,500 (5250000 paise)
      expect(res.body.data.pricing.resellerShare).toBe(250000);
      expect(res.body.data.pricing.itemsTotal).toBe(5250000);
      expect(res.body.data.pricing.grandTotal).toBe(5250000);
    });
  });

  describe('POST /api/v1/cart/merge', () => {
    it('merges guest cart items into authenticated customer cart on login', async () => {
      // 1. Guest adds variant 1 and variant 2
      await request(app)
        .post('/api/v1/cart/items')
        .set('x-guest-token', 'guest_session_temp')
        .send({ variantId: variant1._id.toString(), qty: 1 });

      await request(app)
        .post('/api/v1/cart/items')
        .set('x-guest-token', 'guest_session_temp')
        .send({ variantId: variant2._id.toString(), qty: 2 });

      // 2. Customer already had 1 unit of variant 1
      await request(app)
        .post('/api/v1/cart/items')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ variantId: variant1._id.toString(), qty: 1 });

      // 3. Customer logs in and calls merge
      const res = await request(app)
        .post('/api/v1/cart/merge')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ guestToken: 'guest_session_temp' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toHaveLength(2);

      const v1Item = res.body.data.items.find(
        (i) => i.variant._id.toString() === variant1._id.toString()
      );
      const v2Item = res.body.data.items.find(
        (i) => i.variant._id.toString() === variant2._id.toString()
      );

      // 1 from customer + 1 from guest = 2
      expect(v1Item.qty).toBe(2);
      // 2 from guest
      expect(v2Item.qty).toBe(2);

      // Verify guest cart was deleted
      const guestCartInDb = await Cart.findOne({ guestToken: 'guest_session_temp' });
      expect(guestCartInDb).toBeNull();
    });
  });
});
