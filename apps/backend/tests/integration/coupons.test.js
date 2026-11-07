const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const app = require('../../src/app');
const { env } = require('../../src/config/env');
const { startTestDb, stopTestDb, clearTestDb } = require('../helpers/testDb');
const AdminUser = require('../../src/modules/users/models/adminUser.model');
const Coupon = require('../../src/modules/pricing/models/coupon.model');
const CouponUsage = require('../../src/modules/pricing/models/couponUsage.model');
const couponService = require('../../src/modules/pricing/coupon.service');
const { ROLES, TOKEN_AUDIENCE, PERMISSIONS, COUPON_TYPE } = require('@younora/shared-constants');

jest.setTimeout(60000);

describe('Slice 3: Admin Coupons Management & Validation Integration Tests', () => {
  let superAdminToken;
  let unauthorizedStaffToken;
  let authorizedStaffToken;
  let passwordHash;

  beforeAll(async () => {
    await startTestDb();
    passwordHash = await bcrypt.hash('Admin@12345', 10);
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    // 1. Super Admin
    const superAdmin = await AdminUser.create({
      name: 'Super Admin',
      email: 'superadmin@younora.com',
      passwordHash,
      role: ROLES.SUPER_ADMIN,
      permissions: [],
      isActive: true,
    });
    superAdminToken = jwt.sign(
      { sub: superAdmin._id.toString(), role: superAdmin.role },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m', audience: TOKEN_AUDIENCE.ADMIN }
    );

    // 2. Staff without coupons.manage
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
      { expiresIn: '15m', audience: TOKEN_AUDIENCE.ADMIN }
    );

    // 3. Staff with coupons.manage
    const authorizedStaff = await AdminUser.create({
      name: 'Marketing Staff',
      email: 'marketing@younora.com',
      passwordHash,
      role: ROLES.STAFF,
      permissions: [PERMISSIONS.COUPONS_MANAGE],
      isActive: true,
    });
    authorizedStaffToken = jwt.sign(
      { sub: authorizedStaff._id.toString(), role: authorizedStaff.role },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m', audience: TOKEN_AUDIENCE.ADMIN }
    );
  });

  describe('POST /api/v1/admin/coupons', () => {
    it('returns 401 Unauthorized without auth token', async () => {
      const res = await request(app)
        .post('/api/v1/admin/coupons')
        .send({
          code: 'FESTIVE15',
          type: COUPON_TYPE.PERCENT,
          value: 15,
        });

      expect(res.status).toBe(401);
    });

    it('returns 403 Forbidden for staff lacking coupons.manage', async () => {
      const res = await request(app)
        .post('/api/v1/admin/coupons')
        .set('Authorization', `Bearer ${unauthorizedStaffToken}`)
        .send({
          code: 'FESTIVE15',
          type: COUPON_TYPE.PERCENT,
          value: 15,
        });

      expect(res.status).toBe(403);
    });

    it('creates a new PERCENT coupon successfully with authorized staff', async () => {
      const res = await request(app)
        .post('/api/v1/admin/coupons')
        .set('Authorization', `Bearer ${authorizedStaffToken}`)
        .send({
          code: 'festive15 ',
          description: '15% off festive wedding collection',
          type: COUPON_TYPE.PERCENT,
          value: 15,
          maxDiscount: 150000,
          minCartValue: 500000,
          usageLimit: 100,
          perUserLimit: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe('FESTIVE15'); // Uppercased & trimmed
      expect(res.body.data.value).toBe(15);
      expect(res.body.data.maxDiscount).toBe(150000);
      expect(res.body.data.minCartValue).toBe(500000);
      expect(res.body.data.isActive).toBe(true);
    });

    it('creates a FLAT coupon with paise integer value', async () => {
      const res = await request(app)
        .post('/api/v1/admin/coupons')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          code: 'FLAT500',
          description: 'Rs 500 off on luxury purchases',
          type: COUPON_TYPE.FLAT,
          value: 50000, // 50000 paise = Rs 500
          minCartValue: 200000,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.code).toBe('FLAT500');
      expect(res.body.data.value).toBe(50000);
    });

    it('rejects duplicate coupon code with 409 Conflict', async () => {
      await request(app)
        .post('/api/v1/admin/coupons')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          code: 'UNIQUE10',
          type: COUPON_TYPE.PERCENT,
          value: 10,
        });

      const res = await request(app)
        .post('/api/v1/admin/coupons')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          code: 'UNIQUE10',
          type: COUPON_TYPE.PERCENT,
          value: 10,
        });

      expect(res.status).toBe(409);
    });

    it('rejects invalid percent values (> 100 or <= 0)', async () => {
      const res = await request(app)
        .post('/api/v1/admin/coupons')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          code: 'INVALID120',
          type: COUPON_TYPE.PERCENT,
          value: 120,
        });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/admin/coupons', () => {
    beforeEach(async () => {
      await Coupon.create([
        { code: 'COUPON1', type: COUPON_TYPE.PERCENT, value: 10, isActive: true },
        { code: 'COUPON2', type: COUPON_TYPE.FLAT, value: 50000, isActive: true },
        { code: 'COUPON3', type: COUPON_TYPE.PERCENT, value: 20, isActive: false },
      ]);
    });

    it('lists coupons with pagination and filters', async () => {
      const res = await request(app)
        .get('/api/v1/admin/coupons?isActive=true')
        .set('Authorization', `Bearer ${authorizedStaffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.total).toBe(2);
    });

    it('searches coupons by code keyword', async () => {
      const res = await request(app)
        .get('/api/v1/admin/coupons?search=COUPON2')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].code).toBe('COUPON2');
    });
  });

  describe('GET, PATCH & DELETE /api/v1/admin/coupons/:id', () => {
    let testCoupon;

    beforeEach(async () => {
      testCoupon = await Coupon.create({
        code: 'LUXURY20',
        description: '20% off luxury silks',
        type: COUPON_TYPE.PERCENT,
        value: 20,
        minCartValue: 500000,
        isActive: true,
      });
    });

    it('fetches coupon by ID', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/coupons/${testCoupon._id}`)
        .set('Authorization', `Bearer ${authorizedStaffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.code).toBe('LUXURY20');
    });

    it('updates coupon successfully', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/coupons/${testCoupon._id}`)
        .set('Authorization', `Bearer ${authorizedStaffToken}`)
        .send({
          minCartValue: 750000,
          description: 'Updated description',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.minCartValue).toBe(750000);
      expect(res.body.data.description).toBe('Updated description');
    });

    it('hard deletes unused coupon', async () => {
      const res = await request(app)
        .delete(`/api/v1/admin/coupons/${testCoupon._id}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      const inDb = await Coupon.findById(testCoupon._id);
      expect(inDb).toBeNull();
    });

    it('soft-deactivates coupon if already used', async () => {
      testCoupon.usedCount = 5;
      await testCoupon.save();

      const res = await request(app)
        .delete(`/api/v1/admin/coupons/${testCoupon._id}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      const inDb = await Coupon.findById(testCoupon._id);
      expect(inDb).not.toBeNull();
      expect(inDb.isActive).toBe(false);
    });
  });

  describe('CouponService.validateCouponForCart()', () => {
    it('validates active coupon correctly', async () => {
      await Coupon.create({
        code: 'VALID10',
        type: COUPON_TYPE.PERCENT,
        value: 10,
        isActive: true,
      });

      const coupon = await couponService.validateCouponForCart('valid10');
      expect(coupon.code).toBe('VALID10');
    });

    it('throws error for inactive or non-existent coupon', async () => {
      await expect(
        couponService.validateCouponForCart('NONEXISTENT')
      ).rejects.toThrow(/invalid or inactive/);
    });

    it('throws error when coupon has expired', async () => {
      await Coupon.create({
        code: 'EXPIRED10',
        type: COUPON_TYPE.PERCENT,
        value: 10,
        expiresAt: new Date(Date.now() - 10000),
        isActive: true,
      });

      await expect(
        couponService.validateCouponForCart('EXPIRED10')
      ).rejects.toThrow(/expired/);
    });

    it('throws error when global usage limit reached', async () => {
      await Coupon.create({
        code: 'LIMITED10',
        type: COUPON_TYPE.PERCENT,
        value: 10,
        usageLimit: 2,
        usedCount: 2,
        isActive: true,
      });

      await expect(
        couponService.validateCouponForCart('LIMITED10')
      ).rejects.toThrow(/usage limit has been reached/);
    });

    it('enforces perUserLimit against CouponUsage records', async () => {
      const customerId = new mongoose.Types.ObjectId();
      const c = await Coupon.create({
        code: 'ONCEPERUSER',
        type: COUPON_TYPE.PERCENT,
        value: 10,
        perUserLimit: 1,
        isActive: true,
      });

      await CouponUsage.create({
        coupon: c._id,
        couponCode: 'ONCEPERUSER',
        customer: customerId,
      });

      await expect(
        couponService.validateCouponForCart('ONCEPERUSER', { customerId })
      ).rejects.toThrow(/reached the maximum usage limit/);
    });

    it('enforces firstOrderOnly restriction', async () => {
      const customerId = new mongoose.Types.ObjectId();
      const c = await Coupon.create({
        code: 'WELCOME10',
        type: COUPON_TYPE.PERCENT,
        value: 10,
        firstOrderOnly: true,
        isActive: true,
      });

      await CouponUsage.create({
        coupon: c._id,
        couponCode: 'ANOTHERCODE',
        customer: customerId,
      });

      await expect(
        couponService.validateCouponForCart('WELCOME10', { customerId })
      ).rejects.toThrow(/first-time orders/);
    });
  });
});

