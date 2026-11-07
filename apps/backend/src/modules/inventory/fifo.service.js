const Product = require('../catalog/models/product.model');
const Variant = require('../catalog/models/variant.model');
const Batch = require('./models/batch.model');
const StockMovement = require('./models/stockMovement.model');
const eventBus = require('../../core/events/eventBus');
const AppError = require('../../core/errors/appError');
const {
  BATCH_STATUS,
  STOCK_MOVEMENT_TYPE,
  STOCK_MOVEMENT_REF_TYPE,
  EVENT_NAMES,
} = require('@younora/shared-constants');

class FifoService {
  /**
   * Computes a FIFO allocation plan across active batches without mutating the database.
   * Useful for inspection/preview or verifying batch availability.
   *
   * @param {string|import('mongoose').Types.ObjectId} variantId
   * @param {number} qty
   * @returns {Promise<Array<{ batchId: import('mongoose').Types.ObjectId, batchNo: string, qty: number, costPerUnit: number|null }>>}
   */
  async allocate(variantId, qty) {
    const requestedQty = Number(qty);
    if (!Number.isInteger(requestedQty) || requestedQty <= 0) {
      throw AppError.badRequest('Allocation quantity must be a positive integer');
    }

    const batches = await Batch.find({
      status: BATCH_STATUS.ACTIVE,
      items: {
        $elemMatch: {
          variant: variantId,
          qtyAvailable: { $gt: 0 },
        },
      },
    })
      .sort({ receivedOn: 1, _id: 1 })
      .lean();

    let remaining = requestedQty;
    const splits = [];

    for (const batch of batches) {
      if (remaining <= 0) break;
      const item = batch.items.find(
        (i) => i.variant.toString() === variantId.toString() && i.qtyAvailable > 0
      );
      if (!item) continue;

      const take = Math.min(remaining, item.qtyAvailable);
      splits.push({
        batchId: batch._id,
        batchNo: batch.batchNo,
        qty: take,
        costPerUnit: item.costPerUnit ?? batch.costPerUnit ?? null,
      });
      remaining -= take;
    }

    if (remaining > 0) {
      throw AppError.conflict(
        `Insufficient batch stock for variant ${variantId}: requested ${requestedQty}, short by ${remaining}`
      );
    }

    return splits;
  }

  /**
   * Emits stock.low or stock.out events strictly once when a stock decrement crosses the threshold.
   */
  async emitThresholdEventsIfCrossed(variant, previousStock, newStock) {
    const threshold = variant.lowStockThreshold ?? 5;

    if (previousStock > 0 && newStock === 0) {
      const product = await Product.findById(variant.product).select('name slug').lean();
      eventBus.publish(EVENT_NAMES.STOCK_OUT, {
        productId: variant.product,
        productName: product ? product.name : 'Product',
        variantId: variant._id,
        sku: variant.sku,
        remaining: 0,
        threshold,
      });
    } else if (previousStock > threshold && newStock <= threshold) {
      const product = await Product.findById(variant.product).select('name slug').lean();
      eventBus.publish(EVENT_NAMES.STOCK_LOW, {
        productId: variant.product,
        productName: product ? product.name : 'Product',
        variantId: variant._id,
        sku: variant.sku,
        remaining: newStock,
        threshold,
      });
    }
  }

