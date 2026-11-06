const mongoose = require('mongoose');
const { PRODUCT_STATUS } = require('@younora/shared-constants');

const colorImageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: [true, 'Image URL is required'],
      trim: true,
    },
    publicId: {
      type: String,
      required: [true, 'Image publicId is required'],
      trim: true,
    },
    alt: {
      type: String,
      trim: true,
      default: '',
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const colorOptionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Color name is required'],
      trim: true,
    },
    hex: {
      type: String,
      trim: true,
      default: '',
    },
    images: {
      type: [colorImageSchema],
      validate: {
        validator: function (imgs) {
          return Array.isArray(imgs) && imgs.length >= 1;
        },
        message: 'At least 1 image is required per color option',
      },
    },
    video: {
      url: { type: String, trim: true, default: null },
      publicId: { type: String, trim: true, default: null },
    },
  },
  { _id: false }
);

const priceRangeSchema = new mongoose.Schema(
  {
    minSelling: { type: Number, default: 0 },
    maxSelling: { type: Number, default: 0 },
    minMrp: { type: Number, default: 0 },
    maxMrp: { type: Number, default: 0 },
  },
  { _id: false }
);

const ratingSchema = new mongoose.Schema(
  {
    avg: { type: Number, default: 0, min: 0, max: 5 },
    count: { type: Number, default: 0, min: 0 },
    breakdown: {
      1: { type: Number, default: 0 },
      2: { type: Number, default: 0 },
      3: { type: Number, default: 0 },
      4: { type: Number, default: 0 },
      5: { type: Number, default: 0 },
    },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },
    slug: {
      type: String,
      required: [true, 'Product slug is required'],
      unique: true,
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      required: [true, 'Product description is required'],
      trim: true,
    },
    highlights: {
      type: [String],
      default: [],
    },
    audience: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Audience',
      required: [true, 'Audience is required'],
      index: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required'],
      index: true,
    },
    subcategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subcategory',
      required: [true, 'Subcategory is required'],
      index: true,
    },
    brand: {
      type: String,
      default: 'Younora',
      trim: true,
    },
    fabric: {
      type: String,
      trim: true,
      default: '',
    },
    fit: {
      type: String,
      trim: true,
      default: '',
    },
    pattern: {
      type: String,
      trim: true,
      default: '',
    },
    occasion: {
      type: String,
      trim: true,
      default: '',
    },
    careInstructions: {
      type: String,
      trim: true,
      default: '',
    },
    countryOfOrigin: {
      type: String,
      default: 'India',
      trim: true,
    },
    hsnCode: {
      type: String,
      trim: true,
      default: '',
    },
    gstPercent: {
      type: Number,
      enum: [0, 5, 12, 18, 28],
      default: 12,
    },
    sizeChart: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SizeChart',
      default: null,
    },
    tags: {
      type: [String],
      default: [],
    },
    seo: {
      title: { type: String, trim: true, default: '' },
      description: { type: String, trim: true, default: '' },
      keywords: { type: [String], default: [] },
    },
    returnPolicyText: {
      type: String,
      default: 'Standard 7-day manual return inspection policy',
      trim: true,
    },
    colors: {
      type: [colorOptionSchema],
      validate: {
        validator: function (clrs) {
          return Array.isArray(clrs) && clrs.length >= 1;
        },
        message: 'Product must have at least one color option',
      },
    },
    priceRange: {
      type: priceRangeSchema,
      default: () => ({ minSelling: 0, maxSelling: 0, minMrp: 0, maxMrp: 0 }),
    },
    rating: {
      type: ratingSchema,
      default: () => ({ avg: 0, count: 0, breakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } }),
    },
    totalStock: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: Object.values(PRODUCT_STATUS),
      default: PRODUCT_STATUS.DRAFT,
      index: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    isNewArrival: {
      type: Boolean,
      default: true,
    },
    isBestSeller: {
      type: Boolean,
      default: false,
    },
    resellingEnabled: {
      type: Boolean,
      default: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

productSchema.index({ audience: 1, category: 1, subcategory: 1, status: 1 });
productSchema.index({ status: 1, createdAt: -1 });
productSchema.index({ isDeleted: 1, status: 1 });
productSchema.index({ name: 'text', tags: 'text', description: 'text' });

const Product = mongoose.models.Product || mongoose.model('Product', productSchema);

module.exports = Product;

