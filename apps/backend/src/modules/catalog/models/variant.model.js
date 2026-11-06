const mongoose = require('mongoose');

const variantSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required'],
      index: true,
    },
    sku: {
      type: String,
      required: [true, 'SKU is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    barcode: {
      type: String,
      trim: true,
      default: null,
    },
    color: {
      name: {
        type: String,
        required: [true, 'Variant color name is required'],
        trim: true,
      },
      hex: {
        type: String,
        trim: true,
        default: '',
      },
    },
    size: {
      type: String,
      required: [true, 'Variant size is required'],
      trim: true,
      uppercase: true,
    },
    mrp: {
      type: Number,
      required: [true, 'MRP (in integer paise) is required'],
      min: [0, 'MRP cannot be negative'],
    },
    sellingPrice: {
      type: Number,
      required: [true, 'Selling price (in integer paise) is required'],
      min: [0, 'Selling price cannot be negative'],
      validate: {
        validator: function (val) {
          return val <= this.mrp;
        },
        message: 'Selling price ({VALUE}) cannot exceed MRP',
      },
    },
    costPrice: {
      type: Number,
      required: [true, 'Cost price (in integer paise) is required'],
      min: [0, 'Cost price cannot be negative'],
    },
    stock: {
      type: Number,
      default: 0,
      min: [0, 'Stock cannot be negative'],
    },
    reservedStock: {
      type: Number,
      default: 0,
      min: [0, 'Reserved stock cannot be negative'],
    },
    lowStockThreshold: {
      type: Number,
      default: 5,
      min: [0, 'Low stock threshold cannot be negative'],
    },
    weightGrams: {
      type: Number,
      default: 0,
    },
    lengthCm: {
      type: Number,
      default: 0,
    },
    breadthCm: {
      type: Number,
      default: 0,
    },
    heightCm: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

variantSchema.index({ product: 1, 'color.name': 1, size: 1 }, { unique: true });
variantSchema.index({ product: 1, isActive: 1 });
variantSchema.index({ stock: 1, lowStockThreshold: 1 });

const Variant = mongoose.models.Variant || mongoose.model('Variant', variantSchema);

module.exports = Variant;
