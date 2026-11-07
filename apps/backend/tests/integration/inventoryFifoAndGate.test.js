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
const Batch = require('../../src/modules/inventory/models/batch.model');
const StockMovement = require('../../src/modules/inventory/models/stockMovement.model');
const productService = require('../../src/modules/catalog/product.service');
const fifoService = require('../../src/modules/inventory/fifo.service');
const eventBus = require('../../src/core/events/eventBus');
const {
  ROLES,
  TOKEN_AUDIENCE,
  PRODUCT_STATUS,
  BATCH_STATUS,
  STOCK_MOVEMENT_TYPE,
  EVENT_NAMES,
} = require('@younora/shared-constants');

describe('Slices 2 & 3: Stock Receiving, FIFO Allocation & Phase B5 Concurrency Gate', () => {
  let superAdminToken;
  let testProduct;
  let variantM;
  let variantL;

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

    const audience = await Audience.create({ name: 'Women', slug: 'women', isActive: true });
    const category = await Category.create({
      audience: audience._id,
      name: 'Lehengas',
      slug: 'women-lehengas',
      isActive: true,
    });
    const subcategory = await Subcategory.create({
      category: category._id,
      name: 'Bridal Lehengas',
      slug: 'bridal-lehengas',
      isActive: true,
    });

    // Create product with 0 initial stock so all stock comes from received batches
    const created = await productService.createProduct({
      name: 'Royal Zari Bridal Lehenga',
      slug: 'royal-zari-bridal-lehenga',
      description: 'Handcrafted bridal lehenga',
      audience: audience._id.toString(),
      category: category._id.toString(),
      subcategory: subcategory._id.toString(),
      status: PRODUCT_STATUS.ACTIVE,
      colors: [
        {
          name: 'Crimson Red',
          hex: '#990000',
          images: [
            {
              url: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b',
              publicId: 'younora/test/lehenga-1',
            },
          ],
        },
      ],
      variants: [
        {
          color: { name: 'Crimson Red', hex: '#990000' },
          size: 'M',
          mrp: 5000000,
          sellingPrice: 4500000,
          costPrice: 2000000,
          stock: 0,
          lowStockThreshold: 5,
        },
        {
          color: { name: 'Crimson Red', hex: '#990000' },
          size: 'L',
          mrp: 5000000,
          sellingPrice: 4500000,
          costPrice: 2000000,
          stock: 0,
          lowStockThreshold: 5,
        },
      ],
    });

    testProduct = created;
    variantM = created.variants.find((v) => v.size === 'M');
    variantL = created.variants.find((v) => v.size === 'L');
  });

  describe('Stock Receiving & Batch Creation (POST /api/v1/admin/batches)', () => {
    it('creates a batch with auto-generated batchNo, updates variant stock, product totalStock, and writes RECEIVE movements', async () => {
      const res = await request(app)
        .post('/api/v1/admin/batches')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          product: testProduct._id.toString(),
          supplier: { name: 'Royal Zari Artisans', ref: 'INV-2026-01' },
          costPerUnit: 1950000,
          notes: 'First lot received',
          items: [
            { variant: variantM._id.toString(), qtyReceived: 12 },
            { variant: variantL._id.toString(), qtyReceived: 8 },
          ],
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.batchNo).toMatch(/^YNR-\d{4}-WMN-0001$/);
      expect(res.body.data.status).toBe(BATCH_STATUS.ACTIVE);
      expect(res.body.data.items).toHaveLength(2);

      // Verify Variant and Product stock updated
      const dbVarM = await Variant.findById(variantM._id);
      const dbVarL = await Variant.findById(variantL._id);
      const dbProd = await Product.findById(testProduct._id);

      expect(dbVarM.stock).toBe(12);
      expect(dbVarM.costPrice).toBe(1950000);
      expect(dbVarL.stock).toBe(8);
      expect(dbProd.totalStock).toBe(20);

      // Verify RECEIVE ledger rows
      const movements = await StockMovement.find({ batch: res.body.data._id });
      expect(movements).toHaveLength(2);
      expect(movements[0].type).toBe(STOCK_MOVEMENT_TYPE.RECEIVE);
    });

    it('supports receiving additional stock into an existing batch (POST /api/v1/admin/batches/:id/receive)', async () => {
      const createRes = await request(app)
        .post('/api/v1/admin/batches')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          product: testProduct._id.toString(),
          items: [{ variant: variantM._id.toString(), qtyReceived: 5 }],
        });

      const batchId = createRes.body.data._id;

      const addRes = await request(app)
        .post(`/api/v1/admin/batches/${batchId}/receive`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          items: [{ variant: variantM._id.toString(), qtyReceived: 7 }],
          notes: 'Top-up shipment',
        });

      expect(addRes.status).toBe(200);
      expect(addRes.body.data.items[0].qtyReceived).toBe(12);
      expect(addRes.body.data.items[0].qtyAvailable).toBe(12);

      const dbVarM = await Variant.findById(variantM._id);
      expect(dbVarM.stock).toBe(12);
    });
  });

  describe('FIFO Allocation Across Multiple Batches', () => {
    it('allocates across oldest batches first (FIFO), splits across batches, supports release and sale commit', async () => {
      // Batch 1 (older): 4 units of M @ ₹19,000
      const batch1Res = await request(app)
        .post('/api/v1/admin/batches')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          product: testProduct._id.toString(),
          receivedOn: '2026-10-01T10:00:00Z',
          costPerUnit: 1900000,
          items: [{ variant: variantM._id.toString(), qtyReceived: 4 }],
        });

      // Batch 2 (newer): 6 units of M @ ₹21,000
      const batch2Res = await request(app)
        .post('/api/v1/admin/batches')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          product: testProduct._id.toString(),
          receivedOn: '2026-11-01T10:00:00Z',
          costPerUnit: 2100000,
          items: [{ variant: variantM._id.toString(), qtyReceived: 6 }],
        });

      const batch1No = batch1Res.body.data.batchNo;
      const batch2No = batch2Res.body.data.batchNo;

      // Preview FIFO allocation for 7 units -> should take 4 from Batch 1 + 3 from Batch 2
      const plan = await fifoService.allocate(variantM._id, 7);
      expect(plan).toHaveLength(2);
      expect(plan[0]).toMatchObject({ batchNo: batch1No, qty: 4, costPerUnit: 1900000 });
      expect(plan[1]).toMatchObject({ batchNo: batch2No, qty: 3, costPerUnit: 2100000 });

      // Reserve 7 units atomically
      const reservation = await fifoService.reserveStock({
        variantId: variantM._id,
        qty: 7,
        refId: 'ORD-TEST-01',
      });

      expect(reservation.reservedQty).toBe(7);
      expect(reservation.remainingStock).toBe(3);
      expect(reservation.reservedStock).toBe(7);
      expect(reservation.allocations).toHaveLength(2);

      // Commit reservation to sale -> Batch 1 has 0 available and 0 reserved, so it becomes EXHAUSTED
      await fifoService.commitReservationToSale({
        variantId: variantM._id,
        allocations: reservation.allocations,
      });

      const b1After = await Batch.findById(batch1Res.body.data._id);
      const b2After = await Batch.findById(batch2Res.body.data._id);

      expect(b1After.status).toBe(BATCH_STATUS.EXHAUSTED);
      expect(b1After.items[0].qtySold).toBe(4);
      expect(b1After.items[0].qtyAvailable).toBe(0);

      expect(b2After.status).toBe(BATCH_STATUS.ACTIVE);
      expect(b2After.items[0].qtySold).toBe(3);
      expect(b2After.items[0].qtyAvailable).toBe(3);

      // Reserve 2 more units and then release them
      const res2 = await fifoService.reserveStock({
        variantId: variantM._id,
        qty: 2,
        refId: 'ORD-TEST-02',
      });
      expect(res2.remainingStock).toBe(1);

      const released = await fifoService.releaseReservation({
        variantId: variantM._id,
        allocations: res2.allocations,
        refId: 'ORD-TEST-02',
      });
      expect(released.stock).toBe(3);
      expect(released.reservedStock).toBe(0);
    });
  });

  describe('PHASE B5 GATE: 50 Parallel Reserve Attempts on Stock 10', () => {
    it('exactly 10 reserve attempts succeed, 40 fail, stock never goes negative, ledger sum equals stock, and threshold events fire once per crossing', async () => {
      // Receive 10 units across two batches (6 in Batch A, 4 in Batch B)
      await request(app)
        .post('/api/v1/admin/batches')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          product: testProduct._id.toString(),
          receivedOn: '2026-11-01T08:00:00Z',
          items: [{ variant: variantM._id.toString(), qtyReceived: 6 }],
        });

      await request(app)
        .post('/api/v1/admin/batches')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          product: testProduct._id.toString(),
          receivedOn: '2026-11-02T08:00:00Z',
          items: [{ variant: variantM._id.toString(), qtyReceived: 4 }],
        });

      // Track low-stock and out-of-stock events emitted during the 50 parallel attempts
      const lowStockEvents = [];
      const outOfStockEvents = [];
      const unsubLow = eventBus.subscribe(EVENT_NAMES.STOCK_LOW, (payload) => {
        lowStockEvents.push(payload);
      });
      const unsubOut = eventBus.subscribe(EVENT_NAMES.STOCK_OUT, (payload) => {
        outOfStockEvents.push(payload);
      });

      try {
        // Launch 50 concurrent reservation attempts of 1 unit each against stock of 10
        const attempts = Array.from({ length: 50 }, (_, idx) =>
          fifoService.reserveStock({
            variantId: variantM._id,
            qty: 1,
            refId: `PARALLEL-ORDER-${idx + 1}`,
          })
        );

        const settled = await Promise.allSettled(attempts);

        const fulfilled = settled.filter((r) => r.status === 'fulfilled');
        const rejected = settled.filter((r) => r.status === 'rejected');

        // GATE ASSERTION 1: Exactly 10 succeed and 40 fail
        expect(fulfilled).toHaveLength(10);
        expect(rejected).toHaveLength(40);

        // GATE ASSERTION 2: Variant stock is 0 and reservedStock is 10 (never negative)
        const finalVariant = await Variant.findById(variantM._id);
        expect(finalVariant.stock).toBe(0);
        expect(finalVariant.reservedStock).toBe(10);

        // GATE ASSERTION 3: Batch available quantities are 0 and reserved quantities sum to 10
        const batches = await Batch.find({ product: testProduct._id }).sort({ receivedOn: 1 });
        expect(batches[0].items[0].qtyAvailable).toBe(0);
        expect(batches[0].items[0].qtyReserved).toBe(6);
        expect(batches[1].items[0].qtyAvailable).toBe(0);
        expect(batches[1].items[0].qtyReserved).toBe(4);

        // GATE ASSERTION 4: Ledger sum equals current stock (10 received - 10 reserved = 0)
        const movements = await StockMovement.find({ variant: variantM._id });
        const ledgerSum = movements.reduce((sum, m) => sum + m.qty, 0);
        expect(ledgerSum).toBe(finalVariant.stock);

        // GATE ASSERTION 5: Threshold events emitted strictly once per crossing
        // (10 -> 5 crossed lowStockThreshold=5 once; 1 -> 0 crossed stock.out once)
        expect(lowStockEvents).toHaveLength(1);
        expect(lowStockEvents[0].remaining).toBe(5);
        expect(outOfStockEvents).toHaveLength(1);
        expect(outOfStockEvents[0].remaining).toBe(0);
      } finally {
        unsubLow();
        unsubOut();
      }
    });
  });
});

