const Product = require('./models/product.model');
const Variant = require('./models/variant.model');
const Audience = require('./models/audience.model');
const Category = require('./models/category.model');
const Subcategory = require('./models/subcategory.model');
const { generateSlug } = require('../../core/utils/slug');
const { generateSku } = require('../../core/utils/sku');
const { withTransaction } = require('../../core/db/transaction');
const AppError = require('../../core/errors/appError');

class ProductService {
  /**
   * Helper to compute denormalized priceRange and totalStock from a list of variants
   */
  calculateDenormalizedFields(variants) {
    if (!variants || !variants.length) {
      return {
        priceRange: { minSelling: 0, maxSelling: 0, minMrp: 0, maxMrp: 0 },
        totalStock: 0,
      };
    }

    let minSelling = Infinity;
    let maxSelling = -Infinity;
    let minMrp = Infinity;
    let maxMrp = -Infinity;
    let totalStock = 0;

    for (const v of variants) {
      if (v.sellingPrice < minSelling) minSelling = v.sellingPrice;
      if (v.sellingPrice > maxSelling) maxSelling = v.sellingPrice;
      if (v.mrp < minMrp) minMrp = v.mrp;
      if (v.mrp > maxMrp) maxMrp = v.mrp;
      totalStock += Number(v.stock) || 0;
    }

    return {
      priceRange: {
        minSelling: minSelling === Infinity ? 0 : minSelling,
        maxSelling: maxSelling === -Infinity ? 0 : maxSelling,
        minMrp: minMrp === Infinity ? 0 : minMrp,
        maxMrp: maxMrp === -Infinity ? 0 : maxMrp,
      },
      totalStock,
    };
  }

  /**
   * Atomic creation of Product and its Variant matrix in a transaction
   */
  async createProduct(data) {
    // 1. Verify taxonomy relations exist
    const [audience, category, subcategory] = await Promise.all([
      Audience.findOne({ _id: data.audience, isDeleted: false }),
      Category.findOne({ _id: data.category, isDeleted: false }),
      Subcategory.findOne({ _id: data.subcategory, isDeleted: false }),
    ]);

    if (!audience) throw AppError.notFound('Audience not found');
    if (!category) throw AppError.notFound('Category not found');
    if (!subcategory) throw AppError.notFound('Subcategory not found');

    // 2. Validate color names
    const definedColorNames = new Set(data.colors.map((c) => c.name.toLowerCase()));
    for (const v of data.variants) {
      if (!definedColorNames.has(v.color.name.toLowerCase())) {
        throw AppError.badRequest(
          `Variant color '${v.color.name}' does not match any color defined in product colors list`
        );
      }
    }

    // 3. Resolve slug
    const slug = data.slug ? generateSlug(data.slug) : generateSlug(data.name);
    if (!slug) throw AppError.badRequest('Valid name or slug is required');

    const existingSlug = await Product.findOne({ slug, isDeleted: false });
    if (existingSlug) {
      throw AppError.conflict(`Product with slug '${slug}' already exists`);
    }

    // 4. Generate SKUs and validate unique combinations
    const variantComboSet = new Set();
    const finalVariants = [];

    for (const v of data.variants) {
      const comboKey = `${v.color.name.toLowerCase()}_${v.size.toUpperCase()}`;
      if (variantComboSet.has(comboKey)) {
        throw AppError.conflict(`Duplicate variant combination: color '${v.color.name}', size '${v.size}'`);
      }
      variantComboSet.add(comboKey);

      const sku =
        v.sku ||
        generateSku({
          category: category.name,
          product: data.name,
          color: v.color.name,
          size: v.size,
        });

      finalVariants.push({
        ...v,
        sku,
      });
    }

    // Check SKU collisions
    const skusToCheck = finalVariants.map((v) => v.sku);
    const existingSkus = await Variant.find({ sku: { $in: skusToCheck } });
    if (existingSkus.length > 0) {
      const duplicateSkuList = existingSkus.map((s) => s.sku).join(', ');
      throw AppError.conflict(`SKU already exists: ${duplicateSkuList}`);
    }

    // 5. Compute denormalized stats
    const { priceRange, totalStock } = this.calculateDenormalizedFields(finalVariants);

    // 6. Execute atomic transaction
    return withTransaction(async (session) => {
      const createOptions = session ? { session } : {};

      const [product] = await Product.create(
        [
          {
            ...data,
            slug,
            priceRange,
            totalStock,
          },
        ],
        createOptions
      );

      const variantDocs = finalVariants.map((v) => ({
        ...v,
        product: product._id,
      }));

      const createdVariants = await Variant.insertMany(variantDocs, createOptions);

      const result = product.toObject();
      result.variants = createdVariants.map((v) => v.toObject());
      return result;
    });
  }

