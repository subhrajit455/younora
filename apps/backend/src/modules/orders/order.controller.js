const orderService = require('./order.service');
const Invoice = require('./models/invoice.model');
const Settings = require('../settings/models/settings.model');
const {
  generateInternalInvoicePdf,
  generateResellingInvoicePdf,
  generatePackingSlipPdf,
} = require('./pdf/invoicePdf');
const { sendSuccess } = require('../../core/http/response');
const { INVOICE_TYPE } = require('@younora/shared-constants');

class OrderController {
  // ---------------------------------------------------------------------------
  // Customer Handlers
  // ---------------------------------------------------------------------------
  async getCustomerOrders(req, res, next) {
    try {
      const data = await orderService.getCustomerOrders(req.user._id, req.query);
      return sendSuccess(res, {
        message: 'Customer orders retrieved successfully',
        data: data.items,
        meta: data.pagination,
      });
    } catch (err) {
      return next(err);
    }
  }

  async getCustomerOrderDetails(req, res, next) {
    try {
      const customerId = req.user?._id || null;
      const guestToken = req.headers['x-guest-token'] || req.query.guestToken || null;

      const order = await orderService.getCustomerOrderDetails(
        req.params.orderNo,
        customerId,
        guestToken
      );

      return sendSuccess(res, {
        message: 'Order details retrieved successfully',
        data: order,
      });
    } catch (err) {
      return next(err);
    }
  }

  async cancelCustomerOrder(req, res, next) {
    try {
      const { reason } = req.body;
      const order = await orderService.cancelCustomerOrder(
        req.params.orderNo,
        req.user._id,
        reason
      );

      return sendSuccess(res, {
        message: 'Order cancelled successfully',
        data: order,
      });
    } catch (err) {
      return next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // Admin Handlers
  // ---------------------------------------------------------------------------
  async getAdminOrders(req, res, next) {
    try {
      const data = await orderService.getAdminOrders(req.query);
      return sendSuccess(res, {
        message: 'Admin orders retrieved successfully',
        data: data.items,
        meta: data.pagination,
      });
    } catch (err) {
      return next(err);
    }
  }

  async getAdminOrderDetails(req, res, next) {
    try {
      const order = await orderService.getAdminOrderDetails(req.params.orderNo);
      return sendSuccess(res, {
        message: 'Admin order details retrieved successfully',
        data: order,
      });
    } catch (err) {
      return next(err);
    }
  }

  async updateOrderStatus(req, res, next) {
    try {
      const { status, note } = req.body;
      const order = await orderService.transitionOrderStatus({
        orderNo: req.params.orderNo,
        targetStatus: status,
        actor: req.user,
        note,
      });

      return sendSuccess(res, {
        message: `Order status updated to '${status}'`,
        data: order,
      });
    } catch (err) {
      return next(err);
    }
  }

  async attachPackingProof(req, res, next) {
    try {
      const order = await orderService.attachPackingProof(
        req.params.orderNo,
        req.body,
        req.user
      );

      return sendSuccess(res, {
        message: 'Packing proof attached successfully',
        data: order,
      });
    } catch (err) {
      return next(err);
    }
  }

  async createManualOrder(req, res, next) {
    try {
      const order = await orderService.createManualOrder(req.body, req.user);
      return sendSuccess(res, {
        statusCode: 201,
        message: 'Manual order created successfully',
        data: order,
      });
    } catch (err) {
      return next(err);
    }
  }

  // ---------------------------------------------------------------------------
  // PDF Streaming Handlers
  // ---------------------------------------------------------------------------
  async downloadInvoice(req, res, next) {
    try {
      const { orderNo, type } = req.params;
      const customerId = req.user?._id || null;
      const order = await orderService.getCustomerOrderDetails(orderNo, customerId);

      const reqType = (type || '').toUpperCase();
      const settings = await Settings.getSettings();

      let pdfBuffer = null;
      if (reqType === 'RESELLING') {
        const inv = await Invoice.findOne({ order: order._id, type: INVOICE_TYPE.RESELLING }) || {
          number: `RINV/${order.orderNo}`,
          generatedAt: order.createdAt,
        };
        pdfBuffer = await generateResellingInvoicePdf(order, inv, settings);
      } else {
        const inv = await Invoice.findOne({ order: order._id, type: INVOICE_TYPE.INTERNAL }) || {
          number: `INV/${order.orderNo}`,
          generatedAt: order.createdAt,
        };
        pdfBuffer = await generateInternalInvoicePdf(order, inv, settings);
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${order.orderNo}-${type}.pdf"`);
      return res.send(pdfBuffer);
    } catch (err) {
      return next(err);
    }
  }

  async getAdminInvoicePdf(req, res, next) {
    try {
      const { orderNo, type } = req.params;
      const order = await orderService.getAdminOrderDetails(orderNo);
      const settings = await Settings.getSettings();
      const reqType = (type || '').toUpperCase();

      let pdfBuffer = null;
      if (reqType === 'PACKING-SLIP' || reqType === 'PACKING_SLIP') {
        pdfBuffer = await generatePackingSlipPdf(order, settings);
      } else if (reqType === 'RESELLING') {
        const inv = await Invoice.findOne({ order: order._id, type: INVOICE_TYPE.RESELLING }) || {
          number: `RINV/${order.orderNo}`,
          generatedAt: order.createdAt,
        };
        pdfBuffer = await generateResellingInvoicePdf(order, inv, settings);
      } else {
        const inv = await Invoice.findOne({ order: order._id, type: INVOICE_TYPE.INTERNAL }) || {
          number: `INV/${order.orderNo}`,
          generatedAt: order.createdAt,
        };
        pdfBuffer = await generateInternalInvoicePdf(order, inv, settings);
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${order.orderNo}-${type}.pdf"`);
      return res.send(pdfBuffer);
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new OrderController();

