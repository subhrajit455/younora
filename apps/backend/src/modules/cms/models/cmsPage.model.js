const mongoose = require('mongoose');

const cmsPageSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: [true, 'CMS page slug is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },
    title: {
      type: String,
      required: [true, 'CMS page title is required'],
      trim: true,
    },
    content: {
      type: String,
      required: [true, 'CMS page content is required'],
      trim: true,
    },
    seo: {
      title: { type: String, trim: true, default: '' },
      description: { type: String, trim: true, default: '' },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'cms_pages',
  }
);

const CmsPage = mongoose.models.CmsPage || mongoose.model('CmsPage', cmsPageSchema);

module.exports = CmsPage;