  /**
   * Atomic update of Product and its Variant matrix in a transaction
   */
  async updateProduct(id, data) {
    const product = await Product.findOne({ _id: id, isDeleted: false });
    if (!product) throw AppError.notFound('Product not found');

    return withTransaction(async (session) => {
      const txOptions = session ? { session } : {};

      // Check slug uniqueness if changed
      if (data.slug || (data.name && data.name !== product.name)) {
        const newSlug = data.slug ? generateSlug(data.slug) : generateSlug(data.name);
        const existing = await Product.findOne({
          slug: newSlug,
          _id: { $ne: id },
          isDeleted: false,
        });
        if (existing) {
          throw AppError.conflict(`Product with slug '${newSlug}' already exists`);
        }
        product.slug = newSlug;
      }

      // If variants are provided, update the matrix
      let currentVariants = await Variant.find({ product: id });

      if (data.variants && data.variants.length > 0) {
        // Fetch category name for SKU generation
        const category = await Category.findById(data.category || product.category);

        const newVariants = [];
        const variantComboSet = new Set();

        for (const v of data.variants) {
          const comboKey = `${v.color.name.toLowerCase()}_${v.size.toUpperCase()}`;
          if (variantComboSet.has(comboKey)) {
            throw AppError.conflict(`Duplicate variant combination: color '${v.color.name}', size '${v.size}'`);
          }
          variantComboSet.add(comboKey);

          const sku =
            v.sku ||
            generateSku({
              category: category ? category.name : 'CAT',
              product: data.name || product.name,
              color: v.color.name,
              size: v.size,
            });

          newVariants.push({
            ...v,
            sku,
            product: id,
          });
        }

        // Delete previous variants for product and replace
        await Variant.deleteMany({ product: id }, txOptions);
        currentVariants = await Variant.insertMany(newVariants, txOptions);

        // Recalculate denormalized fields
        const { priceRange, totalStock } = this.calculateDenormalizedFields(currentVariants);
        product.priceRange = priceRange;
        product.totalStock = totalStock;
      }

      // Update remaining fields on product
      const allowedFields = [
        'name',
        'description',
        'highlights',
        'audience',
        'category',
        'subcategory',
        'brand',
        'fabric',
        'fit',
        'pattern',
        'occasion',
        'careInstructions',
        'countryOfOrigin',
        'hsnCode',
        'gstPercent',
        'sizeChart',
        'tags',
        'seo',
        'returnPolicyText',
        'colors',
        'status',
        'isFeatured',
        'isNewArrival',
        'isBestSeller',
        'resellingEnabled',
      ];

      for (const field of allowedFields) {
        if (data[field] !== undefined) {
          product[field] = data[field];
        }
      }

      await product.save(txOptions);

      const result = product.toObject();
      result.variants = currentVariants.map((v) => (v.toObject ? v.toObject() : v));
      return result;
    });
  }

  /**
   * Retrieve single product with variants (redacting costPrice if unauthorized)
   */
  async getProductById(id, { canViewCost = false } = {}) {
    const product = await Product.findOne({ _id: id, isDeleted: false })
      .populate('audience', 'name slug')
      .populate('category', 'name slug')
      .populate('subcategory', 'name slug')
      .populate('sizeChart', 'name unit columns rows')
      .lean();

    if (!product) throw AppError.notFound('Product not found');

    const variants = await Variant.find({ product: id }).lean();

    if (!canViewCost) {
      for (const v of variants) {
        delete v.costPrice;
      }
    }

    product.variants = variants;
    return product;
  }

