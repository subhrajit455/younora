const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = require('../../src/app');
const { env } = require('../../src/config/env');
const { startTestDb, stopTestDb, clearTestDb } = require('../helpers/testDb');
const AdminUser = require('../../src/modules/users/models/adminUser.model');
const Category = require('../../src/modules/catalog/models/category.model');
const Audience = require('../../src/modules/catalog/models/audience.model');
const Attribute = require('../../src/modules/catalog/models/attribute.model');
const SizeChart = require('../../src/modules/catalog/models/sizeChart.model');
const { ROLES, TOKEN_AUDIENCE, PERMISSIONS, ATTRIBUTE_TYPE, SIZE_CHART_UNIT } = require('@younora/shared-constants');

describe('Slice 3: Attributes & Size Charts Modules', () => {
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
      name: 'Basic Staff',
      email: 'basic@younora.com',
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

  describe('Attributes CRUD (/api/v1/admin/attributes)', () => {
    it('creates attribute with valid type and value', async () => {
      const res = await request(app)
        .post('/api/v1/admin/attributes')
        .set('Authorization', `Bearer ${authorizedStaffToken}`)
        .send({
          type: ATTRIBUTE_TYPE.COLOR,
          name: 'Navy Blue',
          value: '#000080',
          sortOrder: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Navy Blue');
      expect(res.body.data.type).toBe('COLOR');
      expect(res.body.data.value).toBe('#000080');
    });

    it('rejects duplicate attribute name under same type', async () => {
      await Attribute.create({
        type: ATTRIBUTE_TYPE.FABRIC,
        name: 'Pure Silk',
      });

      const res = await request(app)
        .post('/api/v1/admin/attributes')
        .set('Authorization', `Bearer ${authorizedStaffToken}`)
        .send({
          type: ATTRIBUTE_TYPE.FABRIC,
          name: 'Pure Silk',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('allows same name under different attribute types', async () => {
      await Attribute.create({
        type: ATTRIBUTE_TYPE.PATTERN,
        name: 'Classic',
      });

      const res = await request(app)
        .post('/api/v1/admin/attributes')
        .set('Authorization', `Bearer ${authorizedStaffToken}`)
        .send({
          type: ATTRIBUTE_TYPE.FIT,
          name: 'Classic',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Classic');
      expect(res.body.data.type).toBe('FIT');
    });

    it('lists attributes filtered by type', async () => {
      await Attribute.create([
        { type: ATTRIBUTE_TYPE.COLOR, name: 'Red', value: '#FF0000' },
        { type: ATTRIBUTE_TYPE.COLOR, name: 'Green', value: '#00FF00' },
        { type: ATTRIBUTE_TYPE.FABRIC, name: 'Linen' },
      ]);

      const res = await request(app)
        .get('/api/v1/admin/attributes?type=COLOR')
        .set('Authorization', `Bearer ${authorizedStaffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.data.every((attr) => attr.type === 'COLOR')).toBe(true);
    });

    it('updates and deletes attribute', async () => {
      const attr = await Attribute.create({
        type: ATTRIBUTE_TYPE.OCCASION,
        name: 'Festive',
      });

      const updateRes = await request(app)
        .patch(`/api/v1/admin/attributes/${attr._id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ name: 'Festive & Wedding', sortOrder: 5 });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.name).toBe('Festive & Wedding');

      const delRes = await request(app)
        .delete(`/api/v1/admin/attributes/${attr._id}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(delRes.status).toBe(200);

      const found = await Attribute.findById(attr._id);
      expect(found).toBeNull();
    });
  });

  describe('Size Charts CRUD (/api/v1/admin/size-charts)', () => {
    it('creates size chart with valid unit, columns and rows', async () => {
      const res = await request(app)
        .post('/api/v1/admin/size-charts')
        .set('Authorization', `Bearer ${authorizedStaffToken}`)
        .send({
          name: 'Men Slim Fit Shirts',
          unit: SIZE_CHART_UNIT.INCH,
          columns: ['Brand Size', 'Chest', 'Shoulder', 'Length'],
          rows: [
            { size: 'M', values: { Chest: 40, Shoulder: 17.5, Length: 29 } },
            { size: 'L', values: { Chest: 42, Shoulder: 18.5, Length: 30 } },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Men Slim Fit Shirts');
      expect(res.body.data.columns).toEqual(['Brand Size', 'Chest', 'Shoulder', 'Length']);
      expect(res.body.data.rows.length).toBe(2);
    });

    it('rejects size chart with empty columns array', async () => {
      const res = await request(app)
        .post('/api/v1/admin/size-charts')
        .set('Authorization', `Bearer ${authorizedStaffToken}`)
        .send({
          name: 'Invalid Chart',
          unit: 'INCH',
          columns: [],
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('soft deletes size chart and unlinks from categories defaultSizeChart', async () => {
      const aud = await Audience.create({ name: 'Men', slug: 'men' });
      const chart = await SizeChart.create({
        name: 'Men T-Shirts Size Chart',
        columns: ['Chest', 'Length'],
        rows: [{ size: 'S', values: { Chest: 38, Length: 27 } }],
      });
      const cat = await Category.create({
        audience: aud._id,
        name: 'T-Shirts',
        slug: 't-shirts',
        defaultSizeChart: chart._id,
      });

      const delRes = await request(app)
        .delete(`/api/v1/admin/size-charts/${chart._id}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(delRes.status).toBe(200);

      const deletedChart = await SizeChart.findById(chart._id);
      expect(deletedChart.isDeleted).toBe(true);

      const updatedCat = await Category.findById(cat._id);
      expect(updatedCat.defaultSizeChart).toBeNull();
    });

    it('public endpoint GET /api/v1/store/size-charts/:id retrieves size chart without auth', async () => {
      const chart = await SizeChart.create({
        name: 'Public Size Chart',
        columns: ['Bust', 'Waist'],
        rows: [{ size: 'Free', values: { Bust: 36, Waist: 30 } }],
      });

      const res = await request(app).get(`/api/v1/store/size-charts/${chart._id}`);

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Public Size Chart');
    });
  });

  describe('Authorization Guards', () => {
    it('returns 403 when staff lacks categories.manage permission', async () => {
      const res = await request(app)
        .post('/api/v1/admin/attributes')
        .set('Authorization', `Bearer ${unauthorizedStaffToken}`)
        .send({ type: 'COLOR', name: 'Yellow' });

      expect(res.status).toBe(403);
    });
  });
});

