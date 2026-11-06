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

const subcategorySchema = new mongoose.Schema(
  {
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Category is required for a subcategory'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Subcategory name is required'],
      trim: true,
    },
    slug: {
      type: String,
      required: [true, 'Subcategory slug is required'],
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

subcategorySchema.index({ category: 1, slug: 1 }, { unique: true });
subcategorySchema.index({ category: 1, sortOrder: 1, createdAt: 1 });
subcategorySchema.index({ isDeleted: 1, isActive: 1 });

const Subcategory = mongoose.models.Subcategory || mongoose.model('Subcategory', subcategorySchema);

module.exports = Subcategory;

