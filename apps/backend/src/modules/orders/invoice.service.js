const Invoice = require('./models/invoice.model');
const { generateInvoiceNo } = require('../../core/utils/counters');
const { INVOICE_TYPE } = require('@younora/shared-constants');
const logger = require('../../core/logger');

class InvoiceService {
  /**
   * Generates invoice records for an order.
   * Internal invoice is always generated.
   * Reselling invoice is generated if order is a reseller order.
   *
   * @param {Object} order - Full order mongoose document or object
   * @param {import('mongoose').ClientSession} [session]
   */
  async generateInvoicesForOrder(order, session = undefined) {
    const invoices = [];

    // 1. Generate Internal Invoice
    const existingInternal = await Invoice.findOne({
      order: order._id,
      type: INVOICE_TYPE.INTERNAL,
    }).session(session || null);

    if (!existingInternal) {
      const internalNumber = await generateInvoiceNo(INVOICE_TYPE.INTERNAL, undefined, session);
      const internalInvoice = new Invoice({
        order: order._id,
        orderNo: order.orderNo,
        type: INVOICE_TYPE.INTERNAL,
        number: internalNumber,
        financialYear: internalNumber.split('/')[1],
        pdfUrl: `/api/v1/orders/${order.orderNo}/invoices/internal`,
        issuedTo: {
          name: order.billingAddress?.name || order.shippingAddress.name,
          phone: order.billingAddress?.phone || order.shippingAddress.phone,
          line1: order.billingAddress?.line1 || order.shippingAddress.line1,
          line2: order.billingAddress?.line2 || order.shippingAddress.line2 || '',
          city: order.billingAddress?.city || order.shippingAddress.city,
          state: order.billingAddress?.state || order.shippingAddress.state,
          stateCode: order.billingAddress?.stateCode || order.shippingAddress.stateCode || '07',
          pincode: order.billingAddress?.pincode || order.shippingAddress.pincode,
        },
        totals: {
          taxableAmount: order.pricing.taxableAmount,
          cgst: order.pricing.gstTotal.cgst,
          sgst: order.pricing.gstTotal.sgst,
          igst: order.pricing.gstTotal.igst,
          totalGst: order.pricing.gstTotal.total,
          shippingFee: order.pricing.shippingFee,
          codFee: order.pricing.codFee,
          discount: order.pricing.discount,
          grandTotal: order.pricing.grandTotal,
        },
      });

      await internalInvoice.save({ session });
      invoices.push(internalInvoice);
    }

    // 2. Generate Reselling Invoice if this is a reseller order
    if (order.reselling?.isResellerOrder) {
      const existingReselling = await Invoice.findOne({
        order: order._id,
        type: INVOICE_TYPE.RESELLING,
      }).session(session || null);

      if (!existingReselling) {
        const resellingNumber = await generateInvoiceNo(INVOICE_TYPE.RESELLING, undefined, session);
        const resellingInvoice = new Invoice({
          order: order._id,
          orderNo: order.orderNo,
          type: INVOICE_TYPE.RESELLING,
          number: resellingNumber,
          financialYear: resellingNumber.split('/')[1],
          pdfUrl: `/api/v1/orders/${order.orderNo}/invoices/reselling`,
          issuedTo: {
            name: order.shippingAddress.name,
            phone: order.shippingAddress.phone,
            line1: order.shippingAddress.line1,
            line2: order.shippingAddress.line2 || '',
            city: order.shippingAddress.city,
            state: order.shippingAddress.state,
            stateCode: order.shippingAddress.stateCode || '07',
            pincode: order.shippingAddress.pincode,
          },
          totals: {
            taxableAmount: order.pricing.taxableAmount,
            cgst: order.pricing.gstTotal.cgst,
            sgst: order.pricing.gstTotal.sgst,
            igst: order.pricing.gstTotal.igst,
            totalGst: order.pricing.gstTotal.total,
            shippingFee: order.pricing.shippingFee,
            codFee: order.pricing.codFee,
            discount: order.pricing.discount,
            grandTotal: order.pricing.grandTotal,
          },
        });

        await resellingInvoice.save({ session });
        invoices.push(resellingInvoice);
      }
    }

    logger.info({ orderNo: order.orderNo, count: invoices.length }, 'Invoices generated for order');
    return invoices;
  }
}

module.exports = new InvoiceService();

