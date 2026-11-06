const request = require('supertest');
const app = require('../../src/app');
const { startTestDb, stopTestDb, clearTestDb } = require('../helpers/testDb');
const Audience = require('../../src/modules/catalog/models/audience.model');
const Category = require('../../src/modules/catalog/models/category.model');
const Subcategory = require('../../src/modules/catalog/models/subcategory.model');
const Product = require('../../src/modules/catalog/models/product.model');
const Variant = require('../../src/modules/catalog/models/variant.model');
const { PRODUCT_STATUS } = require('@younora/shared-constants');

describe('Slice 3: Public Storefront Product APIs', () => {
  let audience;
  let category;
  let subcategory;
  let activeProduct1;
  let activeProduct2;

  beforeAll(async () => {
    await startTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    audience = await Audience.create({ name: 'Women', slug: 'women' });
    category = await Category.create({ audience: audience._id, name: 'Sarees', slug: 'sarees' });
    subcategory = await Subcategory.create({ category: category._id, name: 'Silk Sarees', slug: 'silk-sarees' });

    // 1. Active Product 1
    activeProduct1 = await Product.create({
      name: 'Banarasi Katan Silk Saree',
      slug: 'banarasi-katan-silk-saree',
      description: 'Handwoven pure katan silk',
      audience: audience._id,
      category: category._id,
      subcategory: subcategory._id,
      fabric: 'Silk',
      colors: [
        {
          name: 'Crimson Red',
          hex: '#990000',
          images: [{ url: 'https://img.com/red.jpg', publicId: 'younora/red' }],
        },
      ],
      priceRange: { minSelling: 899900, maxSelling: 899900, minMrp: 1299900, maxMrp: 1299900 },
      totalStock: 5,
      status: PRODUCT_STATUS.ACTIVE,
    });

    await Variant.create({
      product: activeProduct1._id,
      sku: 'YNR-SAREES-BANARASI-RED-FREE',
      color: { name: 'Crimson Red' },
      size: 'FREE',
      mrp: 1299900,
      sellingPrice: 899900,
      costPrice: 450000,
      stock: 5,
      isActive: true,
    });

    // 2. Active Product 2
    activeProduct2 = await Product.create({
      name: 'Chanderi Zari Saree',
      slug: 'chanderi-zari-saree',
      description: 'Lightweight chanderi cotton silk',
      audience: audience._id,
      category: category._id,
      subcategory: subcategory._id,
      fabric: 'Cotton Silk',
      colors: [
        {
          name: 'Gold',
          hex: '#FFD700',
          images: [{ url: 'https://img.com/gold.jpg', publicId: 'younora/gold' }],
        },
      ],
      priceRange: { minSelling: 499900, maxSelling: 499900, minMrp: 699900, maxMrp: 699900 },
      totalStock: 8,
      status: PRODUCT_STATUS.ACTIVE,
    });

    await Variant.create({
      product: activeProduct2._id,
      sku: 'YNR-SAREES-CHANDERI-GOLD-FREE',
      color: { name: 'Gold' },
      size: 'FREE',
      mrp: 699900,
      sellingPrice: 499900,
      costPrice: 250000,
      stock: 8,
      isActive: true,
    });

    // 3. Draft Product (should NOT be visible)
    await Product.create({
      name: 'Unfinished Saree Draft',
      slug: 'unfinished-saree-draft',
      description: 'Draft product in progress',
      audience: audience._id,
      category: category._id,
      subcategory: subcategory._id,
      colors: [{ name: 'Blue', images: [{ url: 'http://img.com', publicId: 'p' }] }],
      status: PRODUCT_STATUS.DRAFT,
    });

    // 4. Hidden Product (should NOT be visible)
    await Product.create({
      name: 'Seasonal Saree Hidden',
      slug: 'seasonal-saree-hidden',
      description: 'Hidden product out of season',
      audience: audience._id,
      category: category._id,
      subcategory: subcategory._id,
      colors: [{ name: 'Green', images: [{ url: 'http://img.com', publicId: 'p' }] }],
      status: PRODUCT_STATUS.HIDDEN,
    });
  });

  describe('GET /api/v1/store/products (Public Catalog)', () => {
    it('returns only active, non-deleted products with pagination', async () => {
      const res = await request(app).get('/api/v1/store/products');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(2);
      expect(res.body.meta.total).toBe(2);

      // Verify draft and hidden are excluded
      const slugs = res.body.data.map((p) => p.slug);
      expect(slugs).toContain('banarasi-katan-silk-saree');
      expect(slugs).toContain('chanderi-zari-saree');
      expect(slugs).not.toContain('unfinished-saree-draft');
      expect(slugs).not.toContain('seasonal-saree-hidden');
    });

    it('filters by category slug', async () => {
      const res = await request(app).get('/api/v1/store/products?category=sarees');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
    });

    it('filters by price range (minPrice / maxPrice)', async () => {
      const res = await request(app).get('/api/v1/store/products?maxPrice=500000'); // <= ₹5000

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].slug).toBe('chanderi-zari-saree');
    });

    it('sorts by price_asc and price_desc', async () => {
      const resAsc = await request(app).get('/api/v1/store/products?sort=price_asc');
      expect(resAsc.status).toBe(200);
      expect(resAsc.body.data[0].slug).toBe('chanderi-zari-saree'); // ₹4999 before ₹8999

      const resDesc = await request(app).get('/api/v1/store/products?sort=price_desc');
      expect(resDesc.status).toBe(200);
      expect(resDesc.body.data[0].slug).toBe('banarasi-katan-silk-saree'); // ₹8999 before ₹4999
    });
  });

  describe('GET /api/v1/store/products/:slug (Public Detail)', () => {
    it('returns product details with active variants and strictly excludes costPrice', async () => {
      const res = await request(app).get('/api/v1/store/products/banarasi-katan-silk-saree');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const product = res.body.data;
      expect(product.name).toBe('Banarasi Katan Silk Saree');
      expect(product.audience.name).toBe('Women');
      expect(product.category.name).toBe('Sarees');
      expect(product.variants.length).toBe(1);

      // Verify costPrice is completely stripped
      expect(product.variants[0].sellingPrice).toBe(899900);
      expect(product.variants[0].mrp).toBe(1299900);
      expect(product.variants[0].costPrice).toBeUndefined();
    });

    it('returns 404 for draft or hidden products', async () => {
      const draftRes = await request(app).get('/api/v1/store/products/unfinished-saree-draft');
      expect(draftRes.status).toBe(404);

      const hiddenRes = await request(app).get('/api/v1/store/products/seasonal-saree-hidden');
      expect(hiddenRes.status).toBe(404);
    });
  });

  describe('GET /api/v1/store/products/:slug/similar (Recommendations)', () => {
    it('returns similar active products in the same category excluding the current product', async () => {
      const res = await request(app).get('/api/v1/store/products/banarasi-katan-silk-saree/similar');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].slug).toBe('chanderi-zari-saree');
    });
  });
});

