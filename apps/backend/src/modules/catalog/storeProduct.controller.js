const Product = require('./models/product.model');
const Variant = require('./models/variant.model');
const Audience = require('./models/audience.model');
const Category = require('./models/category.model');
const Subcategory = require('./models/subcategory.model');
const { sendSuccess } = require('../../core/http/response');
const AppError = require('../../core/errors/appError');
const mongoose = require('mongoose');

class StoreProductController {
  /**
   * Public product listing with filters, pagination, and sorting
   * GET /api/v1/store/products
   */
  async listStoreProducts(req, res, next) {
    try {
      const {
        page = 1,
        limit = 20,
        search,
        audience,
        category,
        subcategory,
        minPrice,
        maxPrice,
        size,
        color,
        fabric,
        occasion,
        isFeatured,
        isNewArrival,
        isBestSeller,
        sort = 'newest',
      } = req.query;

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

      const filter = {
        status: 'ACTIVE',
        isDeleted: false,
      };

      // Handle audience filter by slug or ObjectId
      if (audience) {
        if (mongoose.Types.ObjectId.isValid(audience)) {
          filter.audience = audience;
        } else {
          const audDoc = await Audience.findOne({ slug: audience.toLowerCase(), isDeleted: false });
          if (audDoc) filter.audience = audDoc._id;
          else return sendSuccess(res, { data: [], meta: { page: pageNum, limit: limitNum, total: 0, totalPages: 0 } });
        }
      }

      // Handle category filter by slug or ObjectId
      if (category) {
        if (mongoose.Types.ObjectId.isValid(category)) {
          filter.category = category;
        } else {
          const catDoc = await Category.findOne({ slug: category.toLowerCase(), isDeleted: false });
          if (catDoc) filter.category = catDoc._id;
          else return sendSuccess(res, { data: [], meta: { page: pageNum, limit: limitNum, total: 0, totalPages: 0 } });
        }
      }

      // Handle subcategory filter by slug or ObjectId
      if (subcategory) {
        if (mongoose.Types.ObjectId.isValid(subcategory)) {
          filter.subcategory = subcategory;
        } else {
          const subDoc = await Subcategory.findOne({ slug: subcategory.toLowerCase(), isDeleted: false });
          if (subDoc) filter.subcategory = subDoc._id;
          else return sendSuccess(res, { data: [], meta: { page: pageNum, limit: limitNum, total: 0, totalPages: 0 } });
        }
      }

      if (fabric) filter.fabric = { $regex: fabric, $options: 'i' };
      if (occasion) filter.occasion = { $regex: occasion, $options: 'i' };
      if (isFeatured === 'true') filter.isFeatured = true;
      if (isNewArrival === 'true') filter.isNewArrival = true;
      if (isBestSeller === 'true') filter.isBestSeller = true;

      // Price filter in paise
      if (minPrice !== undefined || maxPrice !== undefined) {
        filter['priceRange.minSelling'] = {};
        if (minPrice !== undefined) filter['priceRange.minSelling'].$gte = Number(minPrice);
        if (maxPrice !== undefined) filter['priceRange.minSelling'].$lte = Number(maxPrice);
      }

      if (search) {
        filter.$text = { $search: search };
      }

      // Filter by variant size or color
      if (size || color) {
        const variantFilter = { isActive: true };
        if (size) variantFilter.size = size.toUpperCase();
        if (color) variantFilter['color.name'] = { $regex: color, $options: 'i' };
        const matchingProductIds = await Variant.find(variantFilter).distinct('product');
        filter._id = { $in: matchingProductIds };
      }

      // Sorting
      const sortMap = {
        newest: { createdAt: -1 },
        oldest: { createdAt: 1 },
        price_asc: { 'priceRange.minSelling': 1 },
        price_desc: { 'priceRange.maxSelling': -1 },
        rating: { 'rating.avg': -1, 'rating.count': -1 },
        popular: { 'rating.count': -1 },
      };
      const sortOption = sortMap[sort] || sortMap.newest;

      const total = await Product.countDocuments(filter);
      const products = await Product.find(filter)
        .select(
          '_id name slug brand colors priceRange rating isFeatured isNewArrival isBestSeller totalStock audience category subcategory createdAt'
        )
        .populate('audience', 'name slug')
        .populate('category', 'name slug')
        .populate('subcategory', 'name slug')
        .sort(sortOption)
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean();

      return sendSuccess(res, {
        message: 'Products retrieved successfully',
        data: products,
        meta: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum) || 0,
        },
      });
    } catch (err) {
      return next(err);
    }
  }

  /**
   * Public single product details by slug
   * GET /api/v1/store/products/:slug
   */
  async getStoreProductBySlug(req, res, next) {
    try {
      const { slug } = req.params;

      const product = await Product.findOne({
        slug: slug.toLowerCase(),
        status: 'ACTIVE',
        isDeleted: false,
      })
        .populate('audience', 'name slug')
        .populate('category', 'name slug')
        .populate('subcategory', 'name slug')
        .populate('sizeChart', 'name unit columns rows')
        .lean();

      if (!product) {
        throw AppError.notFound('Product not found or currently unavailable');
      }

      // Fetch active variants and strictly exclude costPrice
      const variants = await Variant.find({
        product: product._id,
        isActive: true,
      })
        .select('-costPrice -__v')
        .lean();

      product.variants = variants;

      return sendSuccess(res, {
        message: 'Product retrieved successfully',
        data: product,
      });
    } catch (err) {
      return next(err);
    }
  }

  /**
   * Public recommendations for similar products
   * GET /api/v1/store/products/:slug/similar
   */
  async getSimilarProducts(req, res, next) {
    try {
      const { slug } = req.params;

      const current = await Product.findOne({
        slug: slug.toLowerCase(),
        status: 'ACTIVE',
        isDeleted: false,
      }).select('_id category audience');

      if (!current) {
        throw AppError.notFound('Product not found');
      }

      const similar = await Product.find({
        _id: { $ne: current._id },
        category: current.category,
        status: 'ACTIVE',
        isDeleted: false,
      })
        .select('_id name slug brand colors priceRange rating isFeatured isNewArrival isBestSeller')
        .sort({ 'rating.avg': -1, createdAt: -1 })
        .limit(8)
        .lean();

      return sendSuccess(res, {
        message: 'Similar products retrieved successfully',
        data: similar,
      });
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new StoreProductController();

