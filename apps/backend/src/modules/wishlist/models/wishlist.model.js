const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer reference is required'],
      index: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required'],
      index: true,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: 'wishlists',
  }
);

// Compound unique index ensuring one wishlist entry per customer and product
wishlistSchema.index({ customer: 1, product: 1 }, { unique: true });
wishlistSchema.index({ customer: 1, addedAt: -1 });

const Wishlist = mongoose.models.Wishlist || mongoose.model('Wishlist', wishlistSchema);

module.exports = Wishlist;

