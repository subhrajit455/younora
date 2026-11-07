const mongoose = require('mongoose');
const { INVOICE_TYPE } = require('@younora/shared-constants');

const invoiceSchema = new mongoose.Schema(
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
    type: {
      type: String,
      enum: Object.values(INVOICE_TYPE),
      required: true,
      index: true,
    },
    number: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    financialYear: {
      type: String,
      required: true,
      trim: true,
    },
    pdfUrl: {
      type: String,
      default: null,
      trim: true,
    },
    issuedTo: {
      name: { type: String, required: true, trim: true },
      phone: { type: String, default: '', trim: true },
      line1: { type: String, required: true, trim: true },
      line2: { type: String, default: '', trim: true },
      city: { type: String, required: true, trim: true },
      state: { type: String, required: true, trim: true },
      stateCode: { type: String, default: '07', trim: true },
      pincode: { type: String, required: true, trim: true },
      gstin: { type: String, default: '', trim: true },
    },
    totals: {
      taxableAmount: { type: Number, required: true }, // integer paise
      cgst: { type: Number, default: 0 },
      sgst: { type: Number, default: 0 },
      igst: { type: Number, default: 0 },
      totalGst: { type: Number, default: 0 },
      shippingFee: { type: Number, default: 0 },
      codFee: { type: Number, default: 0 },
      discount: { type: Number, default: 0 },
      grandTotal: { type: Number, required: true }, // integer paise
    },
    generatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: 'invoices',
  }
);

invoiceSchema.index({ order: 1, type: 1 }, { unique: true });

const Invoice = mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema);

module.exports = Invoice;

