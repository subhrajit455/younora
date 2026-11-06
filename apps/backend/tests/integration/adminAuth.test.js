const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../../src/app');
const { startTestDb, stopTestDb, clearTestDb } = require('../helpers/testDb');
const { seedSuperAdmin } = require('../../src/seed/admin.seed');
const AdminUser = require('../../src/modules/users/models/adminUser.model');
const RefreshToken = require('../../src/modules/users/models/refreshToken.model');
const { env } = require('../../src/config/env');
const { ROLES, TOKEN_AUDIENCE, PERMISSIONS } = require('@younora/shared-constants');
const authenticate = require('../../src/core/middleware/authenticate');
const { requirePermission, authorizeRole } = require('../../src/core/middleware/authorize');
const { sendSuccess } = require('../../src/core/http/response');

const express = require('express');
const errorMiddleware = require('../../src/core/errors/errorMiddleware');

// Create dedicated test app for middleware testing to avoid route precedence issues with app 404 handler
const testApp = express();
testApp.use(express.json());
testApp.get(
  '/api/v1/test-protected/super-admin-only',
  authenticate(TOKEN_AUDIENCE.ADMIN),
  authorizeRole(ROLES.SUPER_ADMIN),
  (req, res) => sendSuccess(res, { message: 'Super Admin access granted', data: { user: req.user } })
);
testApp.get(
  '/api/v1/test-protected/products-write',
  authenticate(TOKEN_AUDIENCE.ADMIN),
  requirePermission(PERMISSIONS.PRODUCTS_WRITE),
  (req, res) => sendSuccess(res, { message: 'Product write access granted', data: { user: req.user } })
);
testApp.use(errorMiddleware);

