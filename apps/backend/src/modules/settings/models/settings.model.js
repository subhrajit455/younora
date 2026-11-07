const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: 'default',
      unique: true,
      immutable: true,
    },
    store: {
      name: { type: String, default: 'Younora' },
      email: { type: String, default: 'concierge@younora.com' },
      phone: { type: String, default: '+91 98765 43210' },
      address: { type: String, default: 'Mehrauli Heritage Lane, New Delhi - 110030' },
      gstin: { type: String, default: '07AAAAA0000A1Z5' },
      stateCode: { type: String, default: '07' }, // Delhi state code
      logo: { type: String, default: null },
    },
    payments: {
      onlineEnabled: { type: Boolean, default: true },
      codEnabled: { type: Boolean, default: true },
      codMinOrder: { type: Number, default: 100000 }, // in integer paise (₹1,000)
      codMaxOrder: { type: Number, default: 5000000 }, // in integer paise (₹50,000)
      codFee: { type: Number, default: 15000 }, // in integer paise (₹150)
      codBlockedPincodes: { type: [String], default: [] },
    },
    shipping: {
      freeShippingAbove: { type: Number, default: 500000 }, // in integer paise (₹5,000)
      flatFee: { type: Number, default: 25000 }, // in integer paise (₹250)
      pickupAddress: { type: String, default: 'Warehouse Hub 1, Gurugram, Haryana' },
      defaultPackaging: { type: String, default: 'Luxury Younora Silk-Lined Hard Box' },
    },
    returns: {
      policyText: {
        type: String,
        default: 'Complimentary 7-day concierge returns for unworn handcrafted garments with tags attached.',
      },
      windowDays: { type: Number, default: 7 },
    },
    tax: {
      pricesInclusiveOfTax: { type: Boolean, default: true },
    },
    invoice: {
      prefix: { type: String, default: 'INV' },
      resellingPrefix: { type: String, default: 'RINV' },
      footerNote: { type: String, default: 'Thank you for choosing Younora Luxury Fashion.' },
      termsText: { type: String, default: 'Subject to Delhi jurisdiction. Handcrafted luxury garments.' },
    },
    reselling: {
      enabled: { type: Boolean, default: true },
      marginLimitsByCategory: {
        type: Map,
        of: new mongoose.Schema(
          {
            minPaise: { type: Number, default: 0 },
            maxPaise: { type: Number, default: null },
            maxPercent: { type: Number, default: 40 },
          },
          { _id: false }
        ),
        default: () => new Map(),
      },
      defaultMaxMarginPercent: { type: Number, default: 40 },
      priceMayExceedMrp: { type: Boolean, default: false },
      couponsAllowedOnResellerOrders: { type: Boolean, default: false },
      holdDays: { type: Number, default: 7 },
      minPayout: { type: Number, default: 100000 }, // in integer paise (₹1,000)
      hiddenFields: {
        type: Map,
        of: Boolean,
        default: () => new Map(),
      },
    },
    notifications: {
      adminEvents: {
        type: Map,
        of: Boolean,
        default: () => new Map(),
      },
    },
    reviews: {
      moderationMode: {
        type: String,
        enum: ['AUTO', 'HOLD'],
        default: 'HOLD',
      },
    },
  },
  {
    timestamps: true,
    collection: 'settings',
  }
);

/**
 * Returns the singleton settings document, creating it with defaults if it does not yet exist.
 * @returns {Promise<Document>}
 */
settingsSchema.statics.getSettings = async function () {
  let doc = await this.findOne({ key: 'default' });
  if (!doc) {
    doc = await this.create({ key: 'default' });
  }
  return doc;
};

const Settings = mongoose.models.Settings || mongoose.model('Settings', settingsSchema);

module.exports = Settings;

