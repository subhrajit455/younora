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
const Product = require('../../src/modules/catalog/models/product.model');
const Variant = require('../../src/modules/catalog/models/variant.model');
const { ROLES, TOKEN_AUDIENCE, PERMISSIONS, PRODUCT_STATUS } = require('@younora/shared-constants');

describe('Slice 2: Atomic Product & Variant Matrix Management', () => {
  let superAdminToken;
  let fullCatalogStaffToken;
  let noCostStaffToken;
  let readOnlyStaffToken;
  let audienceId;
  let categoryId;
  let subcategoryId;

  beforeAll(async () => {
    await startTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    const passwordHash = await bcrypt.hash('Admin@12345', 10);

    // Super Admin (has all permissions including inventory.view-cost)
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

    // Full Catalog Staff (products.read, products.write, inventory.view-cost)
    const fullStaff = await AdminUser.create({
      name: 'Catalog Manager',
      email: 'catmgr@younora.com',
      passwordHash,
      role: ROLES.STAFF,
      permissions: [
        PERMISSIONS.PRODUCTS_READ,
        PERMISSIONS.PRODUCTS_WRITE,
        PERMISSIONS.INVENTORY_VIEW_COST,
      ],
      isActive: true,
    });
    fullCatalogStaffToken = jwt.sign(
      { sub: fullStaff._id.toString(), role: fullStaff.role },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m', audience: TOKEN_AUDIENCE.ADMIN }
    );

    // Catalog Staff without cost viewing permission
    const noCostStaff = await AdminUser.create({
      name: 'Catalog Writer',
      email: 'nocost@younora.com',
      passwordHash,
      role: ROLES.STAFF,
      permissions: [PERMISSIONS.PRODUCTS_READ, PERMISSIONS.PRODUCTS_WRITE],
      isActive: true,
    });
    noCostStaffToken = jwt.sign(
      { sub: noCostStaff._id.toString(), role: noCostStaff.role },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m', audience: TOKEN_AUDIENCE.ADMIN }
    );

    // Read Only Staff
    const readStaff = await AdminUser.create({
      name: 'Catalog Viewer',
      email: 'viewer@younora.com',
      passwordHash,
      role: ROLES.STAFF,
      permissions: [PERMISSIONS.PRODUCTS_READ],
      isActive: true,
    });
    readOnlyStaffToken = jwt.sign(
      { sub: readStaff._id.toString(), role: readStaff.role },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m', audience: TOKEN_AUDIENCE.ADMIN }
    );

    // Seed Taxonomy
    const aud = await Audience.create({ name: 'Men', slug: 'men' });
    const cat = await Category.create({ audience: aud._id, name: 'Shirts', slug: 'shirts' });
    const sub = await Subcategory.create({ category: cat._id, name: 'Casual Shirts', slug: 'casual-shirts' });

    audienceId = aud._id.toString();
    categoryId = cat._id.toString();
    subcategoryId = sub._id.toString();
  });

  describe('Atomic Product + Variant Matrix Creation (POST /api/v1/admin/products)', () => {
    it('creates product and variant matrix atomically, computing priceRange and totalStock', async () => {
      const payload = {
        name: 'Royal Silk Oxford Shirt',
        description: 'Exquisite 100% pure silk oxford casual shirt',
        highlights: ['100% Pure Silk', 'Mother of Pearl Buttons', 'Tailored Cut'],
        audience: audienceId,
        category: categoryId,
        subcategory: subcategoryId,
        colors: [
          {
            name: 'Navy Blue',
            hex: '#000080',
            images: [
              {
                url: 'https://res.cloudinary.com/demo/image/upload/v1/navy_front.jpg',
                publicId: 'younora/products/navy_front',
              },
            ],
          },
          {
            name: 'Royal White',
            hex: '#FFFFFF',
            images: [
              {
                url: 'https://res.cloudinary.com/demo/image/upload/v1/white_front.jpg',
                publicId: 'younora/products/white_front',
              },
            ],
          },
        ],
        variants: [
          {
            color: { name: 'Navy Blue', hex: '#000080' },
            size: 'M',
            mrp: 499900, // ₹4999
            sellingPrice: 399900, // ₹3999
            costPrice: 150000, // ₹1500
            stock: 10,
          },
          {
            color: { name: 'Navy Blue', hex: '#000080' },
            size: 'L',
            mrp: 499900,
            sellingPrice: 399900,
            costPrice: 150000,
            stock: 15,
          },
          {
            color: { name: 'Royal White', hex: '#FFFFFF' },
            size: 'M',
            mrp: 549900,
            sellingPrice: 449900,
            costPrice: 170000,
            stock: 8,
          },
        ],
      };

      const res = await request(app)
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${fullCatalogStaffToken}`)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const created = res.body.data;
      expect(created.name).toBe('Royal Silk Oxford Shirt');
      expect(created.slug).toBe('royal-silk-oxford-shirt');
      expect(created.totalStock).toBe(33); // 10 + 15 + 8
      expect(created.priceRange.minSelling).toBe(399900);
      expect(created.priceRange.maxSelling).toBe(449900);
      expect(created.priceRange.minMrp).toBe(499900);
      expect(created.priceRange.maxMrp).toBe(549900);
      expect(created.variants.length).toBe(3);
      expect(created.variants[0].sku).toContain('YNR-SHIRTS-');
    });

    it('rejects creation when variant sellingPrice > mrp', async () => {
      const payload = {
        name: 'Invalid Price Shirt',
        description: 'Testing validation',
        audience: audienceId,
        category: categoryId,
        subcategory: subcategoryId,
        colors: [
          {
            name: 'Black',
            images: [{ url: 'https://img.com/b.jpg', publicId: 'younora/b' }],
          },
        ],
        variants: [
          {
            color: { name: 'Black' },
            size: 'M',
            mrp: 200000,
            sellingPrice: 250000, // Exceeds MRP!
            costPrice: 100000,
            stock: 5,
          },
        ],
      };

      const res = await request(app)
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${fullCatalogStaffToken}`)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.errors[0].message).toContain('Selling price cannot exceed MRP');
    });

    it('rejects creation with duplicate variant combinations', async () => {
      const payload = {
        name: 'Duplicate Combo Shirt',
        description: 'Testing duplicate color and size',
        audience: audienceId,
        category: categoryId,
        subcategory: subcategoryId,
        colors: [
          {
            name: 'Black',
            images: [{ url: 'https://img.com/b.jpg', publicId: 'younora/b' }],
          },
        ],
        variants: [
          {
            color: { name: 'Black' },
            size: 'M',
            mrp: 200000,
            sellingPrice: 150000,
            costPrice: 100000,
            stock: 5,
          },
          {
            color: { name: 'Black' },
            size: 'M', // Same size and color!
            mrp: 200000,
            sellingPrice: 150000,
            costPrice: 100000,
            stock: 10,
          },
        ],
      };

      const res = await request(app)
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${fullCatalogStaffToken}`)
        .send(payload);

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('Duplicate variant combination');
    });

    it('rejects variant if its color is not in product colors list', async () => {
      const payload = {
        name: 'Mismatched Color Shirt',
        description: 'Testing color mismatch',
        audience: audienceId,
        category: categoryId,
        subcategory: subcategoryId,
        colors: [
          {
            name: 'Red',
            images: [{ url: 'https://img.com/r.jpg', publicId: 'younora/r' }],
          },
        ],
        variants: [
          {
            color: { name: 'Blue' }, // Blue not in colors array!
            size: 'M',
            mrp: 200000,
            sellingPrice: 150000,
            costPrice: 100000,
            stock: 5,
          },
        ],
      };

      const res = await request(app)
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${fullCatalogStaffToken}`)
        .send(payload);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('does not match any color');
    });
  });

  describe('Product Updates & Matrix Diffing (PATCH /api/v1/admin/products/:id)', () => {
    it('updates product and replaces variant matrix, recalculating totalStock', async () => {
      const product = await Product.create({
        name: 'Linen Casual Shirt',
        slug: 'linen-casual-shirt',
        description: 'Fine pure linen',
        audience: audienceId,
        category: categoryId,
        subcategory: subcategoryId,
        colors: [
          {
            name: 'Beige',
            images: [{ url: 'https://img.com/beige.jpg', publicId: 'younora/beige' }],
          },
        ],
        priceRange: { minSelling: 100000, maxSelling: 100000, minMrp: 120000, maxMrp: 120000 },
        totalStock: 5,
      });

      await Variant.create({
        product: product._id,
        sku: 'YNR-SHIRTS-LINEN-BEIGE-M',
        color: { name: 'Beige' },
        size: 'M',
        mrp: 120000,
        sellingPrice: 100000,
        costPrice: 50000,
        stock: 5,
      });

      const res = await request(app)
        .patch(`/api/v1/admin/products/${product._id}`)
        .set('Authorization', `Bearer ${fullCatalogStaffToken}`)
        .send({
          name: 'Pure Organic Linen Casual Shirt',
          variants: [
            {
              color: { name: 'Beige' },
              size: 'M',
              mrp: 140000,
              sellingPrice: 110000,
              costPrice: 55000,
              stock: 8,
            },
            {
              color: { name: 'Beige' },
              size: 'L',
              mrp: 140000,
              sellingPrice: 110000,
              costPrice: 55000,
              stock: 12,
            },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Pure Organic Linen Casual Shirt');
      expect(res.body.data.totalStock).toBe(20); // 8 + 12
      expect(res.body.data.priceRange.minSelling).toBe(110000);
      expect(res.body.data.variants.length).toBe(2);
    });
  });

  describe('Status Workflow, Duplication & Deletion', () => {
    it('updates status to ACTIVE and HIDDEN', async () => {
      const product = await Product.create({
        name: 'Status Test Shirt',
        slug: 'status-test-shirt',
        description: 'Testing status transitions',
        audience: audienceId,
        category: categoryId,
        subcategory: subcategoryId,
        colors: [{ name: 'Blue', images: [{ url: 'http://img.com', publicId: 'p' }] }],
        status: PRODUCT_STATUS.DRAFT,
      });

      const resActive = await request(app)
        .patch(`/api/v1/admin/products/${product._id}/status`)
        .set('Authorization', `Bearer ${fullCatalogStaffToken}`)
        .send({ status: PRODUCT_STATUS.ACTIVE });

      expect(resActive.status).toBe(200);
      expect(resActive.body.data.status).toBe('ACTIVE');

      const resHidden = await request(app)
        .patch(`/api/v1/admin/products/${product._id}/status`)
        .set('Authorization', `Bearer ${fullCatalogStaffToken}`)
        .send({ status: PRODUCT_STATUS.HIDDEN });

      expect(resHidden.status).toBe(200);
      expect(resHidden.body.data.status).toBe('HIDDEN');
    });

    it('duplicates product as DRAFT with new unique slug and SKUs', async () => {
      const product = await Product.create({
        name: 'Summer Silk Shirt',
        slug: 'summer-silk-shirt',
        description: 'Lightweight summer silk',
        audience: audienceId,
        category: categoryId,
        subcategory: subcategoryId,
        colors: [{ name: 'Coral', images: [{ url: 'http://img.com', publicId: 'p' }] }],
        status: PRODUCT_STATUS.ACTIVE,
      });

      await Variant.create({
        product: product._id,
        sku: 'YNR-SHIRTS-SUMMER-CORAL-M',
        color: { name: 'Coral' },
        size: 'M',
        mrp: 300000,
        sellingPrice: 200000,
        costPrice: 100000,
        stock: 10,
      });

      const res = await request(app)
        .post(`/api/v1/admin/products/${product._id}/duplicate`)
        .set('Authorization', `Bearer ${fullCatalogStaffToken}`);

      expect(res.status).toBe(201);
      expect(res.body.data.name).toContain('(Copy)');
      expect(res.body.data.status).toBe('DRAFT');
      expect(res.body.data.slug).toContain('copy');
      expect(res.body.data.variants[0].sku).toContain('-CPY-');
    });

    it('soft deletes product and deactivates its variants', async () => {
      const product = await Product.create({
        name: 'Delete Test Shirt',
        slug: 'delete-test-shirt',
        description: 'To be deleted',
        audience: audienceId,
        category: categoryId,
        subcategory: subcategoryId,
        colors: [{ name: 'Grey', images: [{ url: 'http://img.com', publicId: 'p' }] }],
      });

      const variant = await Variant.create({
        product: product._id,
        sku: 'YNR-SHIRTS-DELETE-GREY-M',
        color: { name: 'Grey' },
        size: 'M',
        mrp: 200000,
        sellingPrice: 150000,
        costPrice: 80000,
        stock: 5,
        isActive: true,
      });

      const res = await request(app)
        .delete(`/api/v1/admin/products/${product._id}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);

      const checkProduct = await Product.findById(product._id);
      expect(checkProduct.isDeleted).toBe(true);

      const checkVariant = await Variant.findById(variant._id);
      expect(checkVariant.isActive).toBe(false);
    });
  });

  describe('Cost Price Redaction & Permissions', () => {
    let testProductId;

    beforeEach(async () => {
      const product = await Product.create({
        name: 'Cost Test Shirt',
        slug: 'cost-test-shirt',
        description: 'Testing cost price visibility',
        audience: audienceId,
        category: categoryId,
        subcategory: subcategoryId,
        colors: [{ name: 'Navy', images: [{ url: 'http://img.com', publicId: 'p' }] }],
      });

      await Variant.create({
        product: product._id,
        sku: 'YNR-SHIRTS-COST-NAVY-M',
        color: { name: 'Navy' },
        size: 'M',
        mrp: 300000,
        sellingPrice: 200000,
        costPrice: 95000, // ₹950.00
        stock: 10,
      });

      testProductId = product._id.toString();
    });

    it('exposes costPrice to Super Admin and staff with inventory.view-cost', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/products/${testProductId}`)
        .set('Authorization', `Bearer ${fullCatalogStaffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.variants[0].costPrice).toBe(95000);
    });

    it('redacts costPrice when staff lacks inventory.view-cost permission', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/products/${testProductId}`)
        .set('Authorization', `Bearer ${noCostStaffToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.variants[0].costPrice).toBeUndefined();
    });

    it('rejects staff without products.write from modifying products with 403', async () => {
      const res = await request(app)
        .delete(`/api/v1/admin/products/${testProductId}`)
        .set('Authorization', `Bearer ${readOnlyStaffToken}`);

      expect(res.status).toBe(403);
    });
  });
});