  /**
   * Atomically reserves `qty` units of `variantId` using FIFO batch allocation.
   * Safe under high concurrency (e.g., 50 parallel requests on stock 10).
   *
   * @param {Object} params
   * @param {string|import('mongoose').Types.ObjectId} params.variantId
   * @param {number} params.qty
   * @param {string} [params.refType]
   * @param {string} [params.refId]
   * @param {string|import('mongoose').Types.ObjectId} [params.actor]
   * @param {string} [params.note]
   */
  async reserveStock({
    variantId,
    qty,
    refType = STOCK_MOVEMENT_REF_TYPE.ORDER,
    refId = null,
    actor = null,
    note = 'Stock reserved via FIFO',
  }) {
    const requestedQty = Number(qty);
    if (!Number.isInteger(requestedQty) || requestedQty <= 0) {
      throw AppError.badRequest('Reservation quantity must be a positive integer');
    }

    // 1. Atomic conditional decrement on Variant (prevents overselling under parallel load)
    const updatedVariant = await Variant.findOneAndUpdate(
      {
        _id: variantId,
        isActive: true,
        stock: { $gte: requestedQty },
      },
      {
        $inc: {
          stock: -requestedQty,
          reservedStock: requestedQty,
        },
      },
      { new: true }
    );

    if (!updatedVariant) {
      throw AppError.conflict('Insufficient stock available for reservation');
    }

    const newVariantStock = updatedVariant.stock;
    const previousVariantStock = newVariantStock + requestedQty;

    // 2. Claim quantities from active batches in FIFO order
    let remaining = requestedQty;
    const claimedSplits = [];
    let runningBalance = previousVariantStock;

    try {
      let attempts = 0;
      while (remaining > 0 && attempts < 10) {
        attempts += 1;
        const candidateBatches = await Batch.find({
          status: BATCH_STATUS.ACTIVE,
          items: {
            $elemMatch: {
              variant: variantId,
              qtyAvailable: { $gt: 0 },
            },
          },
        })
          .sort({ receivedOn: 1, _id: 1 })
          .lean();

        if (!candidateBatches.length) {
          break;
        }

        for (const batch of candidateBatches) {
          if (remaining <= 0) break;
          const item = batch.items.find(
            (i) => i.variant.toString() === variantId.toString() && i.qtyAvailable > 0
          );
          if (!item) continue;

          const take = Math.min(remaining, item.qtyAvailable);

          // Atomically claim `take` units from this batch item
          const claimedBatch = await Batch.findOneAndUpdate(
            {
              _id: batch._id,
              status: BATCH_STATUS.ACTIVE,
              items: {
                $elemMatch: {
                  variant: variantId,
                  qtyAvailable: { $gte: take },
                },
              },
            },
            {
              $inc: {
                'items.$.qtyAvailable': -take,
                'items.$.qtyReserved': take,
              },
            },
            { new: true }
          );

          if (claimedBatch) {
            remaining -= take;
            runningBalance -= take;
            claimedSplits.push({
              batchId: claimedBatch._id,
              batchNo: claimedBatch.batchNo,
              qty: take,
              costPerUnit: item.costPerUnit ?? claimedBatch.costPerUnit ?? null,
              balanceAfter: runningBalance,
            });
          }
        }
      }

      if (remaining > 0) {
        throw AppError.conflict('Insufficient active batch stock to fulfill reservation');
      }

      // 3. Decrement Product denormalized totalStock
      await Product.updateOne(
        { _id: updatedVariant.product },
        { $inc: { totalStock: -requestedQty } }
      );

      // 4. Write immutable StockMovement rows for each batch split
      const movementDocs = claimedSplits.map((split) => ({
        variant: updatedVariant._id,
        batch: split.batchId,
        type: STOCK_MOVEMENT_TYPE.RESERVE,
        qty: -split.qty,
        balanceAfter: split.balanceAfter,
        refType,
        refId,
        actor,
        note: `${note} (${split.batchNo})`,
      }));

      await StockMovement.insertMany(movementDocs);

      // 5. Emit low-stock / out-of-stock event if boundary crossed
      await this.emitThresholdEventsIfCrossed(
        updatedVariant,
        previousVariantStock,
        newVariantStock
      );

      return {
        variantId: updatedVariant._id,
        sku: updatedVariant.sku,
        reservedQty: requestedQty,
        remainingStock: newVariantStock,
        reservedStock: updatedVariant.reservedStock,
        allocations: claimedSplits.map(({ batchId, batchNo, qty: splitQty, costPerUnit }) => ({
          batchId,
          batchNo,
          qty: splitQty,
          costPerUnit,
        })),
      };
    } catch (err) {
      // Compensating rollback if batch claiming failed after variant decrement
      for (const split of claimedSplits) {
        await Batch.updateOne(
          { _id: split.batchId, 'items.variant': variantId },
          {
            $inc: {
              'items.$.qtyAvailable': split.qty,
              'items.$.qtyReserved': -split.qty,
            },
          }
        );
      }

      await Variant.updateOne(
        { _id: variantId },
        {
          $inc: {
            stock: requestedQty,
            reservedStock: -requestedQty,
          },
        }
      );

      throw err;
    }
  }