  /**
   * List products with filtering, search, lowStock filter, and pagination
   */
  async listProducts(query = {}, { canViewCost = false } = {}) {
    const {
      page = 1,
      limit = 20,
      search,
      audience,
      category,
      subcategory,
      status,
      lowStock,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const filter = { isDeleted: false };
    if (audience) filter.audience = audience;
    if (category) filter.category = category;
    if (subcategory) filter.subcategory = subcategory;
    if (status) filter.status = status;

    if (search) {
      filter.$text = { $search: search };
    }

    if (lowStock) {
      // Find products that have variants with stock <= lowStockThreshold
      const lowStockVariants = await Variant.find({
        $expr: { $lte: ['$stock', '$lowStockThreshold'] },
      }).distinct('product');
      filter._id = { $in: lowStockVariants };
    }

    const sortOption = {};
    if (sortBy === 'price') {
      sortOption['priceRange.minSelling'] = sortOrder === 'asc' ? 1 : -1;
    } else {
      sortOption[sortBy] = sortOrder === 'asc' ? 1 : -1;
    }

    const total = await Product.countDocuments(filter);
    const products = await Product.find(filter)
      .populate('audience', 'name slug')
      .populate('category', 'name slug')
      .populate('subcategory', 'name slug')
      .sort(sortOption)
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // Fetch and attach variants
    const productIds = products.map((p) => p._id);
    const allVariants = await Variant.find({ product: { $in: productIds } }).lean();

    const variantsByProduct = {};
    for (const v of allVariants) {
      if (!canViewCost) delete v.costPrice;
      const pid = v.product.toString();
      if (!variantsByProduct[pid]) variantsByProduct[pid] = [];
      variantsByProduct[pid].push(v);
    }

    for (const p of products) {
      p.variants = variantsByProduct[p._id.toString()] || [];
    }

    return {
      data: products,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Update product status (DRAFT, ACTIVE, HIDDEN)
   */
  async updateProductStatus(id, status) {
    const product = await Product.findOne({ _id: id, isDeleted: false });
    if (!product) throw AppError.notFound('Product not found');

    product.status = status;
    await product.save();
    return product.toObject();
  }

  /**
   * Duplicate product as a DRAFT copy with unique slug and new SKUs
   */
  async duplicateProduct(id) {
    const original = await Product.findOne({ _id: id, isDeleted: false }).lean();
    if (!original) throw AppError.notFound('Product not found');

    const originalVariants = await Variant.find({ product: id }).lean();

    return withTransaction(async (session) => {
      const txOptions = session ? { session } : {};
      const timestamp = Date.now();
      const newSlug = `${original.slug}-copy-${timestamp}`;
      const newName = `${original.name} (Copy)`;

      delete original._id;
      delete original.createdAt;
      delete original.updatedAt;

      const [clonedProduct] = await Product.create(
        [
          {
            ...original,
            name: newName,
            slug: newSlug,
            status: 'DRAFT',
          },
        ],
        txOptions
      );

      const clonedVariants = originalVariants.map((v, idx) => {
        delete v._id;
        delete v.createdAt;
        delete v.updatedAt;
        return {
          ...v,
          product: clonedProduct._id,
          sku: `${v.sku}-CPY-${timestamp.toString().slice(-4)}${idx}`,
        };
      });

      const insertedVariants = await Variant.insertMany(clonedVariants, txOptions);

      const result = clonedProduct.toObject();
      result.variants = insertedVariants.map((v) => v.toObject());
      return result;
    });
  }

  /**
   * Soft delete a product and deactivate its variants
   */
  async deleteProduct(id) {
    const product = await Product.findOne({ _id: id, isDeleted: false });
    if (!product) throw AppError.notFound('Product not found');

    product.isDeleted = true;
    product.deletedAt = new Date();
    await product.save();

    await Variant.updateMany({ product: id }, { $set: { isActive: false } });

    return { id, isDeleted: true };
  }
}

module.exports = new ProductService();
