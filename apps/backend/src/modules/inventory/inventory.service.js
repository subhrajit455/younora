const Product = require('../catalog/models/product.model');
const Variant = require('../catalog/models/variant.model');
const Audience = require('../catalog/models/audience.model');
const Batch = require('./models/batch.model');
const StockMovement = require('./models/stockMovement.model');
const AuditLog = require('../audit/models/auditLog.model');
const fifoService = require('./fifo.service');
const { generateBatchNumber } = require('./utils/batchNumber');
const AppError = require('../../core/errors/appError');
const {
  BATCH_STATUS,
  STOCK_MOVEMENT_TYPE,
  STOCK_MOVEMENT_REF_TYPE,
  ADJUSTMENT_REASON,
} = require('@younora/shared-constants');

class InventoryService {
  /**
   * Redacts confidential cost and supplier fields when staff lacks `inventory.view-cost`
   */
  sanitizeBatch(batchDoc, canViewCost = false) {
    const batch = typeof batchDoc.toObject === 'function' ? batchDoc.toObject() : { ...batchDoc };

    if (!canViewCost) {
      delete batch.costPerUnit;
      delete batch.supplier;
      if (Array.isArray(batch.items)) {
        batch.items = batch.items.map((item) => {
          const cleanItem = { ...item };
          delete cleanItem.costPerUnit;
          if (cleanItem.variant && typeof cleanItem.variant === 'object') {
            cleanItem.variant = { ...cleanItem.variant };
            delete cleanItem.variant.costPrice;
          }
          return cleanItem;
        });
      }
    }

    return batch;
  }

  /**
   * Receive stock by creating a new Batch, incrementing Variant stock & Product totalStock,
   * and recording immutable RECEIVE rows in `stock_movements`.
   */
  async createBatch(data, { actor = null, canViewCost = false } = {}) {
    const product = await Product.findOne({ _id: data.product, isDeleted: false });
    if (!product) {
      throw AppError.notFound('Product not found');
    }

    const audience = await Audience.findById(product.audience).lean();
    const audienceKey = audience ? audience.slug || audience.name : 'GEN';

    // Validate all variants belong to this product and have no duplicates in request
    const seenVariants = new Set();
    const variantIds = [];
    for (const item of data.items) {
      const vid = item.variant.toString();
      if (seenVariants.has(vid)) {
        throw AppError.badRequest(`Duplicate variant ${vid} in batch items`);
      }
      seenVariants.add(vid);
      variantIds.push(item.variant);
    }

    const variants = await Variant.find({
      _id: { $in: variantIds },
      product: product._id,
    });

    if (variants.length !== variantIds.length) {
      throw AppError.badRequest('One or more variants do not exist or do not belong to this product');
    }

    // Determine batchNo
    const receivedDate = data.receivedOn ? new Date(data.receivedOn) : new Date();
    let batchNo = data.batchNo ? data.batchNo.trim().toUpperCase() : null;

    if (batchNo) {
      const existing = await Batch.findOne({ batchNo });
      if (existing) {
        throw AppError.conflict(`Batch number '${batchNo}' already exists`);
      }
    } else {
      batchNo = await generateBatchNumber({
        audience: audienceKey,
        date: receivedDate,
      });
    }

    const batchItems = data.items.map((item) => ({
      variant: item.variant,
      qtyReceived: item.qtyReceived,
      qtyAvailable: item.qtyReceived,
      qtyReserved: 0,
      qtySold: 0,
      qtyReturned: 0,
      qtyDamaged: 0,
      costPerUnit: item.costPerUnit ?? data.costPerUnit ?? null,
    }));

    const batch = await Batch.create({
      batchNo,
      product: product._id,
      receivedOn: receivedDate,
      supplier: data.supplier || { name: '', ref: '' },
      costPerUnit: data.costPerUnit ?? null,
      items: batchItems,
      status: BATCH_STATUS.ACTIVE,
      notes: data.notes || '',
      createdBy: actor ? actor._id || actor.id || actor : null,
    });

    // Update each variant's stock and record RECEIVE ledger rows
    let totalReceivedForProduct = 0;
    const movementDocs = [];

    for (const item of batchItems) {
      totalReceivedForProduct += item.qtyReceived;
      const updateFields = {
        $inc: { stock: item.qtyReceived },
      };
      if (typeof item.costPerUnit === 'number') {
        updateFields.$set = { costPrice: item.costPerUnit };
      }

      const updatedVariant = await Variant.findOneAndUpdate(
        { _id: item.variant },
        updateFields,
        { new: true }
      );

      movementDocs.push({
        variant: item.variant,
        batch: batch._id,
        type: STOCK_MOVEMENT_TYPE.RECEIVE,
        qty: item.qtyReceived,
        balanceAfter: updatedVariant.stock,
        refType: STOCK_MOVEMENT_REF_TYPE.BATCH,
        refId: batch.batchNo,
        actor: actor ? actor._id || actor.id || actor : null,
        note: data.notes || `Stock received in batch ${batch.batchNo}`,
      });
    }

    // Increment product denormalized totalStock
    await Product.updateOne(
      { _id: product._id },
      { $inc: { totalStock: totalReceivedForProduct } }
    );

    await StockMovement.insertMany(movementDocs);

    if (actor) {
      await AuditLog.create({
        actor: actor._id || actor.id || actor,
        actorRole: actor.role || 'ADMIN',
        actorEmail: actor.email || '',
        action: 'inventory.batch.receive',
        entity: 'Batch',
        entityId: batch._id.toString(),
        after: {
          batchNo: batch.batchNo,
          product: product._id.toString(),
          totalReceived: totalReceivedForProduct,
        },
      });
    }

    const populated = await Batch.findById(batch._id)
      .populate('product', 'name slug status')
      .populate('items.variant', 'sku color size stock reservedStock costPrice')
      .lean();

    return this.sanitizeBatch(populated, canViewCost);
  }