  /**
   * Releases previously reserved stock back into the original batches and variant.
   */
  async releaseReservation({
    variantId,
    allocations,
    refType = STOCK_MOVEMENT_REF_TYPE.ORDER,
    refId = null,
    actor = null,
    note = 'Reservation released',
  }) {
    if (!Array.isArray(allocations) || !allocations.length) {
      throw AppError.badRequest('Allocations array is required to release reservation');
    }

    const totalQty = allocations.reduce((sum, a) => sum + Number(a.qty), 0);
    if (!Number.isInteger(totalQty) || totalQty <= 0) {
      throw AppError.badRequest('Total release quantity must be a positive integer');
    }

    const updatedVariant = await Variant.findOneAndUpdate(
      {
        _id: variantId,
        reservedStock: { $gte: totalQty },
      },
      {
        $inc: {
          stock: totalQty,
          reservedStock: -totalQty,
        },
      },
      { new: true }
    );

    if (!updatedVariant) {
      throw AppError.conflict('Cannot release more stock than currently reserved');
    }

    let runningBalance = updatedVariant.stock - totalQty;
    const movementDocs = [];

    for (const split of allocations) {
      const splitQty = Number(split.qty);
      await Batch.updateOne(
        {
          _id: split.batchId,
          'items.variant': variantId,
        },
        {
          $inc: {
            'items.$.qtyAvailable': splitQty,
            'items.$.qtyReserved': -splitQty,
          },
          $set: {
            status: BATCH_STATUS.ACTIVE,
          },
        }
      );

      runningBalance += splitQty;
      movementDocs.push({
        variant: updatedVariant._id,
        batch: split.batchId,
        type: STOCK_MOVEMENT_TYPE.RELEASE,
        qty: splitQty,
        balanceAfter: runningBalance,
        refType,
        refId,
        actor,
        note: `${note} (${split.batchNo || split.batchId})`,
      });
    }

    await Product.updateOne(
      { _id: updatedVariant.product },
      { $inc: { totalStock: totalQty } }
    );

    await StockMovement.insertMany(movementDocs);

    return {
      variantId: updatedVariant._id,
      releasedQty: totalQty,
      stock: updatedVariant.stock,
      reservedStock: updatedVariant.reservedStock,
    };
  }

  /**
   * Commits reserved stock to a final sale (decrements reservedStock and increments qtySold).
   * Marks batch EXHAUSTED if all items in the batch have 0 available and 0 reserved.
   */
  async commitReservationToSale({ variantId, allocations }) {
    if (!Array.isArray(allocations) || !allocations.length) {
      throw AppError.badRequest('Allocations array is required to commit sale');
    }

    const totalQty = allocations.reduce((sum, a) => sum + Number(a.qty), 0);

    const updatedVariant = await Variant.findOneAndUpdate(
      {
        _id: variantId,
        reservedStock: { $gte: totalQty },
      },
      {
        $inc: {
          reservedStock: -totalQty,
        },
      },
      { new: true }
    );

    if (!updatedVariant) {
      throw AppError.conflict('Insufficient reserved stock to commit sale');
    }

    for (const split of allocations) {
      const splitQty = Number(split.qty);
      const updatedBatch = await Batch.findOneAndUpdate(
        {
          _id: split.batchId,
          'items.variant': variantId,
        },
        {
          $inc: {
            'items.$.qtyReserved': -splitQty,
            'items.$.qtySold': splitQty,
          },
        },
        { new: true }
      );

      if (updatedBatch) {
        const isExhausted = updatedBatch.items.every(
          (i) => i.qtyAvailable === 0 && i.qtyReserved === 0
        );
        if (isExhausted && updatedBatch.status === BATCH_STATUS.ACTIVE) {
          updatedBatch.status = BATCH_STATUS.EXHAUSTED;
          await updatedBatch.save();
        }
      }
    }

    return {
      variantId: updatedVariant._id,
      soldQty: totalQty,
      stock: updatedVariant.stock,
      reservedStock: updatedVariant.reservedStock,
    };
  }
}

module.exports = new FifoService();
