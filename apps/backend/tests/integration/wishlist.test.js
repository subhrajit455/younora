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
const Wishlist = require('../../src/modules/wishlist/models/wishlist.model');
const { TOKEN_AUDIENCE, PRODUCT_STATUS } = require('@younora/shared-constants');

describe('Slice 3: Customer Wishlist Module', () => {
  let customer1;
  let customer2;
  let customerToken1;
  let customerToken2;
  let activeProduct1;
  let activeProduct2;
  let draftProduct;

  beforeAll(async () => {
    await startTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    const passwordHash = await bcrypt.hash('Cust@123456', 10);

    customer1 = await Customer.create({
      name: 'Aanya Sharma',
      email: 'aanya@example.com',
      passwordHash,
      isActive: true,
      isEmailVerified: true,
    });
    customerToken1 = jwt.sign(
      { sub: customer1._id.toString(), role: 'CUSTOMER' },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m', audience: TOKEN_AUDIENCE.CUSTOMER }
    );

    customer2 = await Customer.create({
      name: 'Rohan Mehra',
      email: 'rohan@example.com',
      passwordHash,
      isActive: true,
      isEmailVerified: true,
    });
    customerToken2 = jwt.sign(
      { sub: customer2._id.toString(), role: 'CUSTOMER' },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m', audience: TOKEN_AUDIENCE.CUSTOMER }
    );

    const audience = await Audience.create({ name: 'Women', slug: 'women', isActive: true });
    const category = await Category.create({ audience: audience._id, name: 'Sarees', slug: 'sarees', isActive: true });
    const subcategory = await Subcategory.create({ category: category._id, name: 'Silk', slug: 'silk', isActive: true });

    activeProduct1 = await Product.create({
      name: 'Pure Katan Silk Saree',
      slug: 'pure-katan-silk-saree',
      description: 'Handcrafted banarasi saree',
      audience: audience._id,
      category: category._id,
      subcategory: subcategory._id,
      status: PRODUCT_STATUS.ACTIVE,
      colors: [{ name: 'Crimson', images: [{ url: 'https://img.com/c.jpg', publicId: 'p1' }] }],
      priceRange: { minSelling: 2999900, maxSelling: 2999900, minMrp: 3999900, maxMrp: 3999900 },
      totalStock: 5,
    });

    activeProduct2 = await Product.create({
      name: 'Organza Tissue Floral Saree',
      slug: 'organza-tissue-floral-saree',
      description: 'Handpainted floral saree',
      audience: audience._id,
      category: category._id,
      subcategory: subcategory._id,
      status: PRODUCT_STATUS.ACTIVE,
      colors: [{ name: 'Blush', images: [{ url: 'https://img.com/b.jpg', publicId: 'p2' }] }],
      priceRange: { minSelling: 1999900, maxSelling: 1999900, minMrp: 2499900, maxMrp: 2499900 },
      totalStock: 3,
    });

    draftProduct = await Product.create({
      name: 'Draft Saree Sample',
      slug: 'draft-saree-sample',
      description: 'Not yet available',
      audience: audience._id,
      category: category._id,
      subcategory: subcategory._id,
      status: PRODUCT_STATUS.DRAFT,
      colors: [{ name: 'Grey', images: [{ url: 'https://img.com/g.jpg', publicId: 'p3' }] }],
      priceRange: { minSelling: 100000, maxSelling: 100000, minMrp: 100000, maxMrp: 100000 },
      totalStock: 0,
    });
  });

  describe('Authentication & Access Control', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const res = await request(app).get('/api/v1/wishlist');
      expect(res.status).toBe(401);
    });

    it('rejects admin tokens with 401 when accessing customer wishlist', async () => {
      const adminToken = jwt.sign(
        { sub: 'someAdminId', role: 'SUPER_ADMIN' },
        env.JWT_ACCESS_SECRET,
        { expiresIn: '15m', audience: TOKEN_AUDIENCE.ADMIN }
      );
      const res = await request(app)
        .get('/api/v1/wishlist')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(401);
    });
  });

  describe('Wishlist CRUD Operations & Idempotency', () => {
    it('adds product to wishlist, supports check status, and ensures idempotency', async () => {
      // 1. Add activeProduct1
      const addRes = await request(app)
        .post(`/api/v1/wishlist/${activeProduct1._id}`)
        .set('Authorization', `Bearer ${customerToken1}`);

      expect(addRes.status).toBe(201);
      expect(addRes.body.success).toBe(true);

      // 2. Adding the same product again is idempotent (does not duplicate or throw)
      const duplicateRes = await request(app)
        .post(`/api/v1/wishlist/${activeProduct1._id}`)
        .set('Authorization', `Bearer ${customerToken1}`);

      expect(duplicateRes.status).toBe(201);

      const count = await Wishlist.countDocuments({
        customer: customer1._id,
        product: activeProduct1._id,
      });
      expect(count).toBe(1);

      // 3. Check in wishlist status
      const checkRes = await request(app)
        .get(`/api/v1/wishlist/check/${activeProduct1._id}`)
        .set('Authorization', `Bearer ${customerToken1}`);
      expect(checkRes.status).toBe(200);
      expect(checkRes.body.data.inWishlist).toBe(true);

      const checkNotRes = await request(app)
        .get(`/api/v1/wishlist/check/${activeProduct2._id}`)
        .set('Authorization', `Bearer ${customerToken1}`);
      expect(checkNotRes.status).toBe(200);
      expect(checkNotRes.body.data.inWishlist).toBe(false);
    });

    it('retrieves customer wishlist populated with product cards, isolating users', async () => {
      // Customer 1 adds both products
      await request(app)
        .post(`/api/v1/wishlist/${activeProduct1._id}`)
        .set('Authorization', `Bearer ${customerToken1}`);
      await request(app)
        .post(`/api/v1/wishlist/${activeProduct2._id}`)
        .set('Authorization', `Bearer ${customerToken1}`);

      // Customer 2 adds only product 2
      await request(app)
        .post(`/api/v1/wishlist/${activeProduct2._id}`)
        .set('Authorization', `Bearer ${customerToken2}`);

      // Customer 1 gets 2 items
      const res1 = await request(app)
        .get('/api/v1/wishlist')
        .set('Authorization', `Bearer ${customerToken1}`);
      expect(res1.status).toBe(200);
      expect(res1.body.data).toHaveLength(2);
      expect(res1.body.data[0].product.name).toBeDefined();
      expect(res1.body.data[0].product.priceRange.minSelling).toBeGreaterThan(0);

      // Customer 2 gets 1 item
      const res2 = await request(app)
        .get('/api/v1/wishlist')
        .set('Authorization', `Bearer ${customerToken2}`);
      expect(res2.status).toBe(200);
      expect(res2.body.data).toHaveLength(1);
      expect(res2.body.data[0].product.slug).toBe('organza-tissue-floral-saree');
    });

    it('rejects adding draft or non-existent products with 404', async () => {
      const resDraft = await request(app)
        .post(`/api/v1/wishlist/${draftProduct._id}`)
        .set('Authorization', `Bearer ${customerToken1}`);
      expect(resDraft.status).toBe(404);

      const nonExistentId = '666666666666666666666666';
      const resMissing = await request(app)
        .post(`/api/v1/wishlist/${nonExistentId}`)
        .set('Authorization', `Bearer ${customerToken1}`);
      expect(resMissing.status).toBe(404);
    });

    it('removes product from customer wishlist', async () => {
      await request(app)
        .post(`/api/v1/wishlist/${activeProduct1._id}`)
        .set('Authorization', `Bearer ${customerToken1}`);

      const deleteRes = await request(app)
        .delete(`/api/v1/wishlist/${activeProduct1._id}`)
        .set('Authorization', `Bearer ${customerToken1}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.data.removed).toBe(true);

      const listRes = await request(app)
        .get('/api/v1/wishlist')
        .set('Authorization', `Bearer ${customerToken1}`);
      expect(listRes.body.data).toHaveLength(0);
    });
  });
});

