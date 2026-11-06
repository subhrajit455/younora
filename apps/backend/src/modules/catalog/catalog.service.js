const Audience = require('./models/audience.model');
const Category = require('./models/category.model');
const Subcategory = require('./models/subcategory.model');
const Attribute = require('./models/attribute.model');
const SizeChart = require('./models/sizeChart.model');
const { generateSlug } = require('../../core/utils/slug');
const AppError = require('../../core/errors/AppError');

class CatalogService {
  // ==========================================
  // AUDIENCES
  // ==========================================

  async listAudiences({ page = 1, limit = 20, search, isActive, includeInactive = false } = {}) {
    const filter = { isDeleted: false };

    if (isActive !== undefined) {
      filter.isActive = isActive;
    } else if (!includeInactive) {
      // By default list all non-deleted for admin, unless explicitly filtered
    }

    if (search) {
      filter.name = { $regex: search, $options: 'i' };
    }

    const total = await Audience.countDocuments(filter);
    const data = await Audience.find(filter)
      .sort({ sortOrder: 1, createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async getAudienceById(id) {
    const audience = await Audience.findOne({ _id: id, isDeleted: false }).lean();
    if (!audience) {
      throw AppError.notFound('Audience not found');
    }
    return audience;
  }

  async createAudience(data) {
    const slug = data.slug ? generateSlug(data.slug) : generateSlug(data.name);
    if (!slug) {
      throw AppError.badRequest('Valid name or slug is required');
    }

    const existing = await Audience.findOne({ slug, isDeleted: false });
    if (existing) {
      throw AppError.conflict(`Audience with slug '${slug}' already exists`);
    }

    const audience = await Audience.create({
      ...data,
      slug,
    });

    return audience.toObject();
  }

  async updateAudience(id, data) {
    const audience = await Audience.findOne({ _id: id, isDeleted: false });
    if (!audience) {
      throw AppError.notFound('Audience not found');
    }

    if (data.slug || (data.name && data.name !== audience.name)) {
      const newSlug = data.slug ? generateSlug(data.slug) : generateSlug(data.name);
      const existing = await Audience.findOne({
        slug: newSlug,
        _id: { $ne: id },
        isDeleted: false,
      });
      if (existing) {
        throw AppError.conflict(`Audience with slug '${newSlug}' already exists`);
      }
      audience.slug = newSlug;
    }

    if (data.name !== undefined) audience.name = data.name;
    if (data.image !== undefined) audience.image = data.image;
    if (data.sortOrder !== undefined) audience.sortOrder = data.sortOrder;
    if (data.isActive !== undefined) audience.isActive = data.isActive;

    await audience.save();
    return audience.toObject();
  }

  async deleteAudience(id) {
    const audience = await Audience.findOne({ _id: id, isDeleted: false });
    if (!audience) {
      throw AppError.notFound('Audience not found');
    }

    // Check if active or non-deleted categories exist under this audience
    const categoryCount = await Category.countDocuments({
      audience: id,
      isDeleted: false,
    });
    if (categoryCount > 0) {
      throw AppError.conflict('Cannot delete audience with active categories. Please delete or reassign them first.');
    }

    audience.isDeleted = true;
    audience.deletedAt = new Date();
    await audience.save();

    return { id, isDeleted: true };
  }

  // ==========================================
  // CATEGORIES
  // ==========================================

  async listCategories({ audience, page = 1, limit = 20, search, isActive } = {}) {
    const filter = { isDeleted: false };
    if (audience) filter.audience = audience;
    if (isActive !== undefined) filter.isActive = isActive;
    if (search) filter.name = { $regex: search, $options: 'i' };

    const total = await Category.countDocuments(filter);
    const data = await Category.find(filter)
      .populate('audience', 'name slug')
      .populate('defaultSizeChart', 'name unit')
      .sort({ sortOrder: 1, createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async getCategoryById(id) {
    const category = await Category.findOne({ _id: id, isDeleted: false })
      .populate('audience', 'name slug')
      .populate('defaultSizeChart', 'name unit')
      .lean();

    if (!category) {
      throw AppError.notFound('Category not found');
    }
    return category;
  }

  async createCategory(data) {
    // Verify audience exists
    const audience = await Audience.findOne({ _id: data.audience, isDeleted: false });
    if (!audience) {
      throw AppError.notFound('Audience not found');
    }

    const slug = data.slug ? generateSlug(data.slug) : generateSlug(data.name);
    if (!slug) {
      throw AppError.badRequest('Valid name or slug is required');
    }

    const existing = await Category.findOne({
      audience: data.audience,
      slug,
      isDeleted: false,
    });
    if (existing) {
      throw AppError.conflict(`Category with slug '${slug}' already exists under this audience`);
    }

    const category = await Category.create({
      ...data,
      slug,
    });

    return category.toObject();
  }

  async updateCategory(id, data) {
    const category = await Category.findOne({ _id: id, isDeleted: false });
    if (!category) {
      throw AppError.notFound('Category not found');
    }

    const targetAudience = data.audience || category.audience;
    if (data.audience && data.audience.toString() !== category.audience.toString()) {
      const audienceExists = await Audience.findOne({ _id: data.audience, isDeleted: false });
      if (!audienceExists) {
        throw AppError.notFound('Audience not found');
      }
      category.audience = data.audience;
    }

    if (data.slug || data.name || data.audience) {
      const newSlug = data.slug ? generateSlug(data.slug) : generateSlug(data.name || category.name);
      const existing = await Category.findOne({
        audience: targetAudience,
        slug: newSlug,
        _id: { $ne: id },
        isDeleted: false,
      });
      if (existing) {
        throw AppError.conflict(`Category with slug '${newSlug}' already exists under this audience`);
      }
      category.slug = newSlug;
    }

    if (data.name !== undefined) category.name = data.name;
    if (data.image !== undefined) category.image = data.image;
    if (data.sortOrder !== undefined) category.sortOrder = data.sortOrder;
    if (data.isActive !== undefined) category.isActive = data.isActive;
    if (data.defaultSizeChart !== undefined) category.defaultSizeChart = data.defaultSizeChart;

    await category.save();
    return category.toObject();
  }

  async deleteCategory(id) {
    const category = await Category.findOne({ _id: id, isDeleted: false });
    if (!category) {
      throw AppError.notFound('Category not found');
    }

    // Check if non-deleted subcategories exist under this category
    const subcategoryCount = await Subcategory.countDocuments({
      category: id,
      isDeleted: false,
    });
    if (subcategoryCount > 0) {
      throw AppError.conflict('Cannot delete category with active subcategories. Please delete or reassign them first.');
    }

    category.isDeleted = true;
    category.deletedAt = new Date();
    await category.save();

    return { id, isDeleted: true };
  }

  // ==========================================
  // SUBCATEGORIES
  // ==========================================

  async listSubcategories({ category, page = 1, limit = 20, search, isActive } = {}) {
    const filter = { isDeleted: false };
    if (category) filter.category = category;
    if (isActive !== undefined) filter.isActive = isActive;
    if (search) filter.name = { $regex: search, $options: 'i' };

    const total = await Subcategory.countDocuments(filter);
    const data = await Subcategory.find(filter)
      .populate({
        path: 'category',
        select: 'name slug audience',
        populate: { path: 'audience', select: 'name slug' },
      })
      .sort({ sortOrder: 1, createdAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async getSubcategoryById(id) {
    const subcategory = await Subcategory.findOne({ _id: id, isDeleted: false })
      .populate({
        path: 'category',
        select: 'name slug audience',
        populate: { path: 'audience', select: 'name slug' },
      })
      .lean();

    if (!subcategory) {
      throw AppError.notFound('Subcategory not found');
    }
    return subcategory;
  }

  async createSubcategory(data) {
    const category = await Category.findOne({ _id: data.category, isDeleted: false });
    if (!category) {
      throw AppError.notFound('Category not found');
    }

    const slug = data.slug ? generateSlug(data.slug) : generateSlug(data.name);
    if (!slug) {
      throw AppError.badRequest('Valid name or slug is required');
    }

    const existing = await Subcategory.findOne({
      category: data.category,
      slug,
      isDeleted: false,
    });
    if (existing) {
      throw AppError.conflict(`Subcategory with slug '${slug}' already exists under this category`);
    }

    const subcategory = await Subcategory.create({
      ...data,
      slug,
    });

    return subcategory.toObject();
  }

  async updateSubcategory(id, data) {
    const subcategory = await Subcategory.findOne({ _id: id, isDeleted: false });
    if (!subcategory) {
      throw AppError.notFound('Subcategory not found');
    }

    const targetCategory = data.category || subcategory.category;
    if (data.category && data.category.toString() !== subcategory.category.toString()) {
      const categoryExists = await Category.findOne({ _id: data.category, isDeleted: false });
      if (!categoryExists) {
        throw AppError.notFound('Category not found');
      }
      subcategory.category = data.category;
    }

    if (data.slug || data.name || data.category) {
      const newSlug = data.slug ? generateSlug(data.slug) : generateSlug(data.name || subcategory.name);
      const existing = await Subcategory.findOne({
        category: targetCategory,
        slug: newSlug,
        _id: { $ne: id },
        isDeleted: false,
      });
      if (existing) {
        throw AppError.conflict(`Subcategory with slug '${newSlug}' already exists under this category`);
      }
      subcategory.slug = newSlug;
    }

    if (data.name !== undefined) subcategory.name = data.name;
    if (data.image !== undefined) subcategory.image = data.image;
    if (data.sortOrder !== undefined) subcategory.sortOrder = data.sortOrder;
    if (data.isActive !== undefined) subcategory.isActive = data.isActive;

    await subcategory.save();
    return subcategory.toObject();
  }

  async deleteSubcategory(id) {
    const subcategory = await Subcategory.findOne({ _id: id, isDeleted: false });
    if (!subcategory) {
      throw AppError.notFound('Subcategory not found');
    }

    subcategory.isDeleted = true;
    subcategory.deletedAt = new Date();
    await subcategory.save();

    return { id, isDeleted: true };
  }

  // ==========================================
  // REORDERING
  // ==========================================

  async reorderItems(Model, items) {
    const bulkOps = items.map((item) => ({
      updateOne: {
        filter: { _id: item.id },
        update: { $set: { sortOrder: item.sortOrder } },
      },
    }));

    await Model.bulkWrite(bulkOps);
    return { success: true, count: items.length };
  }

  // ==========================================
  // PUBLIC STOREFRONT MENU TREE
  // ==========================================

  async getStoreMenu() {
    // 1. Fetch active, non-deleted audiences
    const audiences = await Audience.find({ isActive: true, isDeleted: false })
      .select('_id name slug image sortOrder')
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean();

    if (!audiences.length) {
      return [];
    }

    const audienceIds = audiences.map((a) => a._id);

    // 2. Fetch active, non-deleted categories for these audiences
    const categories = await Category.find({
      audience: { $in: audienceIds },
      isActive: true,
      isDeleted: false,
    })
      .select('_id audience name slug image sortOrder defaultSizeChart')
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean();

    const categoryIds = categories.map((c) => c._id);

    // 3. Fetch active, non-deleted subcategories for these categories
    const subcategories = await Subcategory.find({
      category: { $in: categoryIds },
      isActive: true,
      isDeleted: false,
    })
      .select('_id category name slug image sortOrder')
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean();

    // 4. Group subcategories by category
    const subcategoriesByCategory = {};
    for (const sub of subcategories) {
      const catId = sub.category.toString();
      if (!subcategoriesByCategory[catId]) {
        subcategoriesByCategory[catId] = [];
      }
      subcategoriesByCategory[catId].push({
        _id: sub._id,
        name: sub.name,
        slug: sub.slug,
        image: sub.image,
        sortOrder: sub.sortOrder,
      });
    }

    // 5. Group categories by audience with their subcategories attached
    const categoriesByAudience = {};
    for (const cat of categories) {
      const audId = cat.audience.toString();
      if (!categoriesByAudience[audId]) {
        categoriesByAudience[audId] = [];
      }
      categoriesByAudience[audId].push({
        _id: cat._id,
        name: cat.name,
        slug: cat.slug,
        image: cat.image,
        sortOrder: cat.sortOrder,
        defaultSizeChart: cat.defaultSizeChart,
        subcategories: subcategoriesByCategory[cat._id.toString()] || [],
      });
    }

    // 6. Assemble full hierarchy
    return audiences.map((aud) => ({
      _id: aud._id,
      name: aud.name,
      slug: aud.slug,
      image: aud.image,
      sortOrder: aud.sortOrder,
      categories: categoriesByAudience[aud._id.toString()] || [],
    }));
  }

  // ==========================================
  // ATTRIBUTES
  // ==========================================

  async listAttributes({ type, isActive, search } = {}) {
    const filter = {};
    if (type) filter.type = type.toUpperCase();
    if (isActive !== undefined) filter.isActive = isActive;
    if (search) filter.name = { $regex: search, $options: 'i' };

    return Attribute.find(filter)
      .sort({ type: 1, sortOrder: 1, name: 1 })
      .lean();
  }

  async getAttributeById(id) {
    const attribute = await Attribute.findById(id).lean();
    if (!attribute) {
      throw AppError.notFound('Attribute not found');
    }
    return attribute;
  }

  async createAttribute(data) {
    const type = data.type.toUpperCase();
    const existing = await Attribute.findOne({ type, name: data.name });
    if (existing) {
      throw AppError.conflict(`Attribute '${data.name}' already exists for type '${type}'`);
    }

    const attribute = await Attribute.create({
      ...data,
      type,
    });

    return attribute.toObject();
  }

  async updateAttribute(id, data) {
    const attribute = await Attribute.findById(id);
    if (!attribute) {
      throw AppError.notFound('Attribute not found');
    }

    if (data.name && data.name !== attribute.name) {
      const existing = await Attribute.findOne({
        type: attribute.type,
        name: data.name,
        _id: { $ne: id },
      });
      if (existing) {
        throw AppError.conflict(`Attribute '${data.name}' already exists for type '${attribute.type}'`);
      }
      attribute.name = data.name;
    }

    if (data.value !== undefined) attribute.value = data.value;
    if (data.sortOrder !== undefined) attribute.sortOrder = data.sortOrder;
    if (data.isActive !== undefined) attribute.isActive = data.isActive;

    await attribute.save();
    return attribute.toObject();
  }

  async deleteAttribute(id) {
    const attribute = await Attribute.findById(id);
    if (!attribute) {
      throw AppError.notFound('Attribute not found');
    }

    await Attribute.deleteOne({ _id: id });
    return { id, deleted: true };
  }

  // ==========================================
  // SIZE CHARTS
  // ==========================================

  async listSizeCharts({ category, page = 1, limit = 20, search } = {}) {
    const filter = { isDeleted: false };
    if (category) filter.category = category;
    if (search) filter.name = { $regex: search, $options: 'i' };

    const total = await SizeChart.countDocuments(filter);
    const data = await SizeChart.find(filter)
      .populate('category', 'name slug audience')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async getSizeChartById(id) {
    const sizeChart = await SizeChart.findOne({ _id: id, isDeleted: false })
      .populate('category', 'name slug')
      .lean();

    if (!sizeChart) {
      throw AppError.notFound('Size chart not found');
    }
    return sizeChart;
  }

  async createSizeChart(data) {
    if (data.category) {
      const category = await Category.findOne({ _id: data.category, isDeleted: false });
      if (!category) {
        throw AppError.notFound('Category not found');
      }
    }

    const sizeChart = await SizeChart.create(data);
    return sizeChart.toObject();
  }

  async updateSizeChart(id, data) {
    const sizeChart = await SizeChart.findOne({ _id: id, isDeleted: false });
    if (!sizeChart) {
      throw AppError.notFound('Size chart not found');
    }

    if (data.category) {
      const category = await Category.findOne({ _id: data.category, isDeleted: false });
      if (!category) {
        throw AppError.notFound('Category not found');
      }
      sizeChart.category = data.category;
    } else if (data.category === null) {
      sizeChart.category = null;
    }

    if (data.name !== undefined) sizeChart.name = data.name;
    if (data.unit !== undefined) sizeChart.unit = data.unit;
    if (data.columns !== undefined) sizeChart.columns = data.columns;
    if (data.rows !== undefined) sizeChart.rows = data.rows;

    await sizeChart.save();
    return sizeChart.toObject();
  }

  async deleteSizeChart(id) {
    const sizeChart = await SizeChart.findOne({ _id: id, isDeleted: false });
    if (!sizeChart) {
      throw AppError.notFound('Size chart not found');
    }

    // Unset defaultSizeChart on categories referencing this
    await Category.updateMany(
      { defaultSizeChart: id },
      { $set: { defaultSizeChart: null } }
    );

    sizeChart.isDeleted = true;
    sizeChart.deletedAt = new Date();
    await sizeChart.save();

    return { id, isDeleted: true };
  }
}

module.exports = new CatalogService();
