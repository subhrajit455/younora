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
const Variant = require('../../src/modules/catalog/models/variant.model');
const Batch = require('../../src/modules/inventory/models/batch.model');
const StockMovement = require('../../src/modules/inventory/models/stockMovement.model');
const productService = require('../../src/modules/catalog/product.service');
const {
  ROLES,
  TOKEN_AUDIENCE,
  PERMISSIONS,
  PRODUCT_STATUS,
  BATCH_STATUS,
  STOCK_MOVEMENT_TYPE,
  ADJUSTMENT_REASON,
} = require('@younora/shared-constants');

function binaryParser(res, callback) {
  res.setEncoding('binary');
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    callback(null, Buffer.from(data, 'binary'));
  });
}

describe('Slices 4 & 5: Adjustments, Batch Search, Public Lookup, Reports & Excel Import', () => {
  let superAdminToken;
  let noCostStaffToken;
  let testProduct;
  let variant38;
  let variant40;

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

    const staffNoCost = await AdminUser.create({
      name: 'Warehouse Staff',
      email: 'warehouse@younora.com',
      passwordHash,
      role: ROLES.STAFF,
      permissions: [
        PERMISSIONS.INVENTORY_READ,
        PERMISSIONS.INVENTORY_WRITE,
        PERMISSIONS.BATCHES_SEARCH,
        PERMISSIONS.REPORTS_READ,
      ],
      isActive: true,
    });
    noCostStaffToken = jwt.sign(
      { sub: staffNoCost._id.toString(), role: staffNoCost.role },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m', audience: TOKEN_AUDIENCE.ADMIN }
    );

    const audience = await Audience.create({ name: 'Men', slug: 'men', isActive: true });
    const category = await Category.create({
      audience: audience._id,
      name: 'Sherwanis',
      slug: 'men-sherwanis',
      isActive: true,
    });
    const subcategory = await Subcategory.create({
      category: category._id,
      name: 'Royal Sherwanis',
      slug: 'royal-sherwanis',
      isActive: true,
    });

    const created = await productService.createProduct({
      name: 'Imperial Silk Sherwani',
      slug: 'imperial-silk-sherwani',
      description: 'Handcrafted silk sherwani',
      audience: audience._id.toString(),
      category: category._id.toString(),
      subcategory: subcategory._id.toString(),
      status: PRODUCT_STATUS.ACTIVE,
      colors: [
        {
          name: 'Royal Ivory',
          hex: '#FFFFF0',
          images: [
            {
              url: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35',
              publicId: 'younora/test/sherwani-1',
            },
          ],
        },
      ],
      variants: [
        {
          color: { name: 'Royal Ivory', hex: '#FFFFF0' },
          size: '38',
          mrp: 4000000,
          sellingPrice: 3500000,
          costPrice: 1500000,
          stock: 0,
          lowStockThreshold: 5,
        },
        {
          color: { name: 'Royal Ivory', hex: '#FFFFF0' },
          size: '40',
          mrp: 4000000,
          sellingPrice: 3500000,
          costPrice: 1500000,
          stock: 0,
          lowStockThreshold: 5,
        },
      ],
    });

    testProduct = created;
    variant38 = created.variants.find((v) => v.size === '38');
    variant40 = created.variants.find((v) => v.size === '40');
  });

  describe('Manual Adjustments, Damage Write-Off, Quarantine & Ledger Reconciliation', () => {
    it('enforces mandatory reason/note, handles damage write-off, rejects negative stock, and keeps ledger sum equal to stock', async () => {
      // Receive 15 units of size 38
      const batchRes = await request(app)
        .post('/api/v1/admin/batches')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          product: testProduct._id.toString(),
          supplier: { name: 'Silk Weavers Ltd', ref: 'PO-11' },
          costPerUnit: 1500000,
          items: [{ variant: variant38._id.toString(), qtyReceived: 15 }],
        });

      const batchId = batchRes.body.data._id;

      // 1. Missing note should fail with 400
      const badAdjust = await request(app)
        .post('/api/v1/admin/inventory/adjust')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          variant: variant38._id.toString(),
          qty: -2,
          reason: ADJUSTMENT_REASON.DAMAGE_WRITE_OFF,
          note: '',
        });
      expect(badAdjust.status).toBe(400);

      // 2. Valid damage write-off (-3 units)
      const damageRes = await request(app)
        .post('/api/v1/admin/inventory/adjust')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          variant: variant38._id.toString(),
          batch: batchId,
          qty: -3,
          reason: ADJUSTMENT_REASON.DAMAGE_WRITE_OFF,
          note: 'Water damage during warehouse transit',
        });

      expect(damageRes.status).toBe(200);
      expect(damageRes.body.data.newStock).toBe(12);

      const batchAfterDamage = await Batch.findById(batchId);
      expect(batchAfterDamage.items[0].qtyAvailable).toBe(12);
      expect(batchAfterDamage.items[0].qtyDamaged).toBe(3);

      // 3. Reject adjustment that would cause negative stock (-20 on stock 12)
      const negAttempt = await request(app)
        .post('/api/v1/admin/inventory/adjust')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          variant: variant38._id.toString(),
          batch: batchId,
          qty: -20,
          reason: ADJUSTMENT_REASON.STOCK_RECONCILIATION,
          note: 'Attempting excessive deduction',
        });
      expect(negAttempt.status).toBe(409);

      // 4. Quarantine batch -> removes remaining 12 available units from active Variant stock
      const quarantineRes = await request(app)
        .patch(`/api/v1/admin/batches/${batchId}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          status: BATCH_STATUS.QUARANTINED,
          notes: 'Hold for quality inspection',
        });
      expect(quarantineRes.status).toBe(200);
      expect(quarantineRes.body.data.status).toBe(BATCH_STATUS.QUARANTINED);

      const varInQuarantine = await Variant.findById(variant38._id);
      expect(varInQuarantine.stock).toBe(0);

      // 5. Restore batch to ACTIVE -> restores 12 units to Variant stock
      await request(app)
        .patch(`/api/v1/admin/batches/${batchId}/status`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          status: BATCH_STATUS.ACTIVE,
          notes: 'QC passed',
        });

      const varRestored = await Variant.findById(variant38._id);
      expect(varRestored.stock).toBe(12);

      // 6. Verify ledger sum equals Variant.stock
      const movementsRes = await request(app)
        .get(`/api/v1/admin/inventory/movements?variant=${variant38._id.toString()}`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(movementsRes.status).toBe(200);
      const movements = await StockMovement.find({ variant: variant38._id });
      const ledgerSum = movements.reduce((sum, m) => sum + m.qty, 0);
      expect(ledgerSum).toBe(varRestored.stock);
      expect(movements.some((m) => m.type === STOCK_MOVEMENT_TYPE.DAMAGE)).toBe(true);
    });
  });

  describe('CRM Batch Search, Public Batch Lookup & Cost Permission Redaction', () => {
    it('searches by partial batchNo, product name, and SKU; redacts cost & supplier without inventory.view-cost; isolates public batch lookup', async () => {
      const batchRes = await request(app)
        .post('/api/v1/admin/batches')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          product: testProduct._id.toString(),
          batchNo: 'YNR-2611-MEN-0777',
          supplier: { name: 'Confidential Artisan House', ref: 'SUP-SECRET-99' },
          costPerUnit: 1550000,
          items: [
            { variant: variant38._id.toString(), qtyReceived: 4, costPerUnit: 1550000 },
            { variant: variant40._id.toString(), qtyReceived: 10, costPerUnit: 1550000 },
          ],
        });

      expect(batchRes.status).toBe(201);

      // 1. Search by partial batchNo as Super Admin (has inventory.view-cost)
      const searchAdmin = await request(app)
        .get('/api/v1/admin/batches/search?q=0777')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(searchAdmin.status).toBe(200);
      expect(searchAdmin.body.data).toHaveLength(1);
      expect(searchAdmin.body.data[0].batchNo).toBe('YNR-2611-MEN-0777');
      expect(searchAdmin.body.data[0].costPerUnit).toBe(1550000);
      expect(searchAdmin.body.data[0].supplier.name).toBe('Confidential Artisan House');
      expect(searchAdmin.body.data[0].summary.totalReceived).toBe(14);

      // 2. Search by product name and by SKU as Staff WITHOUT inventory.view-cost
      const searchByProdStaff = await request(app)
        .get('/api/v1/admin/batches/search?q=Imperial Silk')
        .set('Authorization', `Bearer ${noCostStaffToken}`);

      expect(searchByProdStaff.status).toBe(200);
      expect(searchByProdStaff.body.data).toHaveLength(1);
      expect(searchByProdStaff.body.data[0].costPerUnit).toBeUndefined();
      expect(searchByProdStaff.body.data[0].supplier).toBeUndefined();
      expect(searchByProdStaff.body.data[0].items[0].costPerUnit).toBeUndefined();
      expect(searchByProdStaff.body.data[0].items[0].variant.costPrice).toBeUndefined();

      const searchBySkuStaff = await request(app)
        .get(`/api/v1/admin/batches/search?q=${variant38.sku}`)
        .set('Authorization', `Bearer ${noCostStaffToken}`);
      expect(searchBySkuStaff.status).toBe(200);
      expect(searchBySkuStaff.body.data).toHaveLength(1);

      // 3. Low-stock endpoint & Batch-wise report respect inventory.view-cost
      const lowStockStaff = await request(app)
        .get('/api/v1/admin/inventory/low-stock')
        .set('Authorization', `Bearer ${noCostStaffToken}`);
      expect(lowStockStaff.status).toBe(200);
      expect(lowStockStaff.body.data.length).toBeGreaterThanOrEqual(1);
      expect(lowStockStaff.body.data[0].costPrice).toBeUndefined();

      const reportStaff = await request(app)
        .get('/api/v1/admin/reports/batch-wise')
        .set('Authorization', `Bearer ${noCostStaffToken}`);
      expect(reportStaff.status).toBe(200);
      expect(reportStaff.body.data[0].costPerUnit).toBeUndefined();
      expect(reportStaff.body.data[0].supplier).toBeUndefined();
      expect(reportStaff.body.data[0].availableStockCostValuationPaise).toBeUndefined();

      // 4. Public Storefront Batch Lookup (`GET /api/v1/store/batch/:batchNo`)
      const publicRes = await request(app).get('/api/v1/store/batch/YNR-2611-MEN-0777');
      expect(publicRes.status).toBe(200);
      expect(publicRes.body.data).toMatchObject({
        batchNo: 'YNR-2611-MEN-0777',
        authentic: true,
        authenticityMessage: 'Authentic Younora batch',
        product: {
          name: 'Imperial Silk Sherwani',
          slug: 'imperial-silk-sherwani',
          productLink: '/products/imperial-silk-sherwani',
        },
      });
      expect(publicRes.body.data.variantsInBatch).toHaveLength(2);

      // Assert forbidden keys never leak in public response
      const rawJson = JSON.stringify(publicRes.body.data);
      expect(rawJson).not.toContain('costPerUnit');
      expect(rawJson).not.toContain('costPrice');
      expect(rawJson).not.toContain('supplier');
      expect(rawJson).not.toContain('Confidential Artisan House');
      expect(rawJson).not.toContain('qtyAvailable');
      expect(rawJson).not.toContain('qtyReceived');
      expect(rawJson).not.toContain('qtySold');
    });
  });

  describe('Slice 5: Excel Bulk Stock-Receive Import', () => {
    it('downloads template, validates rows in dryRun=true, and commits stock receipts in dryRun=false', async () => {
      // 1. Download template
      const tplRes = await request(app)
        .get('/api/v1/admin/batches/import/template')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .buffer()
        .parse(binaryParser);

      expect(tplRes.status).toBe(200);
      expect(Buffer.isBuffer(tplRes.body)).toBe(true);

      // 2. Test dryRun=true with an invalid row
      const badRows = [
        {
          'Product Slug': 'imperial-silk-sherwani',
          'Variant SKU': 'NON-EXISTENT-SKU',
          'Qty Received': 10,
          'Cost Per Unit (INR)': 15000,
        },
      ];
      const badWb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(badWb, xlsx.utils.json_to_sheet(badRows), 'Receive');
      const badBuf = xlsx.write(badWb, { type: 'buffer', bookType: 'xlsx' });

      const dryRunRes = await request(app)
        .post('/api/v1/admin/batches/import?dryRun=true')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .attach('file', badBuf, 'bad-receive.xlsx');

      expect(dryRunRes.status).toBe(200);
      expect(dryRunRes.body.data.dryRun).toBe(true);
      expect(dryRunRes.body.data.committed).toBe(false);
      expect(dryRunRes.body.data.errorsCount).toBe(1);
      expect(dryRunRes.body.data.errors[0].field).toBe('Variant SKU');

      // 3. Test dryRun=false with valid rows
      const validRows = [
        {
          'Product Slug': 'imperial-silk-sherwani',
          'Variant SKU': variant38.sku,
          'Qty Received': 9,
          'Cost Per Unit (INR)': 16000,
          'Batch No': 'YNR-2611-MEN-0888',
          'Supplier Name': 'Jaipur Heritage Looms',
          'Supplier Ref': 'INV-888',
          Notes: 'Bulk Excel stock receive',
        },
        {
          'Product Slug': 'imperial-silk-sherwani',
          'Variant SKU': variant40.sku,
          'Qty Received': 11,
          'Cost Per Unit (INR)': 16000,
          'Batch No': 'YNR-2611-MEN-0888',
          'Supplier Name': 'Jaipur Heritage Looms',
          'Supplier Ref': 'INV-888',
          Notes: 'Bulk Excel stock receive',
        },
      ];
      const validWb = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(validWb, xlsx.utils.json_to_sheet(validRows), 'Receive');
      const validBuf = xlsx.write(validWb, { type: 'buffer', bookType: 'xlsx' });

      const commitRes = await request(app)
        .post('/api/v1/admin/batches/import?dryRun=false')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .attach('file', validBuf, 'valid-receive.xlsx');

      expect(commitRes.status).toBe(201);
      expect(commitRes.body.data.committed).toBe(true);
      expect(commitRes.body.data.batchesCreatedCount).toBe(1);

      const dbVar38 = await Variant.findById(variant38._id);
      const dbVar40 = await Variant.findById(variant40._id);
      expect(dbVar38.stock).toBe(9);
      expect(dbVar38.costPrice).toBe(1600000);
      expect(dbVar40.stock).toBe(11);
    });
  });
});

