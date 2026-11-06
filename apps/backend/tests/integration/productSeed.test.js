const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Product = require('../../src/modules/catalog/models/product.model');
const Variant = require('../../src/modules/catalog/models/variant.model');
const { seedProducts } = require('../../src/seed/products.seed');
const { PRODUCT_STATUS } = require('@younora/shared-constants');

describe('Slice 5: Demo Products Seed & Gate Verification', () => {
  let mongod;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });

  it('successfully seeds 10 realistic luxury products with matrices across Men, Women, Kids', async () => {
    const res = await seedProducts();

    expect(res.seededProducts).toBe(10);
    expect(res.skippedProducts).toBe(0);
    expect(res.totalVariants).toBeGreaterThan(20);

    // Verify in database
    const products = await Product.find({ isDeleted: false })
      .populate('audience')
      .populate('category')
      .populate('subcategory');

    expect(products.length).toBe(10);

    // Verify audience distribution
    const audienceNames = new Set(products.map((p) => p.audience.name));
    expect(audienceNames.has('Men')).toBe(true);
    expect(audienceNames.has('Women')).toBe(true);
    expect(audienceNames.has('Kids')).toBe(true);

    // Verify all products have status ACTIVE and resellingEnabled
    for (const prod of products) {
      expect(prod.status).toBe(PRODUCT_STATUS.ACTIVE);
      expect(prod.resellingEnabled).toBe(true);
      expect(prod.totalStock).toBeGreaterThan(0);
      expect(prod.priceRange.minSelling).toBeGreaterThan(0);
      expect(prod.priceRange.maxSelling).toBeGreaterThanOrEqual(prod.priceRange.minSelling);
      expect(prod.colors.length).toBeGreaterThanOrEqual(1);
      expect(prod.colors[0].images.length).toBeGreaterThanOrEqual(1);

      // Verify associated variants
      const variants = await Variant.find({ product: prod._id, isActive: true });
      expect(variants.length).toBeGreaterThanOrEqual(1);

      for (const v of variants) {
        expect(v.sellingPrice).toBeLessThanOrEqual(v.mrp);
        expect(v.costPrice).toBeGreaterThan(0);
        expect(v.sku).toMatch(/^YNR-[A-Z0-9-]+-[A-Z0-9-]+-[A-Z0-9-]+-[A-Z0-9-]+$/);
      }
    }
  });

  it('is idempotent: running seedProducts again skips existing products and creates no duplicates', async () => {
    const res = await seedProducts();

    expect(res.seededProducts).toBe(0);
    expect(res.skippedProducts).toBe(10);

    const totalProducts = await Product.countDocuments({ isDeleted: false });
    expect(totalProducts).toBe(10);
  });
});
