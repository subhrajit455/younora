const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = require('../../src/app');
const { env } = require('../../src/config/env');
const { startTestDb, stopTestDb, clearTestDb } = require('../helpers/testDb');
const AdminUser = require('../../src/modules/users/models/adminUser.model');
const { ROLES, TOKEN_AUDIENCE, PERMISSIONS } = require('@younora/shared-constants');

describe('Slice 4: Media Upload Service & Endpoints', () => {
  let superAdminToken;
  let authorizedStaffToken;
  let unauthorizedStaffToken;
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

    // Super Admin
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

    // Authorized Staff (categories.manage)
    const authStaff = await AdminUser.create({
      name: 'Catalog Manager',
      email: 'catalogmgr@younora.com',
      passwordHash,
      role: ROLES.STAFF,
      permissions: [PERMISSIONS.CATEGORIES_MANAGE],
      isActive: true,
    });
    authorizedStaffToken = jwt.sign(
      { sub: authStaff._id.toString(), role: authStaff.role },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m', audience: TOKEN_AUDIENCE.ADMIN }
    );

    // Unauthorized Staff
    const unauthStaff = await AdminUser.create({
      name: 'Support Staff',
      email: 'support@younora.com',
      passwordHash,
      role: ROLES.STAFF,
      permissions: [],
      isActive: true,
    });
    unauthorizedStaffToken = jwt.sign(
      { sub: unauthStaff._id.toString(), role: unauthStaff.role },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m', audience: TOKEN_AUDIENCE.ADMIN }
    );
  });

  describe('POST /api/v1/admin/uploads (Image Upload)', () => {
    it('uploads valid image file and returns url and publicId', async () => {
      // Small 1x1 dummy PNG buffer
      const pngBuffer = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      );

      const res = await request(app)
        .post('/api/v1/admin/uploads')
        .set('Authorization', `Bearer ${authorizedStaffToken}`)
        .field('folder', 'categories')
        .attach('file', pngBuffer, 'test-image.png');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.url).toBeDefined();
      expect(res.body.data.publicId).toBeDefined();
      expect(res.body.data.publicId).toContain('younora/categories');
    });

    it('rejects upload when no file is attached', async () => {
      const res = await request(app)
        .post('/api/v1/admin/uploads')
        .set('Authorization', `Bearer ${authorizedStaffToken}`)
        .field('folder', 'categories');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Image file is required');
    });

    it('rejects disallowed file types (e.g. text/plain or executable)', async () => {
      const textBuffer = Buffer.from('console.log("hello world");');

      const res = await request(app)
        .post('/api/v1/admin/uploads')
        .set('Authorization', `Bearer ${authorizedStaffToken}`)
        .attach('file', textBuffer, 'script.js');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid file type');
    });

    it('rejects files exceeding size limit (> 5MB)', async () => {
      // Create a 5.5MB dummy buffer
      const largeBuffer = Buffer.alloc(5.5 * 1024 * 1024);

      const res = await request(app)
        .post('/api/v1/admin/uploads')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .attach('file', largeBuffer, 'huge.jpg');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('File size exceeds');
    });
  });

  describe('DELETE /api/v1/admin/uploads/:publicId (Delete Image)', () => {
    it('deletes image by publicId including nested folder path', async () => {
      const publicId = 'younora/categories/test_1700000000';

      const res = await request(app)
        .delete(`/api/v1/admin/uploads/${publicId}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.result).toBe('ok');
    });
  });

  describe('Authorization Guards', () => {
    it('returns 401 when token is missing', async () => {
      const res = await request(app).post('/api/v1/admin/uploads');
      expect(res.status).toBe(401);
    });

    it('returns 403 when staff lacks categories.manage permission', async () => {
      const res = await request(app)
        .delete('/api/v1/admin/uploads/younora/test')
        .set('Authorization', `Bearer ${unauthorizedStaffToken}`);

      expect(res.status).toBe(403);
    });
  });
});

