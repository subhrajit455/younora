const mongoose = require('mongoose');
const { BATCH_STATUS } = require('@younora/shared-constants');

const batchItemSchema = new mongoose.Schema(
  {
    variant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Variant',
      required: [true, 'Variant reference is required in batch item'],
    },
    qtyReceived: {
      type: Number,
      required: [true, 'Quantity received is required'],
      min: [1, 'Quantity received must be at least 1'],
      validate: {
        validator: Number.isInteger,
        message: 'qtyReceived must be an integer',
      },
    },
    qtyAvailable: {
      type: Number,
      required: [true, 'Quantity available is required'],
      min: [0, 'Quantity available cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'qtyAvailable must be an integer',
      },
    },
    qtyReserved: {
      type: Number,
      default: 0,
      min: [0, 'Quantity reserved cannot be negative'],
    },
    qtySold: {
      type: Number,
      default: 0,
      min: [0, 'Quantity sold cannot be negative'],
    },
    qtyReturned: {
      type: Number,
      default: 0,
      min: [0, 'Quantity returned cannot be negative'],
    },
    qtyDamaged: {
      type: Number,
      default: 0,
      min: [0, 'Quantity damaged cannot be negative'],
    },
    costPerUnit: {
      type: Number,
      min: [0, 'Cost per unit (in integer paise) cannot be negative'],
      default: null,
    },
  },
  { _id: false }
);

const batchSchema = new mongoose.Schema(
  {
    batchNo: {
      type: String,
      required: [true, 'Batch number is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required'],
      index: true,
    },
    receivedOn: {
      type: Date,
      default: Date.now,
      required: true,
    },
    supplier: {
      name: {
        type: String,
        trim: true,
        default: '',
      },
      ref: {
        type: String,
        trim: true,
        default: '',
      },
    },
    costPerUnit: {
      type: Number,
      min: [0, 'Cost per unit (in integer paise) cannot be negative'],
      default: null,
    },
    items: {
      type: [batchItemSchema],
      validate: {
        validator: function (arr) {
          return Array.isArray(arr) && arr.length >= 1;
        },
        message: 'Batch must contain at least one variant item',
      },
    },
    status: {
      type: String,
      enum: Object.values(BATCH_STATUS),
      default: BATCH_STATUS.ACTIVE,
      index: true,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for FIFO lookup and reporting
batchSchema.index({ product: 1, status: 1, receivedOn: 1, _id: 1 });
batchSchema.index({ 'items.variant': 1, status: 1, receivedOn: 1, _id: 1 });

const Batch = mongoose.models.Batch || mongoose.model('Batch', batchSchema);

module.exports = Batch;

