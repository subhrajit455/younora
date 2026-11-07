const mongoose = require('mongoose');
const { PAYMENT_METHOD } = require('@younora/shared-constants');

const paymentRefundSchema = new mongoose.Schema(
  {
    razorpayRefundId: { type: String, trim: true, default: null },
    amount: { type: Number, required: true }, // in integer paise
    status: { type: String, default: 'PROCESSED' },
    reason: { type: String, default: '' },
    at: { type: Date, default: Date.now },
    manualReturn: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ManualReturn',
      default: null,
    },
  },
  { _id: false }
);

const webhookEventSchema = new mongoose.Schema(
  {
    eventId: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true },
    receivedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const paymentSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    orderNo: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    method: {
      type: String,
      enum: Object.values(PAYMENT_METHOD),
      required: true,
    },
    provider: {
      type: String,
      enum: ['RAZORPAY', 'COD'],
      default: 'RAZORPAY',
    },
    amount: {
      type: Number,
      required: true, // in integer paise
      min: 0,
    },
    currency: {
      type: String,
      default: 'INR',
      trim: true,
    },
    razorpayOrderId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    razorpayPaymentId: {
      type: String,
      trim: true,
      default: null,
      index: true,
    },
    razorpaySignature: {
      type: String,
      trim: true,
      default: null,
    },
    status: {
      type: String,
      enum: ['CREATED', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED', 'PARTIAL_REFUND'],
      default: 'CREATED',
      index: true,
    },
    refunds: {
      type: [paymentRefundSchema],
      default: [],
    },
    webhookEvents: {
      type: [webhookEventSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    collection: 'payments',
  }
);

paymentSchema.index({ order: 1, createdAt: -1 });
paymentSchema.index({ 'webhookEvents.eventId': 1 });

const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);

module.exports = Payment;

