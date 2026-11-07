const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Counter = require('../../src/modules/inventory/models/counter.model');
const Batch = require('../../src/modules/inventory/models/batch.model');
const StockMovement = require('../../src/modules/inventory/models/stockMovement.model');
const {
  resolveAudienceCode,
  formatYYMM,
  generateBatchNumber,
} = require('../../src/modules/inventory/utils/batchNumber');
const {
  BATCH_STATUS,
  STOCK_MOVEMENT_TYPE,
  STOCK_MOVEMENT_REF_TYPE,
} = require('@younora/shared-constants');

describe('Slice 1: Inventory Models, Constants & Atomic Batch Number Generator', () => {
  let mongod;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
  });

  afterAll(async () => {
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      Counter.deleteMany({}),
      Batch.deleteMany({}),
      StockMovement.deleteMany({}),
    ]);
  });

  describe('Pure Helpers (resolveAudienceCode & formatYYMM)', () => {
    it('maps standard audiences (Men, Women, Kids) to 3-letter codes', () => {
      expect(resolveAudienceCode('Men')).toBe('MEN');
      expect(resolveAudienceCode('women')).toBe('WMN');
      expect(resolveAudienceCode('KIDS')).toBe('KID');
      expect(resolveAudienceCode('Unisex')).toBe('UNI');
      expect(resolveAudienceCode('')).toBe('GEN');
    });

    it('formats dates into YYMM accurately', () => {
      const date = new Date('2026-11-15T10:00:00Z');
      expect(formatYYMM(date)).toBe('2611');
    });
  });

  describe('Atomic Counter & Batch Number Uniqueness under Parallel Requests', () => {
    it('generates 30 unique sequential batch numbers under concurrent calls', async () => {
      const refDate = new Date('2026-11-07T00:00:00Z');
      const parallelCalls = Array.from({ length: 30 }, (_, i) =>
        generateBatchNumber({
          audience: i % 2 === 0 ? 'Women' : 'Men',
          date: refDate,
        })
      );

      const batchNumbers = await Promise.all(parallelCalls);
      const uniqueSet = new Set(batchNumbers);

      expect(uniqueSet.size).toBe(30);

      for (const bn of batchNumbers) {
        expect(bn).toMatch(/^YNR-2611-(WMN|MEN)-\d{4}$/);
      }

      // Extract sequence numbers and verify 0001..0030 are all present
      const seqs = batchNumbers
        .map((b) => Number(b.split('-')[3]))
        .sort((a, b) => a - b);
      expect(seqs[0]).toBe(1);
      expect(seqs[29]).toBe(30);
    });
  });

  describe('Batch Model Validation', () => {
    it('validates a well-formed Batch document', async () => {
      const productId = new mongoose.Types.ObjectId();
      const variantId = new mongoose.Types.ObjectId();

      const batch = new Batch({
        batchNo: 'YNR-2611-WMN-0001',
        product: productId,
        supplier: { name: 'Varanasi Weavers Co.', ref: 'INV-901' },
        costPerUnit: 850000,
        items: [
          {
            variant: variantId,
            qtyReceived: 20,
            qtyAvailable: 20,
            costPerUnit: 850000,
          },
        ],
      });

      const saved = await batch.save();
      expect(saved.status).toBe(BATCH_STATUS.ACTIVE);
      expect(saved.items[0].qtyReserved).toBe(0);
      expect(saved.items[0].qtySold).toBe(0);
    });

    it('rejects Batch with empty items array or negative quantities', async () => {
      const productId = new mongoose.Types.ObjectId();
      const emptyBatch = new Batch({
        batchNo: 'YNR-2611-WMN-0002',
        product: productId,
        items: [],
      });

      await expect(emptyBatch.validate()).rejects.toThrow(/at least one variant item/i);

      const negBatch = new Batch({
        batchNo: 'YNR-2611-WMN-0003',
        product: productId,
        items: [
          {
            variant: new mongoose.Types.ObjectId(),
            qtyReceived: 10,
            qtyAvailable: -1,
          },
        ],
      });

      await expect(negBatch.validate()).rejects.toThrow(/cannot be negative/i);
    });
  });

  describe('StockMovement Ledger Immutability & Validation', () => {
    it('saves a valid StockMovement entry and rejects zero qty or negative balanceAfter', async () => {
      const variantId = new mongoose.Types.ObjectId();
      const batchId = new mongoose.Types.ObjectId();

      const validMove = await StockMovement.create({
        variant: variantId,
        batch: batchId,
        type: STOCK_MOVEMENT_TYPE.RECEIVE,
        qty: 25,
        balanceAfter: 25,
        refType: STOCK_MOVEMENT_REF_TYPE.BATCH,
        refId: batchId.toString(),
        note: 'Initial batch receive',
      });

      expect(validMove._id).toBeDefined();
      expect(validMove.createdAt).toBeDefined();

      // Zero qty should fail validation
      const zeroMove = new StockMovement({
        variant: variantId,
        type: STOCK_MOVEMENT_TYPE.ADJUST,
        qty: 0,
        balanceAfter: 25,
      });
      await expect(zeroMove.validate()).rejects.toThrow(/non-zero integer/i);

      // Negative balanceAfter should fail validation
      const negBalMove = new StockMovement({
        variant: variantId,
        type: STOCK_MOVEMENT_TYPE.ADJUST,
        qty: -30,
        balanceAfter: -5,
      });
      await expect(negBalMove.validate()).rejects.toThrow(/cannot be negative/i);
    });

    it('enforces immutability: prevents updating existing StockMovement rows', async () => {
      const move = await StockMovement.create({
        variant: new mongoose.Types.ObjectId(),
        type: STOCK_MOVEMENT_TYPE.RECEIVE,
        qty: 10,
        balanceAfter: 10,
      });

      move.qty = 50;
      await expect(move.save()).rejects.toThrow(/immutable/i);

      await expect(
        StockMovement.updateOne({ _id: move._id }, { $set: { qty: 99 } })
      ).rejects.toThrow(/immutable/i);
    });
  });
});

