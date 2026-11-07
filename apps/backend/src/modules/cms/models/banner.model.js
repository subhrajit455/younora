const mongoose = require('mongoose');

const bannerImageSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    publicId: { type: String, default: '', trim: true },
  },
  { _id: false }
);

const bannerSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Banner title is required'],
      trim: true,
    },
    subtitle: {
      type: String,
      trim: true,
      default: '',
    },
    link: {
      type: String,
      trim: true,
      default: '/',
    },
    position: {
      type: String,
      enum: ['HERO_MAIN', 'HERO_SIDE', 'CATEGORY_TOP', 'FOOTER_FEATURE'],
      default: 'HERO_MAIN',
      index: true,
    },
    image: {
      desktop: {
        type: bannerImageSchema,
        required: [true, 'Desktop banner image is required'],
      },
      mobile: {
        type: bannerImageSchema,
        default: null,
      },
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    startsAt: {
      type: Date,
      default: null,
    },
    endsAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'banners',
  }
);

bannerSchema.index({ isActive: 1, position: 1, sortOrder: 1 });

const Banner = mongoose.models.Banner || mongoose.model('Banner', bannerSchema);

module.exports = Banner;

