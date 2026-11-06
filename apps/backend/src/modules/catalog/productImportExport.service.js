const xlsx = require('xlsx');
const Product = require('./models/product.model');
const Variant = require('./models/variant.model');
const Audience = require('./models/audience.model');
const Category = require('./models/category.model');
const Subcategory = require('./models/subcategory.model');
const productService = require('./product.service');
const AppError = require('../../core/errors/appError');
const { rupeesToPaise, paiseToRupees } = require('../../core/utils/money');

class ProductImportExportService {
  /**
   * Generate an empty Excel import template with sample row
   */
  generateImportTemplate() {
    const headers = [
      'Audience',
      'Category',
      'Subcategory',
      'Product Name',
      'Description',
      'Fabric',
      'Fit',
      'Pattern',
      'Occasion',
      'Color Name',
      'Color Hex',
      'Image URL 1',
      'Size',
      'MRP (Rupees)',
      'Selling Price (Rupees)',
      'Cost Price (Rupees)',
      'Stock',
      'HSN Code',
      'GST Percent',
    ];

    const sampleRow = [
      'Men',
      'Shirts',
      'Casual Shirts',
      'Sample Royal Silk Shirt',
      '100% Pure mulberry silk shirt',
      'Pure Silk',
      'Slim Fit',
      'Solid',
      'Formal Luxury',
      'Navy Blue',
      '#000080',
      'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      'L',
      2999,
      1999,
      800,
      15,
      '6205',
      12,
    ];

    const ws = xlsx.utils.aoa_to_sheet([headers, sampleRow]);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Template');

    return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  /**
   * Parse and validate an Excel / CSV buffer for bulk product creation
   * Supports dryRun mode
   */
  async processBulkImport(buffer, { dryRun = false } = {}) {
    if (!buffer || !Buffer.isBuffer(buffer)) {
      throw AppError.badRequest('Valid file buffer is required for import');
    }

    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw AppError.badRequest('Workbook does not contain any sheets');
    }

    const rawRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
    if (!rawRows.length) {
      throw AppError.badRequest('Import sheet is empty');
    }

    const errors = [];
    const groupedProducts = new Map();

    // Cache taxonomies
    const [audiences, categories, subcategories] = await Promise.all([
      Audience.find({ isDeleted: false }).lean(),
      Category.find({ isDeleted: false }).lean(),
      Subcategory.find({ isDeleted: false }).lean(),
    ]);

    const audMap = new Map(audiences.map((a) => [a.name.toLowerCase(), a._id]));
    const catMap = new Map(categories.map((c) => [c.name.toLowerCase(), c._id]));
    const subMap = new Map(subcategories.map((s) => [s.name.toLowerCase(), s._id]));

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const rowNum = i + 2; // Excel row index (1-based, row 1 is header)

      const audName = (row['Audience'] || '').trim();
      const catName = (row['Category'] || '').trim();
      const subName = (row['Subcategory'] || '').trim();
      const prodName = (row['Product Name'] || '').trim();
      const description = (row['Description'] || '').trim();
      const colorName = (row['Color Name'] || '').trim();
      const colorHex = (row['Color Hex'] || '').trim();
      const imageUrl = (row['Image URL 1'] || '').trim();
      const size = (row['Size'] || '').toString().trim().toUpperCase();
      const mrpRupees = parseFloat(row['MRP (Rupees)']);
      const sellingRupees = parseFloat(row['Selling Price (Rupees)']);
      const costRupees = parseFloat(row['Cost Price (Rupees)']);
      const stock = parseInt(row['Stock'], 10);
      const hsnCode = (row['HSN Code'] || '').toString().trim();
      const gstPercent = parseInt(row['GST Percent'], 10) || 12;

      // Basic row validations
      if (!prodName) {
        errors.push({ row: rowNum, field: 'Product Name', message: 'Product Name is required' });
        continue;
      }

      const audId = audMap.get(audName.toLowerCase());
      if (!audId) {
        errors.push({ row: rowNum, field: 'Audience', message: `Audience '${audName}' not found` });
      }

      const catId = catMap.get(catName.toLowerCase());
      if (!catId) {
        errors.push({ row: rowNum, field: 'Category', message: `Category '${catName}' not found` });
      }

      const subId = subMap.get(subName.toLowerCase());
      if (!subId) {
        errors.push({ row: rowNum, field: 'Subcategory', message: `Subcategory '${subName}' not found` });
      }

      if (!colorName) {
        errors.push({ row: rowNum, field: 'Color Name', message: 'Color Name is required' });
      }

      if (!size) {
        errors.push({ row: rowNum, field: 'Size', message: 'Size is required' });
      }

      if (isNaN(mrpRupees) || mrpRupees < 0) {
        errors.push({ row: rowNum, field: 'MRP', message: 'MRP must be a non-negative number' });
      }

      if (isNaN(sellingRupees) || sellingRupees < 0) {
        errors.push({ row: rowNum, field: 'Selling Price', message: 'Selling Price must be a non-negative number' });
      }

      if (sellingRupees > mrpRupees) {
        errors.push({ row: rowNum, field: 'Selling Price', message: 'Selling Price cannot exceed MRP' });
      }

      if (isNaN(costRupees) || costRupees < 0) {
        errors.push({ row: rowNum, field: 'Cost Price', message: 'Cost Price must be a non-negative number' });
      }

      const mrpPaise = rupeesToPaise(mrpRupees || 0);
      const sellingPaise = rupeesToPaise(sellingRupees || 0);
      const costPaise = rupeesToPaise(costRupees || 0);

      // Group variants under the product
      const productKey = prodName.toLowerCase();
      if (!groupedProducts.has(productKey)) {
        groupedProducts.set(productKey, {
          name: prodName,
          description: description || `Handcrafted ${prodName} by Younora`,
          audience: audId,
          category: catId,
          subcategory: subId,
          fabric: (row['Fabric'] || '').trim(),
          fit: (row['Fit'] || '').trim(),
          pattern: (row['Pattern'] || '').trim(),
          occasion: (row['Occasion'] || '').trim(),
          hsnCode,
          gstPercent,
          colors: new Map(),
          variants: [],
        });
      }

      const currentProd = groupedProducts.get(productKey);

      // Add color option if not yet added
      const colorKey = colorName.toLowerCase();
      if (!currentProd.colors.has(colorKey)) {
        currentProd.colors.set(colorKey, {
          name: colorName,
          hex: colorHex || '',
          images: [
            {
              url: imageUrl || 'https://res.cloudinary.com/demo/image/upload/v1/placeholder.jpg',
              publicId: `younora/products/import_${Date.now()}_${i}`,
            },
          ],
        });
      }

      currentProd.variants.push({
        color: { name: colorName, hex: colorHex || '' },
        size,
        mrp: mrpPaise,
        sellingPrice: sellingPaise,
        costPrice: costPaise,
        stock: isNaN(stock) ? 0 : Math.max(0, stock),
      });
    }

