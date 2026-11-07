const request = require('supertest');
const app = require('../../src/app');
const { startTestDb, stopTestDb, clearTestDb } = require('../helpers/testDb');
const Banner = require('../../src/modules/cms/models/banner.model');
const CmsPage = require('../../src/modules/cms/models/cmsPage.model');
const Enquiry = require('../../src/modules/cms/models/enquiry.model');
const Audience = require('../../src/modules/catalog/models/audience.model');
const Category = require('../../src/modules/catalog/models/category.model');
const Subcategory = require('../../src/modules/catalog/models/subcategory.model');
const Product = require('../../src/modules/catalog/models/product.model');
const { PRODUCT_STATUS } = require('@younora/shared-constants');

describe('Slice 4: Storefront CMS, Home Aggregator, Banners, Pincode & Enquiry', () => {
  beforeAll(async () => {
    await startTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    // 1. Seed Banners
    await Banner.create([
      {
        title: 'Royal Bridal Festive Collection 2026',
        subtitle: 'Handcrafted opulence from Varanasi and Jaipur',
        link: '/catalog/women/lehengas',
        position: 'HERO_MAIN',
        sortOrder: 1,
        image: {
          desktop: { url: 'https://img.com/hero1-desktop.jpg' },
          mobile: { url: 'https://img.com/hero1-mobile.jpg' },
        },
        isActive: true,
      },
      {
        title: 'Expired Promotional Banner',
        link: '/expired',
        position: 'HERO_MAIN',
        sortOrder: 2,
        image: { desktop: { url: 'https://img.com/expired.jpg' } },
        endsAt: new Date(Date.now() - 100000), // Expired
        isActive: true,
      },
      {
        title: 'Inactive Banner',
        link: '/inactive',
        position: 'HERO_MAIN',
        sortOrder: 3,
        image: { desktop: { url: 'https://img.com/inactive.jpg' } },
        isActive: false, // Inactive
      },
    ]);

    // 2. Seed CMS Pages
    await CmsPage.create([
      {
        slug: 'return-policy',
        title: 'Younora Concierge Return & Exchange Policy',
        content: '<p>All handcrafted garments can be returned within 7 days by contacting our luxury concierge team.</p>',
        isActive: true,
      },
      {
        slug: 'about-us',
        title: 'The Younora Heritage Story',
        content: '<p>Celebrating India’s finest generational handloom artisans.</p>',
        isActive: true,
      },
    ]);

    // 3. Seed Products with flags
    const audience = await Audience.create({ name: 'Women', slug: 'women', isActive: true });
    const category = await Category.create({ audience: audience._id, name: 'Sarees', slug: 'sarees', isActive: true });
    const subcategory = await Subcategory.create({ category: category._id, name: 'Silk', slug: 'silk', isActive: true });

    await Product.create({
      name: 'Featured Royal Saree',
      slug: 'featured-royal-saree',
      description: 'Handwoven silk',
      audience: audience._id,
      category: category._id,
      subcategory: subcategory._id,
      status: PRODUCT_STATUS.ACTIVE,
      isFeatured: true,
      isNewArrival: true,
      isBestSeller: true,
      colors: [{ name: 'Gold', images: [{ url: 'https://img.com/gold.jpg', publicId: 'p1' }] }],
      priceRange: { minSelling: 5000000, maxSelling: 5000000, minMrp: 6000000, maxMrp: 6000000 },
      totalStock: 10,
    });
  });

  describe('Curated Homepage Payload (GET /api/v1/store/home)', () => {
    it('returns active hero banners, featured products, new arrivals, best sellers, and categories', async () => {
      const res = await request(app).get('/api/v1/store/home');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const home = res.body.data;
      expect(home.banners).toHaveLength(1); // Expired & inactive excluded
      expect(home.banners[0].title).toBe('Royal Bridal Festive Collection 2026');

      expect(home.featured).toHaveLength(1);
      expect(home.newArrivals).toHaveLength(1);
      expect(home.bestSellers).toHaveLength(1);
      expect(home.categories).toHaveLength(1);
    });
  });

  describe('Banners Endpoint (GET /api/v1/store/banners)', () => {
    it('returns only active, non-expired banners ordered by sortOrder', async () => {
      const res = await request(app).get('/api/v1/store/banners?position=HERO_MAIN');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].title).toBe('Royal Bridal Festive Collection 2026');
    });
  });

  describe('CMS Static Pages (GET /api/v1/store/pages/:slug)', () => {
    it('returns page content for active slug and 404 for missing page', async () => {
      const res = await request(app).get('/api/v1/store/pages/return-policy');
      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Younora Concierge Return & Exchange Policy');
      expect(res.body.data.content).toContain('7 days');

      const missingRes = await request(app).get('/api/v1/store/pages/non-existent-page');
      expect(missingRes.status).toBe(404);
    });
  });

  describe('Pincode Serviceability Check (GET /api/v1/store/pincode/:pin)', () => {
    it('validates 6-digit Indian PIN and returns serviceability estimates', async () => {
      const validRes = await request(app).get('/api/v1/store/pincode/110001'); // Delhi (North)
      expect(validRes.status).toBe(200);
      expect(validRes.body.data.serviceable).toBe(true);
      expect(validRes.body.data.codAvailable).toBe(true);
      expect(validRes.body.data.estimatedDeliveryDays).toBe(3);

      const invalidRes = await request(app).get('/api/v1/store/pincode/1234'); // Invalid PIN
      expect(invalidRes.status).toBe(400);

      const alphaRes = await request(app).get('/api/v1/store/pincode/11000A');
      expect(alphaRes.status).toBe(400);
    });
  });

  describe('Public Contact Enquiry (POST /api/v1/store/enquiry)', () => {
    it('validates form fields and records customer enquiry in database', async () => {
      const validPayload = {
        name: 'Pooja Verma',
        email: 'pooja@example.com',
        phone: '9876543210',
        subject: 'Custom Bridal Fitting Enquiry',
        message: 'I would like to schedule a virtual concierge bridal consultation for December.',
      };

      const res = await request(app).post('/api/v1/store/enquiry').send(validPayload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();

      const saved = await Enquiry.findById(res.body.data.id);
      expect(saved.name).toBe('Pooja Verma');
      expect(saved.status).toBe('NEW');

      // Invalid submission (missing message or bad email)
      const badRes = await request(app).post('/api/v1/store/enquiry').send({
        name: 'Test',
        email: 'invalid-email',
      });
      expect(badRes.status).toBe(400);
    });
  });
});

