const Wishlist = require('./models/wishlist.model');
const Product = require('../catalog/models/product.model');
const AppError = require('../../core/errors/appError');

class WishlistService {
  /**
   * Retrieves paginated wishlisted products for a customer
   */
  async getWishlist(customerId, query = {}) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Wishlist.find({ customer: customerId })
        .sort({ addedAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .populate({
          path: 'product',
          select:
            '_id name slug brand fabric colors priceRange rating totalStock status isDeleted',
          match: { isDeleted: false, status: 'ACTIVE' },
        })
        .lean(),
      Wishlist.countDocuments({ customer: customerId }),
    ]);

    // Format output and exclude items where product is deleted or inactive
    const validItems = items
      .filter((item) => item.product !== null)
      .map((item) => ({
        _id: item._id,
        productId: item.product._id,
        addedAt: item.addedAt,
        product: item.product,
      }));

    return {
      data: validItems,
      meta: {
        page,
        limit,
        total: validItems.length,
        totalInWishlist: total,
      },
    };
  }

  /**
   * Adds a product to customer's wishlist idempotently
   */
  async addToWishlist(customerId, productId) {
    const product = await Product.findOne({
      _id: productId,
      isDeleted: false,
      status: 'ACTIVE',
    });

    if (!product) {
      throw AppError.notFound('Product not found or unavailable');
    }

    const item = await Wishlist.findOneAndUpdate(
      { customer: customerId, product: productId },
      { $setOnInsert: { customer: customerId, product: productId, addedAt: new Date() } },
      { new: true, upsert: true }
    )
      .populate('product', '_id name slug brand colors priceRange totalStock')
      .lean();

    return item;
  }

  /**
   * Removes a product from customer's wishlist
   */
  async removeFromWishlist(customerId, productId) {
    const result = await Wishlist.findOneAndDelete({
      customer: customerId,
      product: productId,
    });

    return {
      productId,
      removed: Boolean(result),
    };
  }

  /**
   * Checks if a product is in the customer's wishlist
   */
  async checkInWishlist(customerId, productId) {
    const exists = await Wishlist.exists({
      customer: customerId,
      product: productId,
    });

    return {
      productId,
      inWishlist: Boolean(exists),
    };
  }
}

module.exports = new WishlistService();

