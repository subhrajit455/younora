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

const audienceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Audience name is required'],
      trim: true,
    },
    slug: {
      type: String,
      required: [true, 'Audience slug is required'],
      unique: true,
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

audienceSchema.index({ sortOrder: 1, createdAt: 1 });
audienceSchema.index({ isDeleted: 1, isActive: 1 });

const Audience = mongoose.models.Audience || mongoose.model('Audience', audienceSchema);

module.exports = Audience;
