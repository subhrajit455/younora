const mongoose = require('mongoose');
const Product = require('./models/product.model');
const Variant = require('./models/variant.model');
const Audience = require('./models/audience.model');
const Category = require('./models/category.model');
const Subcategory = require('./models/subcategory.model');
const AppError = require('../../core/errors/appError');

function toArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String).map((s) => s.trim()).filter(Boolean);
  return String(val)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

class StoreProductService {
  /**
   * Helper to resolve audience, category, subcategory from ObjectId or slug
   */
  async resolveTaxonomyFilter(field, value, Model) {
    if (!value) return null;
    if (mongoose.Types.ObjectId.isValid(value)) {
      return value;
    }
    const doc = await Model.findOne({ slug: value.toLowerCase().trim(), isDeleted: false }).lean();
    return doc ? doc._id : 'NOT_FOUND';
  }

  /**
   * Enhanced public product listing with multi-facet filters, sorting, and pagination
   */
  async listProducts(query = {}) {
    const page = Number(query.page) || 1;
    const limit = Number(query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = {
      status: 'ACTIVE',
      isDeleted: false,
    };

    // 1. Resolve taxonomy filters
    if (query.audience) {
      const audId = await this.resolveTaxonomyFilter('audience', query.audience, Audience);
      if (audId === 'NOT_FOUND') {
        return { data: [], meta: { page, limit, total: 0, totalPages: 0 } };
      }
      filter.audience = audId;
    }

    if (query.category) {
      const catId = await this.resolveTaxonomyFilter('category', query.category, Category);
      if (catId === 'NOT_FOUND') {
        return { data: [], meta: { page, limit, total: 0, totalPages: 0 } };
      }
      filter.category = catId;
    }

    if (query.subcategory) {
      const subId = await this.resolveTaxonomyFilter('subcategory', query.subcategory, Subcategory);
      if (subId === 'NOT_FOUND') {
        return { data: [], meta: { page, limit, total: 0, totalPages: 0 } };
      }
      filter.subcategory = subId;
    }

    // 2. Direct product attribute filters
    const fabrics = toArray(query.fabric);
    if (fabrics.length) {
      filter.fabric = { $in: fabrics.map((f) => new RegExp(`^${f}$`, 'i')) };
    }

    const occasions = toArray(query.occasion);
    if (occasions.length) {
      filter.occasion = { $in: occasions.map((o) => new RegExp(`^${o}$`, 'i')) };
    }

    const fits = toArray(query.fit);
    if (fits.length) {
      filter.fit = { $in: fits.map((f) => new RegExp(`^${f}$`, 'i')) };
    }

    const patterns = toArray(query.pattern);
    if (patterns.length) {
      filter.pattern = { $in: patterns.map((p) => new RegExp(`^${p}$`, 'i')) };
    }

    if (query.isFeatured) filter.isFeatured = true;
    if (query.isNewArrival) filter.isNewArrival = true;
    if (query.isBestSeller) filter.isBestSeller = true;

    // 3. Price range filtering (in integer paise)
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      if (query.minPrice !== undefined && query.maxPrice !== undefined) {
        filter['priceRange.minSelling'] = { $lte: Number(query.maxPrice) };
        filter['priceRange.maxSelling'] = { $gte: Number(query.minPrice) };
      } else if (query.minPrice !== undefined) {
        filter['priceRange.maxSelling'] = { $gte: Number(query.minPrice) };
      } else if (query.maxPrice !== undefined) {
        filter['priceRange.minSelling'] = { $lte: Number(query.maxPrice) };
      }
    }

    // 4. Variant-level filters (size, color, inStockOnly, discount)
    const variantFilters = { isActive: true };
    let hasVariantFilter = false;

    const sizes = toArray(query.size);
    if (sizes.length) {
      variantFilters.size = { $in: sizes.map((s) => s.toUpperCase()) };
      hasVariantFilter = true;
    }

    const colors = toArray(query.color);
    if (colors.length) {
      variantFilters['color.name'] = {
        $in: colors.map((c) => new RegExp(`^${c}$`, 'i')),
      };
      hasVariantFilter = true;
    }

    if (query.inStockOnly === true || query.inStockOnly === 'true') {
      variantFilters.stock = { $gt: 0 };
      hasVariantFilter = true;
    }

    if (hasVariantFilter) {
      const matchingProductIds = await Variant.find(variantFilters).distinct('product');
      if (filter._id) {
        filter._id = { $in: matchingProductIds.filter((id) => filter._id.$in.includes(id)) };
      } else {
        filter._id = { $in: matchingProductIds };
      }
    }

    // 5. Search query
    if (query.search) {
      const searchRegex = new RegExp(query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { name: searchRegex },
        { description: searchRegex },
        { tags: searchRegex },
        { fabric: searchRegex },
      ];
    }

    // 6. Sorting
    const sortMap = {
      newest: { createdAt: -1, _id: -1 },
      oldest: { createdAt: 1, _id: 1 },
      price_asc: { 'priceRange.minSelling': 1, _id: 1 },
      price_desc: { 'priceRange.maxSelling': -1, _id: -1 },
      rating: { 'rating.avg': -1, 'rating.count': -1, _id: -1 },
      popular: { totalStock: -1, 'rating.count': -1, _id: -1 },
    };
    const sortOption = sortMap[query.sort] || sortMap.newest;

    const [products, total] = await Promise.all([
      Product.find(filter)
        .select(
          '_id name slug brand fabric colors priceRange rating isFeatured isNewArrival isBestSeller totalStock audience category subcategory createdAt'
        )
        .populate('audience', 'name slug')
        .populate('category', 'name slug')
        .populate('subcategory', 'name slug')
        .sort(sortOption)
        .skip(skip)
        .limit(limit)
        .lean(),
      Product.countDocuments(filter),
    ]);

    return {
      data: products,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  /**
   * Computes dynamic facet aggregations for filters (available sizes, colors, fabrics, occasions, prices)
   */
  async getFilters(query = {}) {
    const filter = {
      status: 'ACTIVE',
      isDeleted: false,
    };

    if (query.audience) {
      const audId = await this.resolveTaxonomyFilter('audience', query.audience, Audience);
      if (audId !== 'NOT_FOUND') filter.audience = audId;
    }
    if (query.category) {
      const catId = await this.resolveTaxonomyFilter('category', query.category, Category);
      if (catId !== 'NOT_FOUND') filter.category = catId;
    }
    if (query.subcategory) {
      const subId = await this.resolveTaxonomyFilter('subcategory', query.subcategory, Subcategory);
      if (subId !== 'NOT_FOUND') filter.subcategory = subId;
    }

    const matchingProducts = await Product.find(filter)
      .select('_id fabric occasion fit pattern priceRange colors')
      .lean();

    if (!matchingProducts.length) {
      return {
        sizes: [],
        colors: [],
        fabrics: [],
        occasions: [],
        fits: [],
        patterns: [],
        priceRange: { min: 0, max: 0 },
      };
    }

    const productIds = matchingProducts.map((p) => p._id);
    const variants = await Variant.find({
      product: { $in: productIds },
      isActive: true,
    })
      .select('size color stock')
      .lean();

    const sizeSet = new Set();
    const colorMap = new Map();
    for (const v of variants) {
      if (v.size) sizeSet.add(v.size.toUpperCase());
      if (v.color && v.color.name) {
        colorMap.set(v.color.name, {
          name: v.color.name,
          hex: v.color.hex || '',
        });
      }
    }

    const fabricSet = new Set();
    const occasionSet = new Set();
    const fitSet = new Set();
    const patternSet = new Set();
    let minPrice = Infinity;
    let maxPrice = 0;

    for (const p of matchingProducts) {
      if (p.fabric) fabricSet.add(p.fabric);
      if (p.occasion) occasionSet.add(p.occasion);
      if (p.fit) fitSet.add(p.fit);
      if (p.pattern) patternSet.add(p.pattern);

      if (p.priceRange) {
        if (typeof p.priceRange.minSelling === 'number' && p.priceRange.minSelling < minPrice) {
          minPrice = p.priceRange.minSelling;
        }
        if (typeof p.priceRange.maxSelling === 'number' && p.priceRange.maxSelling > maxPrice) {
          maxPrice = p.priceRange.maxSelling;
        }
      }
    }

    return {
      sizes: Array.from(sizeSet).sort(),
      colors: Array.from(colorMap.values()),
      fabrics: Array.from(fabricSet).sort(),
      occasions: Array.from(occasionSet).sort(),
      fits: Array.from(fitSet).sort(),
      patterns: Array.from(patternSet).sort(),
      priceRange: {
        min: minPrice === Infinity ? 0 : minPrice,
        max: maxPrice,
      },
    };
  }

  /**
   * Public product detail by slug with grouped variants and breadcrumbs
   */
  async getProductBySlug(slug) {
    if (!slug) throw AppError.notFound('Product slug is required');

    const product = await Product.findOne({
      slug: slug.toLowerCase().trim(),
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

    const variants = await Variant.find({
      product: product._id,
      isActive: true,
    })
      .select('-costPrice -__v')
      .lean();

    // Group variants by color and compute size availability
    const variantsByColor = {};
    for (const v of variants) {
      const colorName = v.color ? v.color.name : 'Standard';
      if (!variantsByColor[colorName]) {
        variantsByColor[colorName] = {
          color: v.color,
          sizes: [],
        };
      }
      variantsByColor[colorName].sizes.push({
        variantId: v._id,
        size: v.size,
        sku: v.sku,
        mrp: v.mrp,
        sellingPrice: v.sellingPrice,
        inStock: (v.stock || 0) > 0,
        stock: v.stock || 0,
      });
    }

    // Build navigation breadcrumbs
    const breadcrumbs = [{ label: 'Home', url: '/' }];
    if (product.audience) {
      breadcrumbs.push({
        label: product.audience.name,
        url: `/catalog/${product.audience.slug}`,
      });
    }
    if (product.category) {
      breadcrumbs.push({
        label: product.category.name,
        url: `/catalog/${product.audience ? product.audience.slug : 'all'}/${product.category.slug}`,
      });
    }
    if (product.subcategory) {
      breadcrumbs.push({
        label: product.subcategory.name,
        url: `/catalog/${product.audience ? product.audience.slug : 'all'}/${product.category ? product.category.slug : 'all'}/${product.subcategory.slug}`,
      });
    }
    breadcrumbs.push({ label: product.name, url: `/products/${product.slug}` });

    return {
      ...product,
      variants,
      colorVariants: Object.values(variantsByColor),
      breadcrumbs,
    };
  }

  /**
   * Recommendations for similar products
   */
  async getSimilarProducts(slug, limit = 8) {
    const current = await Product.findOne({
      slug: slug.toLowerCase().trim(),
      status: 'ACTIVE',
      isDeleted: false,
    }).select('_id category audience tags');

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
      .limit(limit)
      .lean();

    return similar;
  }

  /**
   * Full text search across active products
   */
  async searchProducts(q, limit = 20) {
    if (!q || !q.trim()) return [];

    const searchRegex = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    return Product.find({
      status: 'ACTIVE',
      isDeleted: false,
      $or: [
        { name: searchRegex },
        { description: searchRegex },
        { tags: searchRegex },
        { fabric: searchRegex },
      ],
    })
      .select('_id name slug brand colors priceRange rating isFeatured isNewArrival isBestSeller totalStock')
      .sort({ 'rating.avg': -1, createdAt: -1 })
      .limit(limit)
      .lean();
  }

  /**
   * Fast prefix autocomplete search suggestions
   */
  async suggestSearch(q, limit = 10) {
    if (!q || !q.trim()) return { products: [], categories: [] };

    const regex = new RegExp(`^${q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');

    const [products, categories] = await Promise.all([
      Product.find({
        name: regex,
        status: 'ACTIVE',
        isDeleted: false,
      })
        .select('name slug colors')
        .limit(limit)
        .lean(),
      Category.find({
        name: regex,
        isActive: true,
        isDeleted: false,
      })
        .select('name slug audience')
        .populate('audience', 'name slug')
        .limit(5)
        .lean(),
    ]);

    return {
      products: products.map((p) => {
        let imageUrl = null;
        if (p.colors && p.colors[0] && p.colors[0].images && p.colors[0].images[0]) {
          imageUrl = p.colors[0].images[0].url;
        }
        return {
          name: p.name,
          slug: p.slug,
          image: imageUrl,
        };
      }),
      categories: categories.map((c) => ({
        name: c.name,
        slug: c.slug,
        audience: c.audience ? c.audience.name : '',
      })),
    };
  }
}

module.exports = new StoreProductService();
