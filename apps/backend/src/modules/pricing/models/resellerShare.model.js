const mongoose = require('mongoose');

const resellerShareSchema = new mongoose.Schema(
  {
    reseller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Reseller reference is required'],
      index: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required'],
      index: true,
    },
    token: {
      type: String,
      required: [true, 'Share token is required'],
      unique: true,
      trim: true,
      index: true,
    },
    marginPerUnit: {
      type: Number,
      required: [true, 'Margin per unit in paise is required'],
      min: [0, 'Margin per unit cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'marginPerUnit must be an integer in paise',
      },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    clicks: {
      type: Number,
      default: 0,
    },
    ordersCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    collection: 'reseller_shares',
  }
);

resellerShareSchema.index({ reseller: 1, product: 1 });

const ResellerShare =
  mongoose.models.ResellerShare || mongoose.model('ResellerShare', resellerShareSchema);

module.exports = ResellerShare;

