const xlsx = require('xlsx');
const Product = require('../catalog/models/product.model');
const Variant = require('../catalog/models/variant.model');
const Batch = require('./models/batch.model');
const inventoryService = require('./inventory.service');
const { rupeesToPaise } = require('../../core/utils/money');
const AppError = require('../../core/errors/appError');

class BatchImportService {
  /**
   * Generates a downloadable Excel (.xlsx) template for bulk stock receiving
   */
  generateReceiveTemplate() {
    const sampleRows = [
      {
        'Product Slug': 'royal-raw-silk-embroidered-sherwani',
        'Variant SKU': 'YNR-MEN-ROY-ROY-40',
        'Qty Received': 25,
        'Cost Per Unit (INR)': 18000,
        'Batch No': '',
        'Supplier Name': 'Royal Artisans Varanasi',
        'Supplier Ref': 'PO-2026-101',
        Notes: 'Festive season stock receipt',
      },
    ];

    const workbook = xlsx.utils.book_new();
    const sheet = xlsx.utils.json_to_sheet(sampleRows);
    xlsx.utils.book_append_sheet(workbook, sheet, 'StockReceive');

    return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  }

  /**
   * Parses and validates an uploaded Excel/CSV buffer for stock receiving.
   * When dryRun=true, returns row-level validation errors without committing.
   * When dryRun=false, creates batches for valid groups.
   */
  async importStockReceipts(fileBuffer, { dryRun = false, actor = null, canViewCost = false } = {}) {
    if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
      throw AppError.badRequest('Valid spreadsheet file buffer is required');
    }

    const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw AppError.badRequest('Spreadsheet contains no sheets');
    }

    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[firstSheetName], { defval: '' });
    if (!rows.length) {
      throw AppError.badRequest('Spreadsheet contains no data rows');
    }

    const errors = [];
    const groupedBatches = new Map();

    for (let i = 0; i < rows.length; i += 1) {
      const rowNum = i + 2; // 1-based + header row
      const raw = rows[i];

      const productSlug = String(raw['Product Slug'] || '').trim().toLowerCase();
      const variantSku = String(raw['Variant SKU'] || '').trim().toUpperCase();
      const qtyReceived = Number(raw['Qty Received']);
      const rawCostInr = raw['Cost Per Unit (INR)'];
      const customBatchNo = String(raw['Batch No'] || '').trim().toUpperCase();
      const supplierName = String(raw['Supplier Name'] || '').trim();
      const supplierRef = String(raw['Supplier Ref'] || '').trim();
      const notes = String(raw.Notes || '').trim();

      if (!productSlug) {
        errors.push({ row: rowNum, field: 'Product Slug', message: 'Product Slug is required' });
        continue;
      }
      if (!variantSku) {
        errors.push({ row: rowNum, field: 'Variant SKU', message: 'Variant SKU is required' });
        continue;
      }
      if (!Number.isInteger(qtyReceived) || qtyReceived <= 0) {
        errors.push({
          row: rowNum,
          field: 'Qty Received',
          message: 'Qty Received must be a positive integer',
        });
        continue;
      }

      let costPerUnitPaise = null;
      if (rawCostInr !== '' && rawCostInr !== null && rawCostInr !== undefined) {
        const numCost = Number(rawCostInr);
        if (Number.isNaN(numCost) || numCost < 0) {
          errors.push({
            row: rowNum,
            field: 'Cost Per Unit (INR)',
            message: 'Cost Per Unit (INR) must be a non-negative number',
          });
          continue;
        }
        costPerUnitPaise = rupeesToPaise(numCost);
      }

      const product = await Product.findOne({ slug: productSlug, isDeleted: false }).lean();
      if (!product) {
        errors.push({
          row: rowNum,
          field: 'Product Slug',
          message: `Product with slug '${productSlug}' not found`,
        });
        continue;
      }

      const variant = await Variant.findOne({
        sku: variantSku,
        product: product._id,
      }).lean();

      if (!variant) {
        errors.push({
          row: rowNum,
          field: 'Variant SKU',
          message: `Variant SKU '${variantSku}' not found for product '${productSlug}'`,
        });
        continue;
      }

      if (customBatchNo) {
        const existingBatch = await Batch.findOne({ batchNo: customBatchNo }).lean();
        if (existingBatch) {
          errors.push({
            row: rowNum,
            field: 'Batch No',
            message: `Batch number '${customBatchNo}' already exists in database`,
          });
          continue;
        }
      }

      const groupKey = `${product._id.toString()}::${customBatchNo || 'AUTO'}`;
      if (!groupedBatches.has(groupKey)) {
        groupedBatches.set(groupKey, {
          product: product._id,
          batchNo: customBatchNo || undefined,
          supplier: { name: supplierName, ref: supplierRef },
          costPerUnit: costPerUnitPaise,
          notes,
          itemsMap: new Map(),
        });
      }

      const group = groupedBatches.get(groupKey);
      const vidStr = variant._id.toString();
      if (group.itemsMap.has(vidStr)) {
        const existingItem = group.itemsMap.get(vidStr);
        existingItem.qtyReceived += qtyReceived;
      } else {
        group.itemsMap.set(vidStr, {
          variant: variant._id,
          qtyReceived,
          costPerUnit: costPerUnitPaise,
        });
      }
    }

    if (dryRun || errors.length > 0) {
      return {
        dryRun: Boolean(dryRun),
        committed: false,
        totalRows: rows.length,
        validGroupsCount: groupedBatches.size,
        errorsCount: errors.length,
        errors,
      };
    }

    const createdBatches = [];
    for (const group of groupedBatches.values()) {
      const payload = {
        product: group.product,
        batchNo: group.batchNo,
        supplier: group.supplier,
        costPerUnit: group.costPerUnit,
        notes: group.notes,
        items: Array.from(group.itemsMap.values()),
      };
      const created = await inventoryService.createBatch(payload, { actor, canViewCost });
      createdBatches.push(created);
    }

    return {
      dryRun: false,
      committed: true,
      totalRows: rows.length,
      batchesCreatedCount: createdBatches.length,
      batches: createdBatches,
      errorsCount: 0,
      errors: [],
    };
  }
}

module.exports = new BatchImportService();