    if (errors.length > 0 || dryRun) {
      return {
        dryRun,
        totalRows: rawRows.length,
        validProductsCount: errors.length === 0 ? groupedProducts.size : 0,
        errors,
      };
    }

    // Commit products and variant matrices
    const createdProducts = [];
    for (const [, prodData] of groupedProducts) {
      const payload = {
        ...prodData,
        colors: Array.from(prodData.colors.values()),
      };

      const created = await productService.createProduct(payload);
      createdProducts.push(created);
    }

    return {
      dryRun: false,
      totalRows: rawRows.length,
      importedProducts: createdProducts.length,
      errors: [],
    };
  }

  /**
   * Export catalog to an Excel file with costPrice conditional on permission
   */
  async exportCatalog({ canViewCost = false } = {}) {
    const products = await Product.find({ isDeleted: false })
      .populate('audience', 'name')
      .populate('category', 'name')
      .populate('subcategory', 'name')
      .lean();

    const productIds = products.map((p) => p._id);
    const variants = await Variant.find({ product: { $in: productIds } }).lean();

    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    const rows = [];
    for (const v of variants) {
      const prod = productMap.get(v.product.toString());
      if (!prod) continue;

      const row = {
        SKU: v.sku,
        'Product Name': prod.name,
        Audience: prod.audience ? prod.audience.name : '',
        Category: prod.category ? prod.category.name : '',
        Subcategory: prod.subcategory ? prod.subcategory.name : '',
        Color: v.color.name,
        Size: v.size,
        'MRP (Rupees)': paiseToRupees(v.mrp),
        'Selling Price (Rupees)': paiseToRupees(v.sellingPrice),
      };

      if (canViewCost) {
        row['Cost Price (Rupees)'] = paiseToRupees(v.costPrice);
      }

      row['Stock'] = v.stock;
      row['Status'] = prod.status;

      rows.push(row);
    }

    const ws = xlsx.utils.json_to_sheet(rows);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Catalog Export');

    return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }
}

module.exports = new ProductImportExportService();
