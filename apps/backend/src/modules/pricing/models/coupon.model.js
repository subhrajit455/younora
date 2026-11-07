const mongoose = require('mongoose');
const { COUPON_TYPE, COUPON_SCOPE, PAYMENT_METHOD } = require('@younora/shared-constants');

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Coupon code is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    type: {
      type: String,
      enum: Object.values(COUPON_TYPE),
      required: [true, 'Coupon type is required (PERCENT or FLAT)'],
    },
    value: {
      type: Number,
      required: [true, 'Coupon discount value is required'],
      min: [1, 'Coupon value must be at least 1'],
    },
    maxDiscount: {
      type: Number,
      min: [0, 'Maximum discount cannot be negative'],
      default: null, // in integer paise
    },
    minCartValue: {
      type: Number,
      default: 0, // in integer paise
      min: [0, 'Minimum cart value cannot be negative'],
    },
    scope: {
      type: String,
      enum: Object.values(COUPON_SCOPE),
      default: COUPON_SCOPE.ALL,
    },
    scopeIds: {
      type: [mongoose.Schema.Types.ObjectId],
      default: [],
    },
    usageLimit: {
      type: Number,
      default: null, // null = unlimited total uses
    },
    perUserLimit: {
      type: Number,
      default: 1, // maximum uses per customer
      min: [1, 'perUserLimit must be at least 1'],
    },
    usedCount: {
      type: Number,
      default: 0,
      min: [0, 'usedCount cannot be negative'],
    },
    startsAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    firstOrderOnly: {
      type: Boolean,
      default: false,
    },
    paymentMethodRestriction: {
      type: String,
      enum: [...Object.values(PAYMENT_METHOD), null],
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'coupons',
  }
);

couponSchema.index({ code: 1, isActive: 1 });

const Coupon = mongoose.models.Coupon || mongoose.model('Coupon', couponSchema);

module.exports = Coupon;