  /**
   * Receive additional stock into an existing batch
   */
  async receiveIntoBatch(batchId, data, { actor = null, canViewCost = false } = {}) {
    const batch = await Batch.findById(batchId);
    if (!batch) {
      throw AppError.notFound('Batch not found');
    }
    if (batch.status === BATCH_STATUS.QUARANTINED) {
      throw AppError.badRequest('Cannot receive stock into a quarantined batch');
    }

    const variantIds = data.items.map((i) => i.variant);
    const variants = await Variant.find({
      _id: { $in: variantIds },
      product: batch.product,
    });
    if (variants.length !== variantIds.length) {
      throw AppError.badRequest('One or more variants do not belong to this batch product');
    }

    let totalAdded = 0;
    const movementDocs = [];

    for (const inputItem of data.items) {
      totalAdded += inputItem.qtyReceived;
      const existingItem = batch.items.find(
        (bi) => bi.variant.toString() === inputItem.variant.toString()
      );

      if (existingItem) {
        existingItem.qtyReceived += inputItem.qtyReceived;
        existingItem.qtyAvailable += inputItem.qtyReceived;
        if (typeof inputItem.costPerUnit === 'number') {
          existingItem.costPerUnit = inputItem.costPerUnit;
        }
      } else {
        batch.items.push({
          variant: inputItem.variant,
          qtyReceived: inputItem.qtyReceived,
          qtyAvailable: inputItem.qtyReceived,
          qtyReserved: 0,
          qtySold: 0,
          qtyReturned: 0,
          qtyDamaged: 0,
          costPerUnit: inputItem.costPerUnit ?? batch.costPerUnit ?? null,
        });
      }

      const updatedVariant = await Variant.findOneAndUpdate(
        { _id: inputItem.variant },
        { $inc: { stock: inputItem.qtyReceived } },
        { new: true }
      );

      movementDocs.push({
        variant: inputItem.variant,
        batch: batch._id,
        type: STOCK_MOVEMENT_TYPE.RECEIVE,
        qty: inputItem.qtyReceived,
        balanceAfter: updatedVariant.stock,
        refType: STOCK_MOVEMENT_REF_TYPE.BATCH,
        refId: batch.batchNo,
        actor: actor ? actor._id || actor.id || actor : null,
        note: data.notes || `Additional stock received into ${batch.batchNo}`,
      });
    }

    if (batch.status === BATCH_STATUS.EXHAUSTED) {
      batch.status = BATCH_STATUS.ACTIVE;
    }
    if (data.notes) {
      batch.notes = batch.notes ? `${batch.notes}\n${data.notes}` : data.notes;
    }

    await batch.save();

    await Product.updateOne(
      { _id: batch.product },
      { $inc: { totalStock: totalAdded } }
    );

    await StockMovement.insertMany(movementDocs);

    const populated = await Batch.findById(batch._id)
      .populate('product', 'name slug status')
      .populate('items.variant', 'sku color size stock reservedStock costPrice')
      .lean();

    return this.sanitizeBatch(populated, canViewCost);
  }

