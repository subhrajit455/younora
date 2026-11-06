const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = require('../../src/app');
const { env } = require('../../src/config/env');
const { startTestDb, stopTestDb, clearTestDb } = require('../helpers/testDb');
const AdminUser = require('../../src/modules/users/models/adminUser.model');
const Audience = require('../../src/modules/catalog/models/audience.model');
const Category = require('../../src/modules/catalog/models/category.model');
const Subcategory = require('../../src/modules/catalog/models/subcategory.model');
const { ROLES, TOKEN_AUDIENCE, PERMISSIONS } = require('@younora/shared-constants');

describe('Slice 2: Taxonomy CRUD & Public Storefront Menu API', () => {
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

    // Authorized Staff (has categories.manage)
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

    // Unauthorized Staff (no categories.manage)
    const unauthStaff = await AdminUser.create({
      name: 'Orders Staff',
      email: 'orders@younora.com',
      passwordHash,
      role: ROLES.STAFF,
      permissions: [PERMISSIONS.ORDERS_READ],
      isActive: true,
    });
    unauthorizedStaffToken = jwt.sign(
      { sub: unauthStaff._id.toString(), role: unauthStaff.role },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m', audience: TOKEN_AUDIENCE.ADMIN }
    );
  });

  describe('Audience Management (/api/v1/admin/audiences)', () => {
    it('creates an audience with auto-generated slug', async () => {
      const res = await request(app)
        .post('/api/v1/admin/audiences')
        .set('Authorization', `Bearer ${authorizedStaffToken}`)
        .send({
          name: 'Men Luxury',
          sortOrder: 1,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Men Luxury');
      expect(res.body.data.slug).toBe('men-luxury');
      expect(res.body.data.isActive).toBe(true);
    });

    it('rejects duplicate audience slug with 409 Conflict', async () => {
      await Audience.create({ name: 'Women', slug: 'women' });

      const res = await request(app)
        .post('/api/v1/admin/audiences')
        .set('Authorization', `Bearer ${authorizedStaffToken}`)
        .send({
          name: 'Women',
          slug: 'women',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });

    it('lists audiences with pagination', async () => {
      await Audience.create([
        { name: 'Men', slug: 'men', sortOrder: 1 },
        { name: 'Women', slug: 'women', sortOrder: 2 },
      ]);

      const res = await request(app)
        .get('/api/v1/admin/audiences')
        .set('Authorization', `Bearer ${authorizedStaffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.meta.total).toBe(2);
    });

    it('updates audience name and generates new unique slug', async () => {
      const aud = await Audience.create({ name: 'Kids', slug: 'kids' });

      const res = await request(app)
        .patch(`/api/v1/admin/audiences/${aud._id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ name: 'Junior Boys' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Junior Boys');
      expect(res.body.data.slug).toBe('junior-boys');
    });

    it('soft deletes audience when no active categories exist', async () => {
      const aud = await Audience.create({ name: 'Accessories', slug: 'accessories' });

      const res = await request(app)
        .delete(`/api/v1/admin/audiences/${aud._id}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);

      const deleted = await Audience.findById(aud._id);
      expect(deleted.isDeleted).toBe(true);
      expect(deleted.deletedAt).toBeDefined();
    });

    it('blocks soft deletion of audience if it contains active categories', async () => {
      const aud = await Audience.create({ name: 'Men', slug: 'men' });
      await Category.create({ audience: aud._id, name: 'Shirts', slug: 'shirts' });

      const res = await request(app)
        .delete(`/api/v1/admin/audiences/${aud._id}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('active categories');
    });

    it('reorders audiences', async () => {
      const aud1 = await Audience.create({ name: 'Men', slug: 'men', sortOrder: 5 });
      const aud2 = await Audience.create({ name: 'Women', slug: 'women', sortOrder: 10 });

      const res = await request(app)
        .patch('/api/v1/admin/audiences/reorder')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          items: [
            { id: aud1._id.toString(), sortOrder: 1 },
            { id: aud2._id.toString(), sortOrder: 2 },
          ],
        });

      expect(res.status).toBe(200);

      const updated1 = await Audience.findById(aud1._id);
      expect(updated1.sortOrder).toBe(1);
    });
  });

  describe('Category Management (/api/v1/admin/categories)', () => {
    it('creates category linked to audience', async () => {
      const aud = await Audience.create({ name: 'Men', slug: 'men' });

      const res = await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${authorizedStaffToken}`)
        .send({
          audience: aud._id.toString(),
          name: 'Ethnic Wear',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Ethnic Wear');
      expect(res.body.data.slug).toBe('ethnic-wear');
    });

    it('blocks soft deletion of category if it contains active subcategories', async () => {
      const aud = await Audience.create({ name: 'Men', slug: 'men' });
      const cat = await Category.create({ audience: aud._id, name: 'Ethnic Wear', slug: 'ethnic-wear' });
      await Subcategory.create({ category: cat._id, name: 'Kurta', slug: 'kurta' });

      const res = await request(app)
        .delete(`/api/v1/admin/categories/${cat._id}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('active subcategories');
    });
  });

  describe('Subcategory Management (/api/v1/admin/subcategories)', () => {
    it('creates subcategory linked to category and soft deletes it', async () => {
      const aud = await Audience.create({ name: 'Women', slug: 'women' });
      const cat = await Category.create({ audience: aud._id, name: 'Western', slug: 'western' });

      const res = await request(app)
        .post('/api/v1/admin/subcategories')
        .set('Authorization', `Bearer ${authorizedStaffToken}`)
        .send({
          category: cat._id.toString(),
          name: 'Dresses',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Dresses');
      expect(res.body.data.slug).toBe('dresses');

      const subId = res.body.data._id;

      const delRes = await request(app)
        .delete(`/api/v1/admin/subcategories/${subId}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(delRes.status).toBe(200);

      const deleted = await Subcategory.findById(subId);
      expect(deleted.isDeleted).toBe(true);
    });
  });

  describe('Public Storefront Menu Tree (GET /api/v1/store/menu)', () => {
    it('returns complete nested hierarchy of active non-deleted taxonomy', async () => {
      const men = await Audience.create({ name: 'Men', slug: 'men', sortOrder: 1 });
      const women = await Audience.create({ name: 'Women', slug: 'women', sortOrder: 2 });
      await Audience.create({ name: 'Archived', slug: 'archived', isDeleted: true });
      await Audience.create({ name: 'Inactive', slug: 'inactive', isActive: false });

      const menTopwear = await Category.create({
        audience: men._id,
        name: 'Topwear',
        slug: 'topwear',
        sortOrder: 1,
      });
      const womenDresses = await Category.create({
        audience: women._id,
        name: 'Dresses',
        slug: 'dresses',
        sortOrder: 1,
      });

      await Subcategory.create({
        category: menTopwear._id,
        name: 'Shirts',
        slug: 'shirts',
        sortOrder: 1,
      });
      await Subcategory.create({
        category: menTopwear._id,
        name: 'T-Shirts',
        slug: 't-shirts',
        sortOrder: 2,
      });
      await Subcategory.create({
        category: womenDresses._id,
        name: 'Evening Gowns',
        slug: 'evening-gowns',
        sortOrder: 1,
      });

      const res = await request(app).get('/api/v1/store/menu');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(2); // Men & Women only

      const menMenu = res.body.data.find((item) => item.slug === 'men');
      expect(menMenu).toBeDefined();
      expect(menMenu.categories.length).toBe(1);
      expect(menMenu.categories[0].slug).toBe('topwear');
      expect(menMenu.categories[0].subcategories.length).toBe(2);
      expect(menMenu.categories[0].subcategories[0].slug).toBe('shirts');
    });
  });

  describe('Authorization Guards', () => {
    it('returns 401 when token is missing', async () => {
      const res = await request(app).get('/api/v1/admin/audiences');
      expect(res.status).toBe(401);
    });

    it('returns 403 when staff lacks categories.manage permission', async () => {
      const res = await request(app)
        .post('/api/v1/admin/audiences')
        .set('Authorization', `Bearer ${unauthorizedStaffToken}`)
        .send({ name: 'Unauthorized' });

      expect(res.status).toBe(403);
    });
  });
});
