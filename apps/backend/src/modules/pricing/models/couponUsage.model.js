const mongoose = require('mongoose');

const couponUsageSchema = new mongoose.Schema(
  {
    coupon: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Coupon',
      required: true,
      index: true,
    },
    couponCode: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
      index: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    discountAmount: {
      type: Number,
      default: 0, // in integer paise
    },
    usedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: 'coupon_usages',
  }
);

couponUsageSchema.index({ couponCode: 1, customer: 1 });

const CouponUsage = mongoose.models.CouponUsage || mongoose.model('CouponUsage', couponUsageSchema);

module.exports = CouponUsage;

