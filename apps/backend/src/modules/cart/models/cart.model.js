const mongoose = require('mongoose');
const { PAYMENT_METHOD } = require('@younora/shared-constants');

const cartItemSchema = new mongoose.Schema(
  {
    variant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Variant',
      required: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    qty: {
      type: Number,
      required: true,
      min: [1, 'Quantity must be at least 1'],
      max: [10, 'Maximum 10 units allowed per item'],
      default: 1,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
      index: true,
    },
    guestToken: {
      type: String,
      default: null,
      index: true,
      trim: true,
    },
    items: {
      type: [cartItemSchema],
      default: [],
    },
    couponCode: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    shareToken: {
      type: String,
      trim: true,
      default: null,
    },
    deliveryPincode: {
      type: String,
      trim: true,
      default: null,
    },
    paymentMethod: {
      type: String,
      enum: Object.values(PAYMENT_METHOD),
      default: PAYMENT_METHOD.ONLINE,
    },
  },
  {
    timestamps: true,
    collection: 'carts',
  }
);

cartSchema.index({ customer: 1, updatedAt: -1 });
cartSchema.index({ guestToken: 1, updatedAt: -1 });

const Cart = mongoose.models.Cart || mongoose.model('Cart', cartSchema);

module.exports = Cart;

