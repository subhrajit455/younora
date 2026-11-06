const express = require('express');
const catalogController = require('./catalog.controller');
const validate = require('../../core/middleware/validate');
const authenticate = require('../../core/middleware/authenticate');
const { requirePermission } = require('../../core/middleware/authorize');
const { TOKEN_AUDIENCE, PERMISSIONS } = require('@younora/shared-constants');
const {
  createAudienceSchema,
  updateAudienceSchema,
  createCategorySchema,
  updateCategorySchema,
  createSubcategorySchema,
  updateSubcategorySchema,
  createAttributeSchema,
  updateAttributeSchema,
  queryAttributeSchema,
  createSizeChartSchema,
  updateSizeChartSchema,
  reorderSchema,
  queryPaginationSchema,
} = require('./catalog.validation');

// --- Admin Router ---
const adminRouter = express.Router();
adminRouter.use(authenticate(TOKEN_AUDIENCE.ADMIN));
adminRouter.use(requirePermission(PERMISSIONS.CATEGORIES_MANAGE));

// Audiences
adminRouter.get('/audiences', validate({ query: queryPaginationSchema }), (req, res, next) =>
  catalogController.listAudiences(req, res, next)
);
adminRouter.post('/audiences', validate({ body: createAudienceSchema }), (req, res, next) =>
  catalogController.createAudience(req, res, next)
);
adminRouter.patch('/audiences/reorder', validate({ body: reorderSchema }), (req, res, next) =>
  catalogController.reorderAudiences(req, res, next)
);
adminRouter.get('/audiences/:id', (req, res, next) => catalogController.getAudience(req, res, next));
adminRouter.patch('/audiences/:id', validate({ body: updateAudienceSchema }), (req, res, next) =>
  catalogController.updateAudience(req, res, next)
);
adminRouter.delete('/audiences/:id', (req, res, next) => catalogController.deleteAudience(req, res, next));

// Categories
adminRouter.get('/categories', validate({ query: queryPaginationSchema }), (req, res, next) =>
  catalogController.listCategories(req, res, next)
);
adminRouter.post('/categories', validate({ body: createCategorySchema }), (req, res, next) =>
  catalogController.createCategory(req, res, next)
);
adminRouter.patch('/categories/reorder', validate({ body: reorderSchema }), (req, res, next) =>
  catalogController.reorderCategories(req, res, next)
);
adminRouter.get('/categories/:id', (req, res, next) => catalogController.getCategory(req, res, next));
adminRouter.patch('/categories/:id', validate({ body: updateCategorySchema }), (req, res, next) =>
  catalogController.updateCategory(req, res, next)
);
adminRouter.delete('/categories/:id', (req, res, next) => catalogController.deleteCategory(req, res, next));

// Subcategories
adminRouter.get('/subcategories', validate({ query: queryPaginationSchema }), (req, res, next) =>
  catalogController.listSubcategories(req, res, next)
);
adminRouter.post('/subcategories', validate({ body: createSubcategorySchema }), (req, res, next) =>
  catalogController.createSubcategory(req, res, next)
);
adminRouter.patch('/subcategories/reorder', validate({ body: reorderSchema }), (req, res, next) =>
  catalogController.reorderSubcategories(req, res, next)
);
adminRouter.get('/subcategories/:id', (req, res, next) => catalogController.getSubcategory(req, res, next));
adminRouter.patch('/subcategories/:id', validate({ body: updateSubcategorySchema }), (req, res, next) =>
  catalogController.updateSubcategory(req, res, next)
);
adminRouter.delete('/subcategories/:id', (req, res, next) => catalogController.deleteSubcategory(req, res, next));

// Attributes
adminRouter.get('/attributes', validate({ query: queryAttributeSchema }), (req, res, next) =>
  catalogController.listAttributes(req, res, next)
);
adminRouter.post('/attributes', validate({ body: createAttributeSchema }), (req, res, next) =>
  catalogController.createAttribute(req, res, next)
);
adminRouter.get('/attributes/:id', (req, res, next) => catalogController.getAttribute(req, res, next));
adminRouter.patch('/attributes/:id', validate({ body: updateAttributeSchema }), (req, res, next) =>
  catalogController.updateAttribute(req, res, next)
);
adminRouter.delete('/attributes/:id', (req, res, next) => catalogController.deleteAttribute(req, res, next));

// Size Charts
adminRouter.get('/size-charts', validate({ query: queryPaginationSchema }), (req, res, next) =>
  catalogController.listSizeCharts(req, res, next)
);
adminRouter.post('/size-charts', validate({ body: createSizeChartSchema }), (req, res, next) =>
  catalogController.createSizeChart(req, res, next)
);
adminRouter.get('/size-charts/:id', (req, res, next) => catalogController.getSizeChart(req, res, next));
adminRouter.patch('/size-charts/:id', validate({ body: updateSizeChartSchema }), (req, res, next) =>
  catalogController.updateSizeChart(req, res, next)
);
adminRouter.delete('/size-charts/:id', (req, res, next) => catalogController.deleteSizeChart(req, res, next));

// --- Public Storefront Router ---
const storeRouter = express.Router();
storeRouter.get('/menu', (req, res, next) => catalogController.getStoreMenu(req, res, next));
storeRouter.get('/size-charts/:id', (req, res, next) => catalogController.getSizeChart(req, res, next));

module.exports = {
  adminCatalogRouter: adminRouter,
  storeMenuRouter: storeRouter,
};