describe('Slice 2: Admin Auth, Middleware & Seed', () => {
  beforeAll(async () => {
    await startTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  describe('Seed Script (admin.seed.js)', () => {
    test('seeds initial SUPER_ADMIN idempotently', async () => {
      const admin1 = await seedSuperAdmin();
      expect(admin1.email).toBe(env.SUPER_ADMIN_EMAIL.toLowerCase().trim());
      expect(admin1.role).toBe(ROLES.SUPER_ADMIN);

      // Running second time should not duplicate or throw error
      const admin2 = await seedSuperAdmin();
      expect(admin2._id.toString()).toBe(admin1._id.toString());

      const count = await AdminUser.countDocuments();
      expect(count).toBe(1);
    });
  });

  describe('Admin Login (POST /api/v1/auth/admin/login)', () => {
    beforeEach(async () => {
      await seedSuperAdmin();
    });

    test('authenticates valid credentials, sets ynr_admin_rt cookie, returns accessToken', async () => {
      const res = await request(app)
        .post('/api/v1/auth/admin/login')
        .send({
          email: env.SUPER_ADMIN_EMAIL,
          password: env.SUPER_ADMIN_PASSWORD,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data.user.email).toBe(env.SUPER_ADMIN_EMAIL.toLowerCase().trim());
      expect(res.body.data.user.role).toBe(ROLES.SUPER_ADMIN);

      // Verify cookie
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const rtCookie = cookies.find(c => c.startsWith('ynr_admin_rt='));
      expect(rtCookie).toBeDefined();
      expect(rtCookie).toContain('HttpOnly');
      expect(rtCookie).toContain('Path=/api/v1/auth/admin');
    });

    test('returns generic 401 when email or password is wrong', async () => {
      const res = await request(app)
        .post('/api/v1/auth/admin/login')
        .send({
          email: env.SUPER_ADMIN_EMAIL,
          password: 'WrongPassword123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid email or password');
    });

    test('locks account after 5 consecutive failed attempts', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/v1/auth/admin/login')
          .send({
            email: env.SUPER_ADMIN_EMAIL,
            password: 'WrongPassword!',
          });
      }

      // 6th attempt should return lockout message
      const res = await request(app)
        .post('/api/v1/auth/admin/login')
        .send({
          email: env.SUPER_ADMIN_EMAIL,
          password: env.SUPER_ADMIN_PASSWORD,
        });

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Account temporarily locked');
    });

    test('rejects deactivated admin from logging in', async () => {
      await AdminUser.updateOne({ email: env.SUPER_ADMIN_EMAIL.toLowerCase().trim() }, { isActive: false });

      const res = await request(app)
        .post('/api/v1/auth/admin/login')
        .send({
          email: env.SUPER_ADMIN_EMAIL,
          password: env.SUPER_ADMIN_PASSWORD,
        });

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Account has been deactivated');
    });
  });

  describe('Refresh Token Rotation & Reuse Detection (POST /api/v1/auth/admin/refresh)', () => {
    beforeEach(async () => {
      await seedSuperAdmin();
    });

    test('rotates refresh token and issues new access token', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/admin/login')
        .send({
          email: env.SUPER_ADMIN_EMAIL,
          password: env.SUPER_ADMIN_PASSWORD,
        });

      const initialCookie = loginRes.headers['set-cookie'];

      const refreshRes = await request(app)
        .post('/api/v1/auth/admin/refresh')
        .set('Cookie', initialCookie);

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.success).toBe(true);
      expect(refreshRes.body.data).toHaveProperty('accessToken');

      const newCookie = refreshRes.headers['set-cookie'];
      expect(newCookie).toBeDefined();
      expect(newCookie).not.toEqual(initialCookie);
    });

    test('grace window: parallel refresh within 10s succeeds', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/admin/login')
        .send({
          email: env.SUPER_ADMIN_EMAIL,
          password: env.SUPER_ADMIN_PASSWORD,
        });

      const initialCookie = loginRes.headers['set-cookie'];

      // First refresh: rotates token
      const refreshRes1 = await request(app)
        .post('/api/v1/auth/admin/refresh')
        .set('Cookie', initialCookie);
      expect(refreshRes1.status).toBe(200);

      // Concurrent second refresh using same old cookie immediately (within 10s grace window)
      const refreshRes2 = await request(app)
        .post('/api/v1/auth/admin/refresh')
        .set('Cookie', initialCookie);

      expect(refreshRes2.status).toBe(200);
      expect(refreshRes2.body.data).toHaveProperty('accessToken');
    });

    test('reuse detection: using rotated token after grace window revokes all sessions in family', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/admin/login')
        .send({
          email: env.SUPER_ADMIN_EMAIL,
          password: env.SUPER_ADMIN_PASSWORD,
        });

      const initialCookie = loginRes.headers['set-cookie'];

      // Rotate token
      await request(app)
        .post('/api/v1/auth/admin/refresh')
        .set('Cookie', initialCookie);

      // Simulate grace window expiration by updating replacedAt to 15 seconds in the past
      await RefreshToken.updateOne(
        { replacedByTokenHash: { $ne: null } },
        { replacedAt: new Date(Date.now() - 15000) }
      );

      // Replay old token outside grace window
      const replayRes = await request(app)
        .post('/api/v1/auth/admin/refresh')
        .set('Cookie', initialCookie);

      expect(replayRes.status).toBe(401);
      expect(replayRes.body.message).toContain('Security alert: Token reuse detected');

      // Verify all tokens in the family are now revoked
      const activeTokensCount = await RefreshToken.countDocuments({ revokedAt: null });
      expect(activeTokensCount).toBe(0);
    });
  });

  describe('Admin Logout (POST /api/v1/auth/admin/logout)', () => {
    beforeEach(async () => {
      await seedSuperAdmin();
    });

    test('clears cookie and revokes refresh token in database', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/admin/login')
        .send({
          email: env.SUPER_ADMIN_EMAIL,
          password: env.SUPER_ADMIN_PASSWORD,
        });

      const cookie = loginRes.headers['set-cookie'];

      const logoutRes = await request(app)
        .post('/api/v1/auth/admin/logout')
        .set('Cookie', cookie);

      expect(logoutRes.status).toBe(200);
      expect(logoutRes.body.success).toBe(true);

      // Verify cookie cleared
      const setCookies = logoutRes.headers['set-cookie'];
      expect(setCookies.some(c => c.includes('ynr_admin_rt=;') || c.includes('Expires='))).toBe(true);

      // Verify token revoked in DB
      const revokedToken = await RefreshToken.findOne({ revokedReason: 'LOGOUT' });
      expect(revokedToken).not.toBeNull();
    });
  });

  describe('Authentication & Authorization Middleware', () => {
    let superAdminToken;
    let staffUser;
    let staffToken;

    beforeEach(async () => {
      const superAdmin = await seedSuperAdmin();
      superAdminToken = jwt.sign({ sub: superAdmin._id.toString() }, env.JWT_ACCESS_SECRET, {
        audience: TOKEN_AUDIENCE.ADMIN,
        expiresIn: '15m',
      });

      const hash = await bcrypt.hash('StaffPassword123!', 12);
      staffUser = await AdminUser.create({
        name: 'Staff Order Manager',
        email: 'staff@younora.com',
        passwordHash: hash,
        role: ROLES.STAFF,
        permissions: [PERMISSIONS.ORDERS_READ, PERMISSIONS.ORDERS_WRITE],
        isActive: true,
      });

      staffToken = jwt.sign({ sub: staffUser._id.toString() }, env.JWT_ACCESS_SECRET, {
        audience: TOKEN_AUDIENCE.ADMIN,
        expiresIn: '15m',
      });
    });

    test('returns 401 when token is missing or malformed', async () => {
      const res = await request(testApp).get('/api/v1/test-protected/super-admin-only');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });

    test('returns 401 when token audience is customer instead of admin', async () => {
      const customerToken = jwt.sign({ sub: '507f1f77bcf86cd799439011' }, env.JWT_ACCESS_SECRET, {
        audience: TOKEN_AUDIENCE.CUSTOMER,
        expiresIn: '15m',
      });

      const res = await request(testApp)
        .get('/api/v1/test-protected/super-admin-only')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(401);
    });

    test('SUPER_ADMIN role bypasses permission checks', async () => {
      // Endpoint requires 'products.write', which Super Admin does not explicitly need listed
      const res = await request(testApp)
        .get('/api/v1/test-protected/products-write')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('staff without required permission gets 403 Forbidden', async () => {
      // staffUser has only orders.read and orders.write, not products.write
      const res = await request(testApp)
        .get('/api/v1/test-protected/products-write')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
      expect(res.body.message).toContain("requires 'products.write' permission");
    });

    test('permission change in DB takes effect immediately without new token', async () => {
      // Grant products.write in DB
      await AdminUser.findByIdAndUpdate(staffUser._id, {
        $push: { permissions: PERMISSIONS.PRODUCTS_WRITE },
      });

      // Same token now succeeds because user permissions are loaded live from DB
      const res = await request(testApp)
        .get('/api/v1/test-protected/products-write')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('deactivating user in DB invalidates active token immediately', async () => {
      await AdminUser.findByIdAndUpdate(staffUser._id, { isActive: false });

      const res = await request(testApp)
        .get('/api/v1/test-protected/products-write')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Account has been deactivated');
    });

    test('changing password invalidates tokens issued prior to the change', async () => {
      // Update passwordChangedAt to current time + 1 second
      await AdminUser.findByIdAndUpdate(staffUser._id, {
        passwordChangedAt: new Date(Date.now() + 1000),
      });

      const res = await request(testApp)
        .get('/api/v1/test-protected/products-write')
        .set('Authorization', `Bearer ${staffToken}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Password was recently changed');
    });
  });
});
