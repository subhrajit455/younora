const request = require('supertest');
const app = require('../../src/app');
const { startTestDb, stopTestDb, clearTestDb } = require('../helpers/testDb');
const Audience = require('../../src/modules/catalog/models/audience.model');
const Category = require('../../src/modules/catalog/models/category.model');
const Subcategory = require('../../src/modules/catalog/models/subcategory.model');
const SizeChart = require('../../src/modules/catalog/models/sizeChart.model');
const Product = require('../../src/modules/catalog/models/product.model');
const Variant = require('../../src/modules/catalog/models/variant.model');
const { PRODUCT_STATUS } = require('@younora/shared-constants');

describe('Slices 1 & 2: Storefront Listing, Facets, Search & Detail', () => {
  let audienceMen;
  let audienceWomen;
  let categorySherwanis;
  let categoryLehengas;
  let subSherwanis;
  let subLehengas;
  let sizeChart;
  let prodSherwani;
  let prodLehenga;

  beforeAll(async () => {
    await startTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    audienceMen = await Audience.create({ name: 'Men', slug: 'men', isActive: true });
    audienceWomen = await Audience.create({ name: 'Women', slug: 'women', isActive: true });

    categorySherwanis = await Category.create({
      audience: audienceMen._id,
      name: 'Sherwanis',
      slug: 'men-sherwanis',
      isActive: true,
    });
    categoryLehengas = await Category.create({
      audience: audienceWomen._id,
      name: 'Lehengas',
      slug: 'women-lehengas',
      isActive: true,
    });

    subSherwanis = await Subcategory.create({
      category: categorySherwanis._id,
      name: 'Royal Sherwanis',
      slug: 'royal-sherwanis',
      isActive: true,
    });
    subLehengas = await Subcategory.create({
      category: categoryLehengas._id,
      name: 'Bridal Lehengas',
      slug: 'bridal-lehengas',
      isActive: true,
    });

    sizeChart = await SizeChart.create({
      name: 'Men Ethnic Size Guide',
      unit: 'INCH',
      columns: ['Size', 'Chest', 'Shoulder', 'Length'],
      rows: [
        { size: '38', values: { Chest: '40', Shoulder: '17.5', Length: '42' } },
        { size: '40', values: { Chest: '42', Shoulder: '18.0', Length: '43' } },
      ],
    });

    // 1. Men Sherwani (Raw Silk, Festive, 38/40, Ivory/Navy)
    prodSherwani = await Product.create({
      name: 'Royal Raw Silk Sherwani',
      slug: 'royal-raw-silk-sherwani',
      description: 'Regal raw silk sherwani with antique gold zardozi',
      audience: audienceMen._id,
      category: categorySherwanis._id,
      subcategory: subSherwanis._id,
      fabric: 'Raw Silk',
      occasion: 'Festive & Celebration',
      fit: 'Tailored Fit',
      pattern: 'Hand Embroidered',
      sizeChart: sizeChart._id,
      tags: ['sherwani', 'royal', 'wedding'],
      colors: [
        {
          name: 'Royal Ivory',
          hex: '#FFFFF0',
          images: [{ url: 'https://img.com/ivory.jpg', publicId: 'younora/ivory' }],
        },
        {
          name: 'Navy Blue',
          hex: '#000080',
          images: [{ url: 'https://img.com/navy.jpg', publicId: 'younora/navy' }],
        },
      ],
      priceRange: { minSelling: 3999900, maxSelling: 4499900, minMrp: 4999900, maxMrp: 5499900 },
      totalStock: 15,
      isFeatured: true,
      status: PRODUCT_STATUS.ACTIVE,
    });

    await Variant.create([
      {
        product: prodSherwani._id,
        sku: 'YNR-SHERWANI-IVORY-38',
        color: { name: 'Royal Ivory', hex: '#FFFFF0' },
        size: '38',
        mrp: 4999900,
        sellingPrice: 3999900,
        costPrice: 1800000,
        stock: 5,
        isActive: true,
      },
      {
        product: prodSherwani._id,
        sku: 'YNR-SHERWANI-IVORY-40',
        color: { name: 'Royal Ivory', hex: '#FFFFF0' },
        size: '40',
        mrp: 4999900,
        sellingPrice: 3999900,
        costPrice: 1800000,
        stock: 10,
        isActive: true,
      },
      {
        product: prodSherwani._id,
        sku: 'YNR-SHERWANI-NAVY-38',
        color: { name: 'Navy Blue', hex: '#000080' },
        size: '38',
        mrp: 5499900,
        sellingPrice: 4499900,
        costPrice: 2000000,
        stock: 0, // OUT OF STOCK
        isActive: true,
      },
    ]);

    // 2. Women Lehenga (Mulberry Silk, Wedding, S/M, Crimson Red)
    prodLehenga = await Product.create({
      name: 'Florentine Silk Bridal Lehenga',
      slug: 'florentine-silk-bridal-lehenga',
      description: 'Opulent silk bridal lehenga with heavy zardozi embroidery',
      audience: audienceWomen._id,
      category: categoryLehengas._id,
      subcategory: subLehengas._id,
      fabric: 'Mulberry Silk',
      occasion: 'Wedding & Bridal',
      fit: 'Relaxed Fit',
      pattern: 'Zari Brocade',
      tags: ['lehenga', 'bridal', 'crimson'],
      colors: [
        {
          name: 'Crimson Red',
          hex: '#990000',
          images: [{ url: 'https://img.com/crimson.jpg', publicId: 'younora/crimson' }],
        },
      ],
      priceRange: { minSelling: 7499900, maxSelling: 7499900, minMrp: 8999900, maxMrp: 8999900 },
      totalStock: 7,
      isBestSeller: true,
      status: PRODUCT_STATUS.ACTIVE,
    });

    await Variant.create([
      {
        product: prodLehenga._id,
        sku: 'YNR-LEHENGA-RED-S',
        color: { name: 'Crimson Red', hex: '#990000' },
        size: 'S',
        mrp: 8999900,
        sellingPrice: 7499900,
        costPrice: 3200000,
        stock: 3,
        isActive: true,
      },
      {
        product: prodLehenga._id,
        sku: 'YNR-LEHENGA-RED-M',
        color: { name: 'Crimson Red', hex: '#990000' },
        size: 'M',
        mrp: 8999900,
        sellingPrice: 7499900,
        costPrice: 3200000,
        stock: 4,
        isActive: true,
      },
    ]);
  });

  describe('Multi-Facet Query Filtering & ETag HTTP Caching', () => {
    it('filters by multiple sizes, fabrics, and inStockOnly', async () => {
      // Filter by size=38 (should find Sherwani)
      const resSize = await request(app).get('/api/v1/store/products?size=38');
      expect(resSize.status).toBe(200);
      expect(resSize.body.data).toHaveLength(1);
      expect(resSize.body.data[0].slug).toBe('royal-raw-silk-sherwani');

      // Filter by fabric=Mulberry Silk
      const resFabric = await request(app).get('/api/v1/store/products?fabric=Mulberry%20Silk');
      expect(resFabric.status).toBe(200);
      expect(resFabric.body.data).toHaveLength(1);
      expect(resFabric.body.data[0].slug).toBe('florentine-silk-bridal-lehenga');

      // Filter by color=Navy Blue AND inStockOnly=true (Navy Blue 38 has stock: 0, so should return 0)
      const resOut = await request(app).get('/api/v1/store/products?color=Navy%20Blue&inStockOnly=true');
      expect(resOut.status).toBe(200);
      expect(resOut.body.data).toHaveLength(0);

      // Filter by color=Navy Blue without inStockOnly (should return 1)
      const resWithOut = await request(app).get('/api/v1/store/products?color=Navy%20Blue');
      expect(resWithOut.status).toBe(200);
      expect(resWithOut.body.data).toHaveLength(1);
    });

    it('generates ETag header and responds with 304 Not Modified when If-None-Match matches', async () => {
      const initialRes = await request(app).get('/api/v1/store/products');
      expect(initialRes.status).toBe(200);
      expect(initialRes.headers.etag).toBeDefined();

      const etag = initialRes.headers.etag;

      // Second request with If-None-Match
      const cachedRes = await request(app)
        .get('/api/v1/store/products')
        .set('If-None-Match', etag);

      expect(cachedRes.status).toBe(304);
      expect(cachedRes.text).toBe('');
    });
  });

  describe('Dynamic Filters Aggregation (GET /api/v1/store/filters)', () => {
    it('aggregates available sizes, colors, fabrics, occasions, and price bounds', async () => {
      const res = await request(app).get('/api/v1/store/filters?audience=men');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const filters = res.body.data;
      expect(filters.sizes).toContain('38');
      expect(filters.sizes).toContain('40');
      expect(filters.sizes).not.toContain('S'); // S is from women lehenga

      expect(filters.fabrics).toContain('Raw Silk');
      expect(filters.fabrics).not.toContain('Mulberry Silk');

      const colorNames = filters.colors.map((c) => c.name);
      expect(colorNames).toContain('Royal Ivory');
      expect(colorNames).toContain('Navy Blue');

      expect(filters.priceRange.min).toBe(3999900);
      expect(filters.priceRange.max).toBe(4499900);
    });
  });

  describe('Full-Text Search & Autocomplete Suggestions', () => {
    it('performs search and returns matching active products (GET /api/v1/store/search?q=)', async () => {
      const res = await request(app).get('/api/v1/store/search?q=zardozi');
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      const resTag = await request(app).get('/api/v1/store/search?q=bridal');
      expect(resTag.status).toBe(200);
      expect(resTag.body.data).toHaveLength(1);
      expect(resTag.body.data[0].slug).toBe('florentine-silk-bridal-lehenga');
    });

    it('returns prefix suggestions for products and categories (GET /api/v1/store/search/suggest?q=)', async () => {
      const res = await request(app).get('/api/v1/store/search/suggest?q=Roy');
      expect(res.status).toBe(200);
      expect(res.body.data.products).toHaveLength(1);
      expect(res.body.data.products[0].name).toBe('Royal Raw Silk Sherwani');
    });
  });

  describe('Product Detail with Breadcrumbs, Size Chart & Color Variants', () => {
    it('returns full product detail, attached sizeChart, grouped colorVariants, and breadcrumbs path', async () => {
      const res = await request(app).get('/api/v1/store/products/royal-raw-silk-sherwani');

      expect(res.status).toBe(200);
      const prod = res.body.data;

      expect(prod.name).toBe('Royal Raw Silk Sherwani');
      expect(prod.sizeChart).toBeDefined();
      expect(prod.sizeChart.name).toBe('Men Ethnic Size Guide');

      // Verify breadcrumbs
      expect(prod.breadcrumbs).toHaveLength(5);
      expect(prod.breadcrumbs[0].label).toBe('Home');
      expect(prod.breadcrumbs[1].label).toBe('Men');
      expect(prod.breadcrumbs[2].label).toBe('Sherwanis');
      expect(prod.breadcrumbs[3].label).toBe('Royal Sherwanis');
      expect(prod.breadcrumbs[4].label).toBe('Royal Raw Silk Sherwani');

      // Verify colorVariants grouping
      expect(prod.colorVariants).toHaveLength(2);
      const ivoryGroup = prod.colorVariants.find((cv) => cv.color.name === 'Royal Ivory');
      expect(ivoryGroup.sizes).toHaveLength(2); // 38 and 40
      expect(ivoryGroup.sizes[0].inStock).toBe(true);

      const navyGroup = prod.colorVariants.find((cv) => cv.color.name === 'Navy Blue');
      expect(navyGroup.sizes[0].inStock).toBe(false); // Navy 38 has stock: 0

      // Strictly verify costPrice is never exposed
      const jsonStr = JSON.stringify(prod);
      expect(jsonStr).not.toContain('costPrice');
      expect(jsonStr).not.toContain('1800000');
    });
  });
});
