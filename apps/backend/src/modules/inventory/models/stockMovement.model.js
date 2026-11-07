const mongoose = require('mongoose');
const { STOCK_MOVEMENT_TYPE, STOCK_MOVEMENT_REF_TYPE } = require('@younora/shared-constants');

const stockMovementSchema = new mongoose.Schema(
  {
    variant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Variant',
      required: [true, 'Variant reference is required'],
      index: true,
    },
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Batch',
      default: null,
      index: true,
    },
    type: {
      type: String,
      enum: Object.values(STOCK_MOVEMENT_TYPE),
      required: [true, 'Movement type is required'],
      index: true,
    },
    qty: {
      type: Number,
      required: [true, 'Movement quantity is required'],
      validate: {
        validator: function (val) {
          return Number.isInteger(val) && val !== 0;
        },
        message: 'Movement quantity must be a non-zero integer',
      },
    },
    balanceAfter: {
      type: Number,
      required: [true, 'Balance after movement is required'],
      min: [0, 'Balance after movement cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'balanceAfter must be an integer',
      },
    },
    refType: {
      type: String,
      enum: Object.values(STOCK_MOVEMENT_REF_TYPE),
      default: STOCK_MOVEMENT_REF_TYPE.MANUAL,
    },
    refId: {
      type: String,
      trim: true,
      default: null,
    },
    reason: {
      type: String,
      trim: true,
      default: null,
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
      default: null,
    },
    note: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'stock_movements',
  }
);

// Prevent modification of existing movement ledger records
stockMovementSchema.pre('save', function (next) {
  if (!this.isNew) {
    return next(new Error('StockMovement records are immutable and cannot be modified'));
  }
  next();
});

stockMovementSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function (next) {
  next(new Error('StockMovement records are immutable and cannot be updated'));
});

stockMovementSchema.index({ variant: 1, createdAt: -1 });
stockMovementSchema.index({ batch: 1, createdAt: -1 });
stockMovementSchema.index({ type: 1, createdAt: -1 });

const StockMovement =
  mongoose.models.StockMovement || mongoose.model('StockMovement', stockMovementSchema);

module.exports = StockMovement;