  /**
   * List batches with filters and pagination
   */
  async listBatches(query = {}, { canViewCost = false } = {}) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = {};
    if (query.product) filter.product = query.product;
    if (query.status) filter.status = query.status;
    if (query.variant) filter['items.variant'] = query.variant;
    if (query.search) {
      filter.batchNo = { $regex: query.search.trim(), $options: 'i' };
    }

    const [batches, total] = await Promise.all([
      Batch.find(filter)
        .sort({ receivedOn: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .populate('product', 'name slug status')
        .populate('items.variant', 'sku color size stock reservedStock costPrice')
        .lean(),
      Batch.countDocuments(filter),
    ]);

    return {
      data: batches.map((b) => this.sanitizeBatch(b, canViewCost)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Get single batch by ID
   */
  async getBatchById(id, { canViewCost = false } = {}) {
    const batch = await Batch.findById(id)
      .populate('product', 'name slug status')
      .populate('items.variant', 'sku color size stock reservedStock costPrice')
      .lean();

    if (!batch) {
      throw AppError.notFound('Batch not found');
    }

    return this.sanitizeBatch(batch, canViewCost);
  }

  /**
   * Update batch status (e.g., QUARANTINED, ACTIVE)
   */
  async updateBatchStatus(id, { status, notes }, { actor = null, canViewCost = false } = {}) {
    const batch = await Batch.findById(id);
    if (!batch) {
      throw AppError.notFound('Batch not found');
    }

    const oldStatus = batch.status;
    if (oldStatus !== status) {
      // If transitioning ACTIVE -> QUARANTINED, deduct available batch stock from variants
      if (oldStatus === BATCH_STATUS.ACTIVE && status === BATCH_STATUS.QUARANTINED) {
        let totalQuarantined = 0;
        const movementDocs = [];

        for (const item of batch.items) {
          if (item.qtyAvailable > 0) {
            const qQty = item.qtyAvailable;
            const updatedVariant = await Variant.findOneAndUpdate(
              { _id: item.variant, stock: { $gte: qQty } },
              { $inc: { stock: -qQty } },
              { new: true }
            );
            if (!updatedVariant) {
              throw AppError.conflict(
                `Cannot quarantine batch: variant ${item.variant} has insufficient unreserved stock`
              );
            }
            totalQuarantined += qQty;
            movementDocs.push({
              variant: item.variant,
              batch: batch._id,
              type: STOCK_MOVEMENT_TYPE.ADJUST,
              qty: -qQty,
              balanceAfter: updatedVariant.stock,
              refType: STOCK_MOVEMENT_REF_TYPE.MANUAL,
              refId: batch.batchNo,
              reason: ADJUSTMENT_REASON.QUARANTINE,
              actor: actor ? actor._id || actor.id || actor : null,
              note: notes || `Batch ${batch.batchNo} quarantined`,
            });
          }
        }

        if (totalQuarantined > 0) {
          await Product.updateOne(
            { _id: batch.product },
            { $inc: { totalStock: -totalQuarantined } }
          );
          await StockMovement.insertMany(movementDocs);
        }
      } else if (oldStatus === BATCH_STATUS.QUARANTINED && status === BATCH_STATUS.ACTIVE) {
        // Restoring QUARANTINED -> ACTIVE restores item.qtyAvailable to Variant.stock
        let totalRestored = 0;
        const movementDocs = [];

        for (const item of batch.items) {
          if (item.qtyAvailable > 0) {
            const rQty = item.qtyAvailable;
            const updatedVariant = await Variant.findOneAndUpdate(
              { _id: item.variant },
              { $inc: { stock: rQty } },
              { new: true }
            );
            totalRestored += rQty;
            movementDocs.push({
              variant: item.variant,
              batch: batch._id,
              type: STOCK_MOVEMENT_TYPE.ADJUST,
              qty: rQty,
              balanceAfter: updatedVariant.stock,
              refType: STOCK_MOVEMENT_REF_TYPE.MANUAL,
              refId: batch.batchNo,
              reason: ADJUSTMENT_REASON.QUARANTINE,
              actor: actor ? actor._id || actor.id || actor : null,
              note: notes || `Batch ${batch.batchNo} released from quarantine`,
            });
          }
        }

        if (totalRestored > 0) {
          await Product.updateOne(
            { _id: batch.product },
            { $inc: { totalStock: totalRestored } }
          );
          await StockMovement.insertMany(movementDocs);
        }
      }
    }

    batch.status = status;
    if (notes) {
      batch.notes = batch.notes ? `${batch.notes}\n${notes}` : notes;
    }
    await batch.save();

    const populated = await Batch.findById(batch._id)
      .populate('product', 'name slug status')
      .populate('items.variant', 'sku color size stock reservedStock costPrice')
      .lean();

    return this.sanitizeBatch(populated, canViewCost);
  }

  /**
   * Manual stock adjustment (reconciliation, damage write-off, theft/loss, etc.)
   * Requires mandatory reason and descriptive note.
   */
  async adjustStock({ variant: variantId, batch: batchId, qty, reason, note }, { actor = null } = {}) {
    const delta = Number(qty);
    if (!Number.isInteger(delta) || delta === 0) {
      throw AppError.badRequest('Adjustment quantity must be a non-zero integer');
    }
    if (!reason || !note || note.trim().length < 3) {
      throw AppError.badRequest('Mandatory reason and descriptive note are required for stock adjustments');
    }

    const isDamage = reason === ADJUSTMENT_REASON.DAMAGE_WRITE_OFF;
    if (isDamage && delta > 0) {
      throw AppError.badRequest('Damage write-off adjustment quantity must be negative');
    }

    const movementType = isDamage ? STOCK_MOVEMENT_TYPE.DAMAGE : STOCK_MOVEMENT_TYPE.ADJUST;

    if (delta < 0) {
      const absQty = Math.abs(delta);

      // 1. Atomically decrement Variant stock (never negative)
      const updatedVariant = await Variant.findOneAndUpdate(
        {
          _id: variantId,
          stock: { $gte: absQty },
        },
        {
          $inc: { stock: -absQty },
        },
        { new: true }
      );

      if (!updatedVariant) {
        throw AppError.conflict('Insufficient stock: adjustment would result in negative stock');
      }

      const previousStock = updatedVariant.stock + absQty;
      const newStock = updatedVariant.stock;

      // 2. Adjust batch(es)
      const movementDocs = [];
      let runningBalance = previousStock;

      if (batchId) {
        const updatedBatch = await Batch.findOneAndUpdate(
          {
            _id: batchId,
            items: {
              $elemMatch: {
                variant: variantId,
                qtyAvailable: { $gte: absQty },
              },
            },
          },
          {
            $inc: {
              'items.$.qtyAvailable': -absQty,
              ...(isDamage ? { 'items.$.qtyDamaged': absQty } : {}),
            },
          },
          { new: true }
        );

        if (!updatedBatch) {
          // Rollback variant stock
          await Variant.updateOne({ _id: variantId }, { $inc: { stock: absQty } });
          throw AppError.conflict('Specified batch has insufficient available quantity for adjustment');
        }

        runningBalance -= absQty;
        movementDocs.push({
          variant: updatedVariant._id,
          batch: updatedBatch._id,
          type: movementType,
          qty: -absQty,
          balanceAfter: runningBalance,
          refType: STOCK_MOVEMENT_REF_TYPE.MANUAL,
          refId: updatedBatch.batchNo,
          reason,
          actor: actor ? actor._id || actor.id || actor : null,
          note,
        });
      } else {
        // Deduct from active batches in FIFO order
        let remaining = absQty;
        const candidateBatches = await Batch.find({
          status: BATCH_STATUS.ACTIVE,
          items: {
            $elemMatch: {
              variant: variantId,
              qtyAvailable: { $gt: 0 },
            },
          },
        }).sort({ receivedOn: 1, _id: 1 });

        for (const b of candidateBatches) {
          if (remaining <= 0) break;
          const item = b.items.find(
            (i) => i.variant.toString() === variantId.toString() && i.qtyAvailable > 0
          );
          if (!item) continue;

          const take = Math.min(remaining, item.qtyAvailable);
          item.qtyAvailable -= take;
          if (isDamage) {
            item.qtyDamaged += take;
          }
          await b.save();

          remaining -= take;
          runningBalance -= take;
          movementDocs.push({
            variant: updatedVariant._id,
            batch: b._id,
            type: movementType,
            qty: -take,
            balanceAfter: runningBalance,
            refType: STOCK_MOVEMENT_REF_TYPE.MANUAL,
            refId: b.batchNo,
            reason,
            actor: actor ? actor._id || actor.id || actor : null,
            note,
          });
        }

        // If any remaining wasn't in a batch (e.g. legacy unbatched stock), still record movement
        if (remaining > 0) {
          runningBalance -= remaining;
          movementDocs.push({
            variant: updatedVariant._id,
            batch: null,
            type: movementType,
            qty: -remaining,
            balanceAfter: runningBalance,
            refType: STOCK_MOVEMENT_REF_TYPE.MANUAL,
            refId: null,
            reason,
            actor: actor ? actor._id || actor.id || actor : null,
            note,
          });
        }
      }

      await Product.updateOne(
        { _id: updatedVariant.product },
        { $inc: { totalStock: -absQty } }
      );

      await StockMovement.insertMany(movementDocs);

      await fifoService.emitThresholdEventsIfCrossed(updatedVariant, previousStock, newStock);

      if (actor) {
        await AuditLog.create({
          actor: actor._id || actor.id || actor,
          actorRole: actor.role || 'ADMIN',
          actorEmail: actor.email || '',
          action: 'inventory.stock.adjust',
          entity: 'Variant',
          entityId: updatedVariant._id.toString(),
          before: { stock: previousStock },
          after: { stock: newStock, qty: delta, reason, note },
        });
      }

      return {
        variantId: updatedVariant._id,
        sku: updatedVariant.sku,
        previousStock,
        newStock,
        adjustedBy: delta,
        reason,
      };
    }

    // Positive adjustment (delta > 0)
    const updatedVariant = await Variant.findOneAndUpdate(
      { _id: variantId },
      { $inc: { stock: delta } },
      { new: true }
    );

    if (!updatedVariant) {
      throw AppError.notFound('Variant not found');
    }

    const previousStock = updatedVariant.stock - delta;
    const newStock = updatedVariant.stock;

    let batchRef = null;
    if (batchId) {
      const updatedBatch = await Batch.findOneAndUpdate(
        { _id: batchId, 'items.variant': variantId },
        {
          $inc: {
            'items.$.qtyAvailable': delta,
            'items.$.qtyReceived': delta,
          },
        },
        { new: true }
      );
      if (!updatedBatch) {
        await Variant.updateOne({ _id: variantId }, { $inc: { stock: -delta } });
        throw AppError.notFound('Specified batch or variant in batch not found');
      }
      batchRef = updatedBatch.batchNo;
    }

    await Product.updateOne(
      { _id: updatedVariant.product },
      { $inc: { totalStock: delta } }
    );

    await StockMovement.create({
      variant: updatedVariant._id,
      batch: batchId || null,
      type: movementType,
      qty: delta,
      balanceAfter: newStock,
      refType: STOCK_MOVEMENT_REF_TYPE.MANUAL,
      refId: batchRef,
      reason,
      actor: actor ? actor._id || actor.id || actor : null,
      note,
    });

    if (actor) {
      await AuditLog.create({
        actor: actor._id || actor.id || actor,
        actorRole: actor.role || 'ADMIN',
        actorEmail: actor.email || '',
        action: 'inventory.stock.adjust',
        entity: 'Variant',
        entityId: updatedVariant._id.toString(),
        before: { stock: previousStock },
        after: { stock: newStock, qty: delta, reason, note },
      });
    }

    return {
      variantId: updatedVariant._id,
      sku: updatedVariant.sku,
      previousStock,
      newStock,
      adjustedBy: delta,
      reason,
    };
  }

  /**
   * List immutable stock movements ledger
   */
  async listMovements(query = {}) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = {};
    if (query.variant) filter.variant = query.variant;
    if (query.batch) filter.batch = query.batch;
    if (query.type) filter.type = query.type;

    const [movements, total] = await Promise.all([
      StockMovement.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .populate('variant', 'sku color size')
        .populate('batch', 'batchNo status')
        .populate('actor', 'name email role')
        .lean(),
      StockMovement.countDocuments(filter),
    ]);

    return {
      data: movements,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * List low-stock variants (stock <= lowStockThreshold)
   */
  async listLowStock(query = {}, { canViewCost = false } = {}) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = {
      isActive: true,
      ...(query.outOfStockOnly
        ? { stock: 0 }
        : { $expr: { $lte: ['$stock', '$lowStockThreshold'] } }),
    };

    const [variants, total] = await Promise.all([
      Variant.find(filter)
        .sort({ stock: 1, _id: 1 })
        .skip(skip)
        .limit(limit)
        .populate('product', 'name slug status')
        .lean(),
      Variant.countDocuments(filter),
    ]);

    const sanitized = variants.map((v) => {
      const copy = { ...v };
      if (!canViewCost) {
        delete copy.costPrice;
      }
      return copy;
    });

    return {
      data: sanitized,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * CRM Global Batch Search (`GET /api/v1/admin/batches/search?q=`)
   * Searches by partial batchNo, product name, or variant SKU.
   * Returns enriched Batch Cards per docs/PLAN.md §11.
   */
  async searchBatches(rawQuery, { canViewCost = false } = {}) {
    const q = (rawQuery || '').trim();
    if (!q) {
      throw AppError.badRequest('Search query q is required');
    }

    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const [matchedProducts, matchedVariants] = await Promise.all([
      Product.find({ name: regex, isDeleted: false }).select('_id').lean(),
      Variant.find({ sku: regex }).select('_id product').lean(),
    ]);

    const productIds = matchedProducts.map((p) => p._id);
    const variantIds = matchedVariants.map((v) => v._id);

    const batches = await Batch.find({
      $or: [
        { batchNo: regex },
        { product: { $in: productIds } },
        { 'items.variant': { $in: variantIds } },
      ],
    })
      .sort({ receivedOn: -1 })
      .limit(25)
      .populate('product', 'name slug status')
      .populate('items.variant', 'sku color size stock reservedStock costPrice')
      .lean();

    return batches.map((batch) => {
      const sanitized = this.sanitizeBatch(batch, canViewCost);

      const summary = sanitized.items.reduce(
        (acc, item) => {
          acc.totalReceived += item.qtyReceived || 0;
          acc.totalAvailable += item.qtyAvailable || 0;
          acc.totalReserved += item.qtyReserved || 0;
          acc.totalSold += item.qtySold || 0;
          acc.totalReturned += item.qtyReturned || 0;
          acc.totalDamaged += item.qtyDamaged || 0;
          return acc;
        },
        {
          totalReceived: 0,
          totalAvailable: 0,
          totalReserved: 0,
          totalSold: 0,
          totalReturned: 0,
          totalDamaged: 0,
        }
      );

      return {
        ...sanitized,
        productLink: sanitized.product ? `/products/${sanitized.product.slug}` : null,
        summary,
        ordersSoldCount: summary.totalSold,
        ordersSold: [], // Populated with Order docs once Phase B8 Orders module is active
      };
    });
  }

  /**
   * Public Storefront Batch Lookup (`GET /api/v1/store/batch/:batchNo`)
   * Strictly returns whitelisted public-safe fields only (docs/PLAN.md §11).
   * Never exposes cost, supplier, stock counts, or buyer details.
   */
  async getPublicBatchByNo(rawBatchNo) {
    if (!rawBatchNo || typeof rawBatchNo !== 'string') {
      throw AppError.badRequest('Batch number is required');
    }

    const batchNo = rawBatchNo.trim().toUpperCase();
    const batch = await Batch.findOne({ batchNo })
      .populate('product', 'name slug brand fabric countryOfOrigin colors status isDeleted')
      .populate('items.variant', 'color size isActive')
      .lean();

    if (!batch || !batch.product || batch.product.isDeleted) {
      throw AppError.notFound('Batch not found');
    }

    const product = batch.product;
    const primaryImages = [];
    if (Array.isArray(product.colors)) {
      for (const c of product.colors) {
        if (Array.isArray(c.images) && c.images.length > 0) {
          primaryImages.push({
            colorName: c.name,
            url: c.images[0].url,
            alt: c.images[0].alt || product.name,
          });
        }
      }
    }

    const variantsInBatch = (batch.items || [])
      .filter((item) => item.variant)
      .map((item) => ({
        color: {
          name: item.variant.color ? item.variant.color.name : '',
          hex: item.variant.color ? item.variant.color.hex : '',
        },
        size: item.variant.size,
      }));

    return {
      batchNo: batch.batchNo,
      authentic: true,
      authenticityMessage: 'Authentic Younora batch',
      receivedOn: batch.receivedOn,
      product: {
        name: product.name,
        slug: product.slug,
        brand: product.brand || 'Younora',
        fabric: product.fabric || '',
        countryOfOrigin: product.countryOfOrigin || 'India',
        productLink: `/products/${product.slug}`,
        images: primaryImages,
      },
      variantsInBatch,
    };
  }

  /**
   * Batch-wise inventory report (`GET /api/v1/admin/reports/batch-wise`)
   */
  async getBatchWiseReport(query = {}, { canViewCost = false } = {}) {
    const filter = {};
    if (query.product) filter.product = query.product;
    if (query.status) filter.status = query.status;

    const batches = await Batch.find(filter)
      .sort({ receivedOn: -1 })
      .populate('product', 'name slug')
      .populate('items.variant', 'sku color size costPrice')
      .lean();

    return batches.map((b) => {
      let totalReceived = 0;
      let totalAvailable = 0;
      let totalReserved = 0;
      let totalSold = 0;
      let totalReturned = 0;
      let totalDamaged = 0;
      let totalCostValuePaise = 0;

      for (const item of b.items) {
        totalReceived += item.qtyReceived || 0;
        totalAvailable += item.qtyAvailable || 0;
        totalReserved += item.qtyReserved || 0;
        totalSold += item.qtySold || 0;
        totalReturned += item.qtyReturned || 0;
        totalDamaged += item.qtyDamaged || 0;

        const unitCost =
          item.costPerUnit ??
          b.costPerUnit ??
          (item.variant && item.variant.costPrice ? item.variant.costPrice : 0);
        totalCostValuePaise += (item.qtyAvailable || 0) * unitCost;
      }

      const row = {
        batchId: b._id,
        batchNo: b.batchNo,
        status: b.status,
        receivedOn: b.receivedOn,
        product: b.product
          ? { _id: b.product._id, name: b.product.name, slug: b.product.slug }
          : null,
        totalReceived,
        totalAvailable,
        totalReserved,
        totalSold,
        totalReturned,
        totalDamaged,
      };

      if (canViewCost) {
        row.supplier = b.supplier;
        row.costPerUnit = b.costPerUnit;
        row.availableStockCostValuationPaise = totalCostValuePaise;
      }

      return row;
    });
  }
}

module.exports = new InventoryService();

