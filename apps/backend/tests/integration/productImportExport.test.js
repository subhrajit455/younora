const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const xlsx = require('xlsx');

const app = require('../../src/app');
const { env } = require('../../src/config/env');
const { startTestDb, stopTestDb, clearTestDb } = require('../helpers/testDb');
const AdminUser = require('../../src/modules/users/models/adminUser.model');
const Audience = require('../../src/modules/catalog/models/audience.model');
const Category = require('../../src/modules/catalog/models/category.model');
const Subcategory = require('../../src/modules/catalog/models/subcategory.model');
const Product = require('../../src/modules/catalog/models/product.model');
const Variant = require('../../src/modules/catalog/models/variant.model');
const { ROLES, TOKEN_AUDIENCE, PERMISSIONS } = require('@younora/shared-constants');

describe('Slice 4: Bulk Excel/CSV Import & Export Engine', () => {
  let superAdminToken;
  let noCostStaffToken;
  let audience;
  let category;
  let subcategory;

  beforeAll(async () => {
    await startTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();

    const passwordHash = await bcrypt.hash('Admin@12345', 10);

    const superAdmin = await AdminUser.create({
      name: 'Super Admin',
      email: 'admin@younora.com',
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

    const noCostStaff = await AdminUser.create({
      name: 'Staff No Cost',
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

    audience = await Audience.create({ name: 'Men', slug: 'men' });
    category = await Category.create({ audience: audience._id, name: 'Kurtas', slug: 'kurtas' });
    subcategory = await Subcategory.create({ category: category._id, name: 'Short Kurtas', slug: 'short-kurtas' });
  });

  function createTestWorkbook(rows) {
    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Products');
    return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  const binaryParser = (res, callback) => {
    res.setEncoding('binary');
    res.data = '';
    res.on('data', (chunk) => {
      res.data += chunk;
    });
    res.on('end', () => {
      callback(null, Buffer.from(res.data, 'binary'));
    });
  };

  describe('GET /api/v1/admin/products/import/template', () => {
    it('returns downloadable Excel template buffer', async () => {
      const res = await request(app)
        .get('/api/v1/admin/products/import/template')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml.sheet');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.body).toBeDefined();
    });
  });

  describe('POST /api/v1/admin/products/import (Bulk Import)', () => {
    it('dryRun=true detects invalid rows and returns detailed error reports without writing to DB', async () => {
      const badRows = [
        {
          Audience: 'NonExistentAudience', // Invalid
          Category: 'Kurtas',
          Subcategory: 'Short Kurtas',
          'Product Name': 'Defective Kurta',
          'Color Name': 'White',
          Size: 'M',
          'MRP (Rupees)': 1000,
          'Selling Price (Rupees)': 1500, // Selling price > MRP!
          'Cost Price (Rupees)': 500,
          Stock: 10,
        },
      ];

      const buffer = createTestWorkbook(badRows);

      const res = await request(app)
        .post('/api/v1/admin/products/import?dryRun=true')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .attach('file', buffer, 'bad_products.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dryRun).toBe(true);
      expect(res.body.data.errors.length).toBeGreaterThanOrEqual(2);

      // Verify nothing was written to database
      const count = await Product.countDocuments();
      expect(count).toBe(0);
    });

    it('dryRun=false commits valid products and variants to database', async () => {
      const validRows = [
        {
          Audience: 'Men',
          Category: 'Kurtas',
          Subcategory: 'Short Kurtas',
          'Product Name': 'Chikankari Linen Kurta',
          Description: 'Pure linen embroidered kurta',
          'Color Name': 'Pastel Green',
          'Color Hex': '#A8E6CF',
          Size: '38',
          'MRP (Rupees)': 3499,
          'Selling Price (Rupees)': 2499,
          'Cost Price (Rupees)': 1100,
          Stock: 12,
        },
        {
          Audience: 'Men',
          Category: 'Kurtas',
          Subcategory: 'Short Kurtas',
          'Product Name': 'Chikankari Linen Kurta', // Same product, another variant
          Description: 'Pure linen embroidered kurta',
          'Color Name': 'Pastel Green',
          'Color Hex': '#A8E6CF',
          Size: '40',
          'MRP (Rupees)': 3499,
          'Selling Price (Rupees)': 2499,
          'Cost Price (Rupees)': 1100,
          Stock: 18,
        },
      ];

      const buffer = createTestWorkbook(validRows);

      const res = await request(app)
        .post('/api/v1/admin/products/import')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .attach('file', buffer, 'valid_products.xlsx');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.importedProducts).toBe(1);

      const created = await Product.findOne({ name: 'Chikankari Linen Kurta' });
      expect(created).toBeDefined();
      expect(created.totalStock).toBe(30); // 12 + 18
      expect(created.priceRange.minSelling).toBe(249900); // In paise!

      const variants = await Variant.find({ product: created._id });
      expect(variants.length).toBe(2);
    });
  });

  describe('GET /api/v1/admin/products/export (Catalog Export)', () => {
    beforeEach(async () => {
      const prod = await Product.create({
        name: 'Export Test Kurta',
        slug: 'export-test-kurta',
        description: 'Testing export',
        audience: audience._id,
        category: category._id,
        subcategory: subcategory._id,
        colors: [{ name: 'Black', images: [{ url: 'http://img.com', publicId: 'p' }] }],
      });

      await Variant.create({
        product: prod._id,
        sku: 'YNR-KURTAS-EXPORT-BLACK-M',
        color: { name: 'Black' },
        size: 'M',
        mrp: 299900,
        sellingPrice: 199900,
        costPrice: 85000,
        stock: 7,
      });
    });

    it('exports catalog with Cost Price column when staff has inventory.view-cost', async () => {
      const res = await request(app)
        .get('/api/v1/admin/products/export')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .buffer()
        .parse(binaryParser);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml.sheet');

      // Parse downloaded workbook buffer
      const wb = xlsx.read(res.body, { type: 'buffer' });
      const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

      expect(rows.length).toBe(1);
      expect(rows[0]['SKU']).toBe('YNR-KURTAS-EXPORT-BLACK-M');
      expect(rows[0]['Cost Price (Rupees)']).toBe(850);
    });

    it('exports catalog WITHOUT Cost Price column when staff lacks inventory.view-cost', async () => {
      const res = await request(app)
        .get('/api/v1/admin/products/export')
        .set('Authorization', `Bearer ${noCostStaffToken}`)
        .buffer()
        .parse(binaryParser);

      expect(res.status).toBe(200);

      const wb = xlsx.read(res.body, { type: 'buffer' });
      const rows = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

      expect(rows.length).toBe(1);
      expect(rows[0]['SKU']).toBe('YNR-KURTAS-EXPORT-BLACK-M');
      expect(rows[0]['Cost Price (Rupees)']).toBeUndefined();
    });
  });
});
