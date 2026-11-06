const mongoose = require('mongoose');

const imageSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      trim: true,
      default: null,
    },
    publicId: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { _id: false }
);

const categorySchema = new mongoose.Schema(
  {
    audience: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Audience',
      required: [true, 'Audience is required for a category'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
    },
    slug: {
      type: String,
      required: [true, 'Category slug is required'],
      trim: true,
      lowercase: true,
    },
    image: {
      type: imageSchema,
      default: null,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    defaultSizeChart: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SizeChart',
      default: null,
    },
    isDeleted: {
      type: Boolean,
      default: false,
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

categorySchema.index({ audience: 1, slug: 1 }, { unique: true });
categorySchema.index({ audience: 1, sortOrder: 1, createdAt: 1 });
categorySchema.index({ isDeleted: 1, isActive: 1 });

const Category = mongoose.models.Category || mongoose.model('Category', categorySchema);

module.exports = Category;

