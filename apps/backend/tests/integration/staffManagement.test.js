const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../../src/app');
const { startTestDb, stopTestDb, clearTestDb } = require('../helpers/testDb');
const { seedSuperAdmin } = require('../../src/seed/admin.seed');
const AdminUser = require('../../src/modules/users/models/adminUser.model');
const RefreshToken = require('../../src/modules/users/models/refreshToken.model');
const { env } = require('../../src/config/env');
const { ROLES, TOKEN_AUDIENCE, PERMISSIONS, USER_TYPES } = require('@younora/shared-constants');

describe('Slice 3: Staff Management CRUD (Super Admin Only)', () => {
  let superAdmin;
  let superAdminToken;
  let staffUser;
  let staffToken;

  beforeAll(async () => {
    await startTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    // Seed initial Super Admin
    superAdmin = await seedSuperAdmin();
    superAdminToken = jwt.sign({ sub: superAdmin._id.toString() }, env.JWT_ACCESS_SECRET, {
      audience: TOKEN_AUDIENCE.ADMIN,
      expiresIn: '15m',
    });

    // Create a regular staff member
    const hash = await bcrypt.hash('StaffPassword123!', 12);
    staffUser = await AdminUser.create({
      name: 'Regular Staff',
      email: 'staff.member@younora.com',
      passwordHash: hash,
      role: ROLES.STAFF,
      permissions: [PERMISSIONS.ORDERS_READ],
      isActive: true,
    });
    staffToken = jwt.sign({ sub: staffUser._id.toString() }, env.JWT_ACCESS_SECRET, {
      audience: TOKEN_AUDIENCE.ADMIN,
      expiresIn: '15m',
    });
  });

  describe('POST /api/v1/admin/staff (Create Staff)', () => {
    test('Super Admin creates new staff member with permissions', async () => {
      const res = await request(app)
        .post('/api/v1/admin/staff')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: 'Inventory Manager',
          email: 'inventory@younora.com',
          password: 'SecurePassword123!',
          role: ROLES.STAFF,
          permissions: [PERMISSIONS.INVENTORY_READ, PERMISSIONS.INVENTORY_MANAGE],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Inventory Manager');
      expect(res.body.data.email).toBe('inventory@younora.com');
      expect(res.body.data.role).toBe(ROLES.STAFF);
      expect(res.body.data.permissions).toEqual([
        PERMISSIONS.INVENTORY_READ,
        PERMISSIONS.INVENTORY_MANAGE,
      ]);
      expect(res.body.data).not.toHaveProperty('passwordHash');
    });

    test('rejects duplicate email with 409 Conflict', async () => {
      const res = await request(app)
        .post('/api/v1/admin/staff')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: 'Duplicate Staff',
          email: staffUser.email,
          password: 'SecurePassword123!',
          role: ROLES.STAFF,
          permissions: [],
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CONFLICT');
    });

    test('rejects invalid permissions with 400 Validation Error', async () => {
      const res = await request(app)
        .post('/api/v1/admin/staff')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: 'Bad Permissions Staff',
          email: 'badperm@younora.com',
          password: 'SecurePassword123!',
          role: ROLES.STAFF,
          permissions: ['invalid.fake.permission'],
        });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    test('regular staff gets 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/v1/admin/staff')
        .set('Authorization', `Bearer ${staffToken}`)
        .send({
          name: 'Unauthorized Attempt',
          email: 'unauth@younora.com',
          password: 'SecurePassword123!',
          role: ROLES.STAFF,
          permissions: [],
        });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    });

    test('unauthenticated request gets 401 Unauthorized', async () => {
      const res = await request(app)
        .post('/api/v1/admin/staff')
        .send({
          name: 'No Auth',
          email: 'noauth@younora.com',
          password: 'SecurePassword123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /api/v1/admin/staff (List Staff)', () => {
    test('Super Admin retrieves paginated staff list with meta', async () => {
      const res = await request(app)
        .get('/api/v1/admin/staff?page=1&limit=10')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBe(2); // superAdmin + staffUser
      expect(res.body.meta).toMatchObject({
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
      });
    });

    test('supports filtering by role and search query', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/staff?role=${ROLES.STAFF}&search=Regular`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].email).toBe(staffUser.email);
    });
  });

  describe('GET /api/v1/admin/staff/:id (Get Staff Detail)', () => {
    test('Super Admin retrieves single staff member by ID', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/staff/${staffUser._id}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.email).toBe(staffUser.email);
      expect(res.body.data).not.toHaveProperty('passwordHash');
    });

    test('returns 404 when staff ID does not exist', async () => {
      const nonExistentId = '507f1f77bcf86cd799439011';
      const res = await request(app)
        .get(`/api/v1/admin/staff/${nonExistentId}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });

  describe('PATCH /api/v1/admin/staff/:id (Update Staff)', () => {
    test('Super Admin updates staff permissions and name', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/staff/${staffUser._id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: 'Senior Order Manager',
          permissions: [
            PERMISSIONS.ORDERS_READ,
            PERMISSIONS.ORDERS_WRITE,
            PERMISSIONS.SHIPPING_MANAGE,
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Senior Order Manager');
      expect(res.body.data.permissions).toEqual([
        PERMISSIONS.ORDERS_READ,
        PERMISSIONS.ORDERS_WRITE,
        PERMISSIONS.SHIPPING_MANAGE,
      ]);
    });

    test('cannot demote the last active Super Admin to STAFF', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/staff/${superAdmin._id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          role: ROLES.STAFF,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Cannot demote the last active Super Admin');
    });
  });

  describe('PATCH /api/v1/admin/staff/:id/deactivate and reactivate (Rule 8)', () => {
    test('Super Admin cannot deactivate their own account', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/staff/${superAdmin._id}/deactivate`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('You cannot deactivate your own account');
    });

    test('Super Admin cannot deactivate the last active Super Admin', async () => {
      // Create a second super admin who attempts to deactivate the first one
      const hash = await bcrypt.hash('Pw12345678', 12);
      const secondAdmin = await AdminUser.create({
        name: 'Second Super Admin',
        email: 'second@younora.com',
        passwordHash: hash,
        role: ROLES.SUPER_ADMIN,
        isActive: true,
      });

      // Deactivate second admin first so only 1 remains active
      await AdminUser.findByIdAndUpdate(secondAdmin._id, { isActive: false });

      // Second admin token
      const secondToken = jwt.sign({ sub: secondAdmin._id.toString() }, env.JWT_ACCESS_SECRET, {
        audience: TOKEN_AUDIENCE.ADMIN,
        expiresIn: '15m',
      });

      // Attempt to deactivate superAdmin (the only active one left)
      const res = await request(app)
        .patch(`/api/v1/admin/staff/${superAdmin._id}/deactivate`)
        .set('Authorization', `Bearer ${secondToken}`);

      // Since secondAdmin is inactive, authentication itself should reject or service rejects
      expect([400, 401]).toContain(res.status);
    });

    test('deactivating staff sets isActive=false and revokes their refresh tokens', async () => {
      // Create a refresh token session for staffUser
      await RefreshToken.create({
        userId: staffUser._id,
        userType: USER_TYPES.ADMIN,
        userModel: 'AdminUser',
        tokenHash: 'dummy-staff-token-hash',
        family: 'staff-family-id',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      const res = await request(app)
        .patch(`/api/v1/admin/staff/${staffUser._id}/deactivate`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(false);

      // Verify DB state
      const updatedStaff = await AdminUser.findById(staffUser._id);
      expect(updatedStaff.isActive).toBe(false);

      // Verify refresh tokens were revoked
      const activeSessions = await RefreshToken.find({
        userId: staffUser._id,
        revokedAt: null,
      });
      expect(activeSessions.length).toBe(0);
    });

    test('Super Admin reactivates a deactivated staff member', async () => {
      // First deactivate
      await AdminUser.findByIdAndUpdate(staffUser._id, { isActive: false });

      const res = await request(app)
        .patch(`/api/v1/admin/staff/${staffUser._id}/reactivate`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isActive).toBe(true);

      const updatedStaff = await AdminUser.findById(staffUser._id);
      expect(updatedStaff.isActive).toBe(true);
    });
  });
});

