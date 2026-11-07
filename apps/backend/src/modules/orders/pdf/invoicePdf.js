const PDFDocument = require('pdfkit');

function formatPaise(paise) {
  const rs = (Number(paise) || 0) / 100;
  return `INR ${rs.toFixed(2)}`;
}

/**
 * Builds Internal GST Tax Invoice PDF (Younora Official Copy)
 * Contains batch number per line item and full GST split.
 */
function generateInternalInvoicePdf(order, invoice, storeSettings = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4', compress: false });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(18).text(storeSettings.store?.name || 'YOUNORA LUXURY ATELIER', { align: 'left' });
      doc.fontSize(9).fillColor('#666666').text('Authentic Indian Luxury Haute Couture & Handcrafted Silks');
      doc.text(`GSTIN: ${storeSettings.store?.gstin || '07AAAAA0000A1Z5'} | State Code: ${storeSettings.store?.stateCode || '07'}`);
      doc.moveDown(1);

      doc.fillColor('#000000').fontSize(14).text('TAX INVOICE (OFFICIAL INTERNAL COPY)', { align: 'right' });
      doc.fontSize(9).text(`Invoice No: ${invoice.number}`, { align: 'right' });
      doc.text(`Invoice Date: ${new Date(invoice.generatedAt || Date.now()).toLocaleDateString('en-IN')}`, { align: 'right' });
      doc.text(`Order No: ${order.orderNo}`, { align: 'right' });
      doc.moveDown(1);

      // Addresses
      const startY = doc.y;
      doc.fontSize(10).fillColor('#000000').text('Billed To:', 40, startY);
      doc.fontSize(9).fillColor('#444444')
        .text(order.billingAddress.name)
        .text(order.billingAddress.line1)
        .text(`${order.billingAddress.city}, ${order.billingAddress.state} - ${order.billingAddress.pincode}`)
        .text(`Phone: ${order.billingAddress.phone}`);

      doc.fontSize(10).fillColor('#000000').text('Shipped To:', 320, startY);
      doc.fontSize(9).fillColor('#444444')
        .text(order.shippingAddress.name)
        .text(order.shippingAddress.line1)
        .text(`${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.pincode}`)
        .text(`Phone: ${order.shippingAddress.phone}`);

      doc.moveDown(2);

      // Table Header
      const tableTop = doc.y;
      doc.fillColor('#000000').fontSize(8);
      doc.text('Item & Description', 40, tableTop);
      doc.text('Batch No', 230, tableTop);
      doc.text('HSN', 310, tableTop);
      doc.text('Qty', 350, tableTop);
      doc.text('Rate', 380, tableTop);
      doc.text('GST', 440, tableTop);
      doc.text('Total', 500, tableTop, { align: 'right', width: 55 });

      doc.moveTo(40, tableTop + 12).lineTo(555, tableTop + 12).stroke('#cccccc');
      let currentY = tableTop + 18;

      // Table Rows
      for (const item of order.items) {
        doc.fontSize(8).fillColor('#333333');
        doc.text(`${item.name} (${item.size})`, 40, currentY, { width: 180 });
        doc.text(item.batchNo || 'N/A', 230, currentY);
        doc.text(item.hsnCode || '6204', 310, currentY);
        doc.text(String(item.qty), 350, currentY);
        doc.text(formatPaise(item.baseSellingPrice), 380, currentY);
        doc.text(`${item.gstPercent}%`, 440, currentY);
        doc.text(formatPaise(item.lineTotal), 500, currentY, { align: 'right', width: 55 });

        currentY += 18;
      }

      doc.moveTo(40, currentY).lineTo(555, currentY).stroke('#cccccc');
      currentY += 10;

      // Summary
      doc.fontSize(9).fillColor('#000000');
      doc.text(`Taxable Value: ${formatPaise(order.pricing.taxableAmount)}`, 350, currentY, { align: 'right', width: 205 });
      currentY += 14;
      if (order.pricing.gstTotal.isIntraState) {
        doc.text(`CGST: ${formatPaise(order.pricing.gstTotal.cgst)}`, 350, currentY, { align: 'right', width: 205 });
        currentY += 14;
        doc.text(`SGST: ${formatPaise(order.pricing.gstTotal.sgst)}`, 350, currentY, { align: 'right', width: 205 });
        currentY += 14;
      } else {
        doc.text(`IGST: ${formatPaise(order.pricing.gstTotal.igst)}`, 350, currentY, { align: 'right', width: 205 });
        currentY += 14;
      }

      if (order.pricing.shippingFee > 0) {
        doc.text(`Shipping Fee: ${formatPaise(order.pricing.shippingFee)}`, 350, currentY, { align: 'right', width: 205 });
        currentY += 14;
      }
      if (order.pricing.codFee > 0) {
        doc.text(`COD Fee: ${formatPaise(order.pricing.codFee)}`, 350, currentY, { align: 'right', width: 205 });
        currentY += 14;
      }
      if (order.pricing.discount > 0) {
        doc.text(`Discount: -${formatPaise(order.pricing.discount)}`, 350, currentY, { align: 'right', width: 205 });
        currentY += 14;
      }

      doc.fontSize(11).fillColor('#000000');
      doc.text(`Grand Total: ${formatPaise(order.pricing.grandTotal)}`, 350, currentY, { align: 'right', width: 205 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Builds Reselling Invoice PDF (Addressed to Buyer)
 * STRICT PRIVACY GUARANTEE: Never exposes baseSellingPrice, marginPerUnit,
 * supplier/cost information, or batch numbers. Shows only unified final price.
 */
function generateResellingInvoicePdf(order, invoice, storeSettings = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4', compress: false });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(18).text(storeSettings.store?.name || 'YOUNORA LUXURY ATELIER', { align: 'left' });
      doc.fontSize(9).fillColor('#666666').text('Premium Designer Collections');
      doc.moveDown(1);

      doc.fillColor('#000000').fontSize(14).text('RETAIL INVOICE', { align: 'right' });
      doc.fontSize(9).text(`Invoice No: ${invoice.number}`, { align: 'right' });
      doc.text(`Invoice Date: ${new Date(invoice.generatedAt || Date.now()).toLocaleDateString('en-IN')}`, { align: 'right' });
      doc.text(`Order No: ${order.orderNo}`, { align: 'right' });
      doc.moveDown(1);

      // Buyer Address
      const startY = doc.y;
      doc.fontSize(10).fillColor('#000000').text('Deliver To:', 40, startY);
      doc.fontSize(9).fillColor('#444444')
        .text(order.shippingAddress.name)
        .text(order.shippingAddress.line1)
        .text(`${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.pincode}`)
        .text(`Contact: ${order.shippingAddress.phone}`);

      doc.moveDown(2);

      // Table Header (Notice: No Batch Column, No Base Price Column, No Margin Column)
      const tableTop = doc.y;
      doc.fillColor('#000000').fontSize(9);
      doc.text('Item Description', 40, tableTop);
      doc.text('Size', 290, tableTop);
      doc.text('Qty', 350, tableTop);
      doc.text('Price', 400, tableTop);
      doc.text('Total', 490, tableTop, { align: 'right', width: 65 });

      doc.moveTo(40, tableTop + 14).lineTo(555, tableTop + 14).stroke('#cccccc');
      let currentY = tableTop + 20;

      for (const item of order.items) {
        doc.fontSize(9).fillColor('#333333');
        doc.text(item.name, 40, currentY, { width: 240 });
        doc.text(item.size, 290, currentY);
        doc.text(String(item.qty), 350, currentY);
        doc.text(formatPaise(item.sellingPrice), 400, currentY);
        doc.text(formatPaise(item.lineTotal), 490, currentY, { align: 'right', width: 65 });

        currentY += 20;
      }

      doc.moveTo(40, currentY).lineTo(555, currentY).stroke('#cccccc');
      currentY += 12;

      // Summary
      doc.fontSize(9).fillColor('#333333');
      doc.text(`Items Total: ${formatPaise(order.pricing.itemsTotal)}`, 350, currentY, { align: 'right', width: 205 });
      currentY += 14;

      if (order.pricing.shippingFee > 0) {
        doc.text(`Shipping: ${formatPaise(order.pricing.shippingFee)}`, 350, currentY, { align: 'right', width: 205 });
        currentY += 14;
      }
      if (order.pricing.codFee > 0) {
        doc.text(`COD Fee: ${formatPaise(order.pricing.codFee)}`, 350, currentY, { align: 'right', width: 205 });
        currentY += 14;
      }
      if (order.pricing.discount > 0) {
        doc.text(`Discount: -${formatPaise(order.pricing.discount)}`, 350, currentY, { align: 'right', width: 205 });
        currentY += 14;
      }

      doc.fontSize(11).fillColor('#000000');
      doc.text(`Amount Payable: ${formatPaise(order.pricing.grandTotal)}`, 350, currentY, { align: 'right', width: 205 });

      doc.moveDown(3);
      doc.fontSize(8).fillColor('#777777').text('Thank you for choosing Younora. For manual inquiries or returns, please contact customer concierge.', 40, doc.y, { align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Builds Packing Slip PDF for Warehouse Dispatch
 */
function generatePackingSlipPdf(order, _storeSettings = {}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4', compress: false });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(16).text('YOUNORA FULFILLMENT PACKING SLIP', { align: 'center' });
      doc.fontSize(9).fillColor('#555555').text(`Order No: ${order.orderNo} | Date: ${new Date(order.createdAt).toLocaleDateString('en-IN')}`, { align: 'center' });
      doc.moveDown(1);

      // Shipping & Dispatch Info
      const startY = doc.y;
      doc.fontSize(10).fillColor('#000000').text('Deliver To:', 40, startY);
      doc.fontSize(9).fillColor('#333333')
        .text(order.shippingAddress.name)
        .text(order.shippingAddress.line1)
        .text(`${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.pincode}`)
        .text(`Phone: ${order.shippingAddress.phone}`);

      doc.fontSize(10).fillColor('#000000').text('Dispatch Details:', 320, startY);
      doc.fontSize(9).fillColor('#333333')
        .text(`Payment Method: ${order.payment.method}`)
        .text(`Payment Status: ${order.payment.status}`)
        .text(order.payment.method === 'COD' ? `COD TO COLLECT: ${formatPaise(order.pricing.grandTotal)}` : 'PREPAID ORDER');

      doc.moveDown(2);

      // Picking List Table
      const tableTop = doc.y;
      doc.fontSize(9).fillColor('#000000');
      doc.text('SKU', 40, tableTop);
      doc.text('Product Name', 150, tableTop);
      doc.text('Color / Size', 310, tableTop);
      doc.text('Batch No', 395, tableTop);
      doc.text('Qty', 515, tableTop, { align: 'right', width: 40 });

      doc.moveTo(40, tableTop + 14).lineTo(555, tableTop + 14).stroke('#cccccc');
      let currentY = tableTop + 20;

      for (const item of order.items) {
        doc.fontSize(8).fillColor('#333333');
        doc.text(item.sku, 40, currentY, { width: 105 });
        doc.text(item.name, 150, currentY, { width: 155 });
        doc.text(`${item.color?.name || ''} / ${item.size}`, 310, currentY, { width: 80 });
        doc.text(item.batchNo || 'N/A', 395, currentY, { width: 115, lineBreak: false });
        doc.text(String(item.qty), 515, currentY, { align: 'right', width: 40 });

        currentY += 18;
      }

      doc.moveTo(40, currentY).lineTo(555, currentY).stroke('#cccccc');
      currentY += 20;

      doc.fontSize(9).fillColor('#000000').text('Quality Checked By: ____________________     Packed By: ____________________', 40, currentY);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  formatPaise,
  generateInternalInvoicePdf,
  generateResellingInvoicePdf,
  generatePackingSlipPdf,
};
