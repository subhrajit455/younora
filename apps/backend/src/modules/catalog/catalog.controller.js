const catalogService = require('./catalog.service');
const Audience = require('./models/audience.model');
const Category = require('./models/category.model');
const Subcategory = require('./models/subcategory.model');
const { sendSuccess } = require('../../core/http/response');

class CatalogController {
  // --- Audience Handlers ---
  async listAudiences(req, res, next) {
    try {
      const result = await catalogService.listAudiences(req.query);
      return sendSuccess(res, {
        message: 'Audiences retrieved successfully',
        data: result.data,
        meta: result.meta,
      });
    } catch (err) {
      return next(err);
    }
  }

  async getAudience(req, res, next) {
    try {
      const data = await catalogService.getAudienceById(req.params.id);
      return sendSuccess(res, {
        message: 'Audience retrieved successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async createAudience(req, res, next) {
    try {
      const data = await catalogService.createAudience(req.body);
      return sendSuccess(res, {
        statusCode: 201,
        message: 'Audience created successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async updateAudience(req, res, next) {
    try {
      const data = await catalogService.updateAudience(req.params.id, req.body);
      return sendSuccess(res, {
        message: 'Audience updated successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async deleteAudience(req, res, next) {
    try {
      const data = await catalogService.deleteAudience(req.params.id);
      return sendSuccess(res, {
        message: 'Audience deleted successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async reorderAudiences(req, res, next) {
    try {
      const data = await catalogService.reorderItems(Audience, req.body.items);
      return sendSuccess(res, {
        message: 'Audiences reordered successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  // --- Category Handlers ---
  async listCategories(req, res, next) {
    try {
      const result = await catalogService.listCategories(req.query);
      return sendSuccess(res, {
        message: 'Categories retrieved successfully',
        data: result.data,
        meta: result.meta,
      });
    } catch (err) {
      return next(err);
    }
  }

  async getCategory(req, res, next) {
    try {
      const data = await catalogService.getCategoryById(req.params.id);
      return sendSuccess(res, {
        message: 'Category retrieved successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async createCategory(req, res, next) {
    try {
      const data = await catalogService.createCategory(req.body);
      return sendSuccess(res, {
        statusCode: 201,
        message: 'Category created successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async updateCategory(req, res, next) {
    try {
      const data = await catalogService.updateCategory(req.params.id, req.body);
      return sendSuccess(res, {
        message: 'Category updated successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async deleteCategory(req, res, next) {
    try {
      const data = await catalogService.deleteCategory(req.params.id);
      return sendSuccess(res, {
        message: 'Category deleted successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async reorderCategories(req, res, next) {
    try {
      const data = await catalogService.reorderItems(Category, req.body.items);
      return sendSuccess(res, {
        message: 'Categories reordered successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  // --- Subcategory Handlers ---
  async listSubcategories(req, res, next) {
    try {
      const result = await catalogService.listSubcategories(req.query);
      return sendSuccess(res, {
        message: 'Subcategories retrieved successfully',
        data: result.data,
        meta: result.meta,
      });
    } catch (err) {
      return next(err);
    }
  }

  async getSubcategory(req, res, next) {
    try {
      const data = await catalogService.getSubcategoryById(req.params.id);
      return sendSuccess(res, {
        message: 'Subcategory retrieved successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async createSubcategory(req, res, next) {
    try {
      const data = await catalogService.createSubcategory(req.body);
      return sendSuccess(res, {
        statusCode: 201,
        message: 'Subcategory created successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async updateSubcategory(req, res, next) {
    try {
      const data = await catalogService.updateSubcategory(req.params.id, req.body);
      return sendSuccess(res, {
        message: 'Subcategory updated successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async deleteSubcategory(req, res, next) {
    try {
      const data = await catalogService.deleteSubcategory(req.params.id);
      return sendSuccess(res, {
        message: 'Subcategory deleted successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async reorderSubcategories(req, res, next) {
    try {
      const data = await catalogService.reorderItems(Subcategory, req.body.items);
      return sendSuccess(res, {
        message: 'Subcategories reordered successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  // --- Public Store Menu ---
  async getStoreMenu(req, res, next) {
    try {
      const data = await catalogService.getStoreMenu();
      return sendSuccess(res, {
        message: 'Store menu retrieved successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  // --- Attribute Handlers ---
  async listAttributes(req, res, next) {
    try {
      const data = await catalogService.listAttributes(req.query);
      return sendSuccess(res, {
        message: 'Attributes retrieved successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async getAttribute(req, res, next) {
    try {
      const data = await catalogService.getAttributeById(req.params.id);
      return sendSuccess(res, {
        message: 'Attribute retrieved successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async createAttribute(req, res, next) {
    try {
      const data = await catalogService.createAttribute(req.body);
      return sendSuccess(res, {
        statusCode: 201,
        message: 'Attribute created successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async updateAttribute(req, res, next) {
    try {
      const data = await catalogService.updateAttribute(req.params.id, req.body);
      return sendSuccess(res, {
        message: 'Attribute updated successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async deleteAttribute(req, res, next) {
    try {
      const data = await catalogService.deleteAttribute(req.params.id);
      return sendSuccess(res, {
        message: 'Attribute deleted successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  // --- Size Chart Handlers ---
  async listSizeCharts(req, res, next) {
    try {
      const result = await catalogService.listSizeCharts(req.query);
      return sendSuccess(res, {
        message: 'Size charts retrieved successfully',
        data: result.data,
        meta: result.meta,
      });
    } catch (err) {
      return next(err);
    }
  }

  async getSizeChart(req, res, next) {
    try {
      const data = await catalogService.getSizeChartById(req.params.id);
      return sendSuccess(res, {
        message: 'Size chart retrieved successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async createSizeChart(req, res, next) {
    try {
      const data = await catalogService.createSizeChart(req.body);
      return sendSuccess(res, {
        statusCode: 201,
        message: 'Size chart created successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async updateSizeChart(req, res, next) {
    try {
      const data = await catalogService.updateSizeChart(req.params.id, req.body);
      return sendSuccess(res, {
        message: 'Size chart updated successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async deleteSizeChart(req, res, next) {
    try {
      const data = await catalogService.deleteSizeChart(req.params.id);
      return sendSuccess(res, {
        message: 'Size chart deleted successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new CatalogController();
