const mongoose = require('mongoose');
const {
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  ORDER_SOURCE,
  ORDER_ITEM_STATUS,
} = require('@younora/shared-constants');

const addressSnapshotSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    line1: { type: String, required: true, trim: true },
    line2: { type: String, trim: true, default: '' },
    landmark: { type: String, trim: true, default: '' },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    stateCode: { type: String, required: true, trim: true, default: '07' },
    pincode: { type: String, required: true, trim: true },
    country: { type: String, required: true, default: 'IN' },
  },
  { _id: false }
);

const orderItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    variant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Variant',
      required: true,
    },
    name: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true, uppercase: true },
    color: {
      name: { type: String, required: true, trim: true },
      hex: { type: String, default: '' },
    },
    size: { type: String, required: true, trim: true, uppercase: true },
    image: { type: String, default: null },
    hsnCode: { type: String, default: '', trim: true },
    gstPercent: { type: Number, default: 12 },
    batchNo: { type: String, required: true, trim: true },
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Batch',
      default: null,
    },
    mrp: { type: Number, required: true }, // in integer paise
    baseSellingPrice: { type: Number, required: true }, // in integer paise
    marginPerUnit: { type: Number, default: 0 }, // in integer paise
    sellingPrice: { type: Number, required: true }, // base + margin, what buyer pays
    qty: { type: Number, required: true, min: 1 },
    discount: { type: Number, default: 0 }, // pro-rated coupon discount in integer paise
    taxableValue: { type: Number, required: true }, // in integer paise
    gstAmount: { type: Number, required: true }, // in integer paise
    lineTotal: { type: Number, required: true }, // in integer paise (effective buyer pay for line)
    itemStatus: {
      type: String,
      enum: Object.values(ORDER_ITEM_STATUS),
      default: ORDER_ITEM_STATUS.ACTIVE,
    },
  },
  { _id: false }
);

const orderStatusHistorySchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: Object.values(ORDER_STATUS),
      required: true,
    },
    at: {
      type: Date,
      default: Date.now,
    },
    by: {
      id: { type: mongoose.Schema.Types.ObjectId, default: null },
      role: { type: String, default: 'SYSTEM' },
      name: { type: String, default: 'System' },
    },
    note: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const packingProofSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    publicId: { type: String, default: null },
    type: { type: String, enum: ['IMAGE', 'VIDEO'], default: 'IMAGE' },
    at: { type: Date, default: Date.now },
    by: {
      id: { type: mongoose.Schema.Types.ObjectId, default: null },
      name: { type: String, default: 'Staff' },
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNo: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
      index: true,
    },
    guest: {
      name: { type: String, trim: true, default: null },
      email: { type: String, trim: true, lowercase: true, default: null },
      phone: { type: String, trim: true, default: null },
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (val) => Array.isArray(val) && val.length > 0,
        message: 'Order must have at least one line item',
      },
    },
    shippingAddress: {
      type: addressSnapshotSchema,
      required: true,
    },
    billingAddress: {
      type: addressSnapshotSchema,
      required: true,
    },
    pricing: {
      itemsTotal: { type: Number, required: true }, // in integer paise
      discount: { type: Number, default: 0 },
      couponCode: { type: String, default: null, uppercase: true, trim: true },
      couponDiscount: { type: Number, default: 0 },
      taxableAmount: { type: Number, required: true },
      gstTotal: {
        cgst: { type: Number, default: 0 },
        sgst: { type: Number, default: 0 },
        igst: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
        isIntraState: { type: Boolean, default: true },
      },
      shippingFee: { type: Number, default: 0 },
      codFee: { type: Number, default: 0 },
      roundOff: { type: Number, default: 0 },
      grandTotal: { type: Number, required: true }, // in integer paise
    },
    payment: {
      method: {
        type: String,
        enum: Object.values(PAYMENT_METHOD),
        required: true,
      },
      status: {
        type: String,
        enum: Object.values(PAYMENT_STATUS),
        default: PAYMENT_STATUS.PENDING,
        index: true,
      },
      paidAt: { type: Date, default: null },
      razorpayOrderId: { type: String, default: null, trim: true },
      razorpayPaymentId: { type: String, default: null, trim: true },
    },
    status: {
      type: String,
      enum: Object.values(ORDER_STATUS),
      default: ORDER_STATUS.PENDING_PAYMENT,
      index: true,
    },
    statusHistory: {
      type: [orderStatusHistorySchema],
      default: [],
    },
    codConfirmation: {
      required: { type: Boolean, default: false },
      status: { type: String, enum: ['PENDING', 'CONFIRMED', 'CANCELLED'], default: 'CONFIRMED' },
      at: { type: Date, default: null },
    },
    packingProof: {
      type: [packingProofSchema],
      default: [],
    },
    reselling: {
      isResellerOrder: { type: Boolean, default: false, index: true },
      reseller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customer',
        default: null,
        index: true,
      },
      share: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ResellerShare',
        default: null,
      },
      shareToken: { type: String, default: null },
      baseAmount: { type: Number, default: 0 },
      marginTotal: { type: Number, default: 0 },
      buyerAmount: { type: Number, default: 0 },
    },
    invoices: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Invoice',
      },
    ],
    shipment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shipment',
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    idempotencyKey: {
      type: String,
      trim: true,
      sparse: true,
      unique: true,
    },
    source: {
      type: String,
      enum: Object.values(ORDER_SOURCE),
      default: ORDER_SOURCE.WEB,
    },
    notes: [
      {
        text: { type: String, required: true },
        at: { type: Date, default: Date.now },
        by: { type: String, default: 'Admin' },
      },
    ],
  },
  {
    timestamps: true,
    collection: 'orders',
  }
);

orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ 'reselling.reseller': 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });

const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);

module.exports = Order;

