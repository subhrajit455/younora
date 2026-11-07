const Order = require('./models/order.model');
const Payment = require('../payments/models/payment.model');
const Variant = require('../catalog/models/variant.model');
const Settings = require('../settings/models/settings.model');
const fifoService = require('../inventory/fifo.service');
const razorpayService = require('../payments/razorpay.service');
const invoiceService = require('./invoice.service');
const { generateOrderNo } = require('../../core/utils/counters');
const { calculatePriceBreakup } = require('../pricing/pricing.engine');
const eventBus = require('../../core/events/eventBus');
const AppError = require('../../core/errors/appError');
const logger = require('../../core/logger');
const {
  ORDER_STATUS,
  PAYMENT_STATUS,
  PAYMENT_METHOD,
  ORDER_SOURCE,
  ORDER_ITEM_STATUS,
  PRODUCT_STATUS,
  EVENT_NAMES,
} = require('@younora/shared-constants');

// Allowed state transitions per docs/PLAN.md §6.6
const ALLOWED_TRANSITIONS = {
  [ORDER_STATUS.PENDING_PAYMENT]: [ORDER_STATUS.CONFIRMED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.CONFIRMED]: [ORDER_STATUS.PACKED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.PACKED]: [ORDER_STATUS.READY_TO_SHIP, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.READY_TO_SHIP]: [ORDER_STATUS.SHIPPED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.SHIPPED]: [ORDER_STATUS.OUT_FOR_DELIVERY, ORDER_STATUS.RTO],
  [ORDER_STATUS.OUT_FOR_DELIVERY]: [ORDER_STATUS.DELIVERED, ORDER_STATUS.RTO],
  [ORDER_STATUS.DELIVERED]: [ORDER_STATUS.COMPLETED],
  [ORDER_STATUS.COMPLETED]: [],
  [ORDER_STATUS.CANCELLED]: [],
  [ORDER_STATUS.RTO]: [],
};

class OrderService {
  /**
   * List customer orders
   */
  async getCustomerOrders(customerId, query = {}) {
    const { page = 1, limit = 10, status } = query;
    const filter = { customer: customerId };
    if (status) filter.status = status;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 10));
    const skip = (pageNum - 1) * limitNum;

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('invoices')
        .lean(),
      Order.countDocuments(filter),
    ]);

    return {
      items: orders,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  /**
   * Get customer order details by orderNo
   */
  async getCustomerOrderDetails(orderNo, customerId = null, _guestToken = null) {
    const filter = { orderNo: orderNo.trim().toUpperCase() };
    if (customerId) {
      filter.customer = customerId;
    }

    const order = await Order.findOne(filter).populate('invoices').lean();
    if (!order) {
      throw AppError.notFound(`Order ${orderNo} not found`);
    }

    return order;
  }

  /**
   * Cancel order (customer self-service before shipment)
   */
  async cancelCustomerOrder(orderNo, customerId, reason = 'Cancelled by customer') {
    const order = await Order.findOne({
      orderNo: orderNo.trim().toUpperCase(),
      customer: customerId,
    });

    if (!order) {
      throw AppError.notFound(`Order ${orderNo} not found`);
    }

    const cancellableStatuses = [
      ORDER_STATUS.PENDING_PAYMENT,
      ORDER_STATUS.CONFIRMED,
      ORDER_STATUS.PACKED,
      ORDER_STATUS.READY_TO_SHIP,
    ];

    if (!cancellableStatuses.includes(order.status)) {
      throw AppError.badRequest(`Order cannot be cancelled in '${order.status}' status`);
    }

    return this.transitionOrderStatus({
      orderNo,
      targetStatus: ORDER_STATUS.CANCELLED,
      actor: { id: customerId, role: 'CUSTOMER', name: 'Customer' },
      note: reason,
    });
  }

  /**
   * List admin orders with comprehensive filtering and search
   */
  async getAdminOrders(query = {}) {
    const {
      page = 1,
      limit = 20,
      status,
      paymentStatus,
      paymentMethod,
      search,
      startDate,
      endDate,
    } = query;

    const filter = {};
    if (status) filter.status = status;
    if (paymentStatus) filter['payment.status'] = paymentStatus;
    if (paymentMethod) filter['payment.method'] = paymentMethod;

    if (search) {
      const s = search.trim();
      filter.$or = [
        { orderNo: { $regex: s, $options: 'i' } },
        { 'shippingAddress.name': { $regex: s, $options: 'i' } },
        { 'shippingAddress.phone': { $regex: s, $options: 'i' } },
        { 'guest.email': { $regex: s, $options: 'i' } },
      ];
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate('customer', 'name email phone')
        .populate('invoices')
        .lean(),
      Order.countDocuments(filter),
    ]);

    return {
      items: orders,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  /**
   * Get single order by orderNo for admin inspection
   */
  async getAdminOrderDetails(orderNo) {
    const order = await Order.findOne({ orderNo: orderNo.trim().toUpperCase() })
      .populate('customer', 'name email phone resellerStatus')
      .populate('invoices')
      .populate('items.product', 'name slug brand fabric')
      .populate('items.variant', 'sku color size mrp sellingPrice costPrice')
      .populate('items.batch', 'batchNo receivedOn supplier')
      .lean();

    if (!order) {
      throw AppError.notFound(`Order ${orderNo} not found`);
    }

    return order;
  }

  /**
   * Transitions an order's status strictly enforcing the state machine (§6.6)
   */
  async transitionOrderStatus({ orderNo, targetStatus, actor, note = '' }) {
    const order = await Order.findOne({ orderNo: orderNo.trim().toUpperCase() });
    if (!order) {
      throw AppError.notFound(`Order ${orderNo} not found`);
    }

    const currentStatus = order.status;
    if (currentStatus === targetStatus) {
      return order; // Idempotent
    }

    const allowedNextStatuses = ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!allowedNextStatuses.includes(targetStatus)) {
      throw AppError.badRequest(
        `Invalid status transition from '${currentStatus}' to '${targetStatus}'. Allowed: ${allowedNextStatuses.join(', ') || 'none'}`
      );
    }

    // Handle cancellation side effects (stock release + refund if applicable)
    if (targetStatus === ORDER_STATUS.CANCELLED) {
      await this._handleOrderCancellation(order, actor, note);
    }

    order.status = targetStatus;
    order.statusHistory.push({
      status: targetStatus,
      at: new Date(),
      by: {
        id: actor?.id || actor?._id || null,
        role: actor?.role || 'SYSTEM',
        name: actor?.name || actor?.fullName || 'Staff',
      },
      note,
    });

    await order.save();
    logger.info({ orderNo, from: currentStatus, to: targetStatus }, 'Order status transitioned');

    // Emit lifecycle events
    if (targetStatus === ORDER_STATUS.CANCELLED) {
      eventBus.publish(EVENT_NAMES.ORDER_CANCELLED, {
        orderId: order._id,
        orderNo: order.orderNo,
        reason: note,
      });
    } else if (targetStatus === ORDER_STATUS.SHIPPED) {
      eventBus.publish(EVENT_NAMES.ORDER_SHIPPED, {
        orderId: order._id,
        orderNo: order.orderNo,
      });
    } else if (targetStatus === ORDER_STATUS.OUT_FOR_DELIVERY) {
      eventBus.publish(EVENT_NAMES.ORDER_OUT_FOR_DELIVERY, {
        orderId: order._id,
        orderNo: order.orderNo,
      });
    } else if (targetStatus === ORDER_STATUS.DELIVERED) {
      eventBus.publish(EVENT_NAMES.ORDER_DELIVERED, {
        orderId: order._id,
        orderNo: order.orderNo,
      });
    }

    return order;
  }

  /**
   * Handles stock replenishment and refund when order is cancelled
   */
  async _handleOrderCancellation(order, actor, note) {
    // 1. Release reserved/sold stock back to original batches
    const allocationsByVariant = new Map();
    order.items.forEach((item) => {
      if (item.itemStatus === ORDER_ITEM_STATUS.ACTIVE) {
        const vId = item.variant.toString();
        if (!allocationsByVariant.has(vId)) allocationsByVariant.set(vId, []);
        allocationsByVariant.get(vId).push({
          batchId: item.batch,
          batchNo: item.batchNo,
          qty: item.qty,
        });
        item.itemStatus = ORDER_ITEM_STATUS.CANCELLED;
      }
    });

    const isPendingPayment = order.status === ORDER_STATUS.PENDING_PAYMENT;

    for (const [vId, allocations] of allocationsByVariant.entries()) {
      if (isPendingPayment) {
        await fifoService.releaseReservation({
          variantId: vId,
          allocations,
          refType: 'ORDER',
          refId: order.orderNo,
          actor: actor?.id || actor?._id,
          note: `Order cancelled (${order.orderNo}): ${note}`,
        }).catch((err) => {
          logger.error({ err, orderNo: order.orderNo, variantId: vId }, 'Stock release on cancel failed');
        });
      } else {
        await fifoService.restockCancelledSale({
          variantId: vId,
          allocations,
          refType: 'ORDER',
          refId: order.orderNo,
          actor: actor?.id || actor?._id,
          note: `Order cancelled (${order.orderNo}): ${note}`,
        }).catch((err) => {
          logger.error({ err, orderNo: order.orderNo, variantId: vId }, 'Stock restock on cancel failed');
        });
      }
    }

    // 2. If online payment was captured, issue Razorpay refund
    if (order.payment?.status === PAYMENT_STATUS.PAID && order.payment.razorpayPaymentId) {
      try {
        const rzpRefund = await razorpayService.createRefund({
          paymentId: order.payment.razorpayPaymentId,
          amount: order.pricing.grandTotal,
          notes: {
            orderNo: order.orderNo,
            reason: note || 'Order cancelled before shipment',
          },
        });

        order.payment.status = PAYMENT_STATUS.REFUNDED;
        await Payment.findOneAndUpdate(
          { order: order._id },
          {
            status: 'REFUNDED',
            $push: {
              refunds: {
                razorpayRefundId: rzpRefund.id,
                amount: order.pricing.grandTotal,
                status: 'PROCESSED',
                reason: note,
                at: new Date(),
              },
            },
          }
        );
      } catch (refundErr) {
        logger.error({ err: refundErr.message, orderNo: order.orderNo }, 'Automated refund failed on cancellation');
      }
    }
  }

  /**
   * Attaches packaging proof (image/video URL) for fulfillment verification
   */
  async attachPackingProof(orderNo, { url, publicId = null, type = 'IMAGE' }, adminUser) {
    const order = await Order.findOne({ orderNo: orderNo.trim().toUpperCase() });
    if (!order) {
      throw AppError.notFound(`Order ${orderNo} not found`);
    }

    order.packingProof.push({
      url,
      publicId,
      type,
      at: new Date(),
      by: {
        id: adminUser._id,
        name: adminUser.fullName || adminUser.name || 'Staff',
      },
    });

    await order.save();
    return order;
  }

  /**
   * Creates a manual order taken via phone/WhatsApp (source: ADMIN)
   */
  async createManualOrder(data, adminUser) {
    const { items, customer, guest, shippingAddress, billingAddress, paymentMethod, notes } = data;

    if (!items || !items.length) {
      throw AppError.badRequest('At least one line item is required');
    }
    if (!shippingAddress) {
      throw AppError.badRequest('Shipping address is required');
    }

    const settings = await Settings.getSettings();

    // 1. Load variants and products
    const variantIds = items.map((i) => i.variantId);
    const variants = await Variant.find({ _id: { $in: variantIds } })
      .populate('product')
      .lean();

    const variantMap = new Map();
    variants.forEach((v) => variantMap.set(v._id.toString(), v));

    const pricingEngineItems = [];
    for (const item of items) {
      const variant = variantMap.get(item.variantId.toString());
      if (!variant) throw AppError.badRequest(`Variant ${item.variantId} not found`);
      const product = variant.product;
      if (!product || product.isDeleted || product.status !== PRODUCT_STATUS.ACTIVE) {
        throw AppError.badRequest(`Product '${product ? product.name : item.variantId}' is not active`);
      }

      pricingEngineItems.push({
        variantId: variant._id,
        productId: product._id,
        categoryId: product.category,
        qty: item.qty,
        baseSellingPrice: variant.sellingPrice,
        mrp: variant.mrp,
        gstPercent: product.gstPercent || 12,
        resellingEnabled: false,
      });
    }

    // 2. Pricing
    const pMethod = paymentMethod || PAYMENT_METHOD.COD;
    const pricing = calculatePriceBreakup({
      items: pricingEngineItems,
      deliveryAddress: {
        stateCode: shippingAddress.stateCode || settings.store?.stateCode || '07',
        pincode: shippingAddress.pincode,
      },
      paymentMethod: pMethod,
      settings,
    });

    const orderNo = await generateOrderNo();

    // 3. FIFO Reservation
    const reservedBatchRecords = [];
    for (const item of items) {
      const reservation = await fifoService.reserveStock({
        variantId: item.variantId,
        qty: item.qty,
        refType: 'ORDER',
        refId: orderNo,
        actor: adminUser._id,
        note: `Manual order reservation ${orderNo}`,
      });

      reservedBatchRecords.push({
        variantId: item.variantId,
        allocations: reservation.allocations,
      });
    }

    // 4. Assemble lines
    const orderItems = [];
    const pricingLineMap = new Map();
    pricing.items.forEach((pItem) => {
      pricingLineMap.set(pItem.variantId.toString(), pItem);
    });

    for (const record of reservedBatchRecords) {
      const variant = variantMap.get(record.variantId.toString());
      const product = variant.product;
      const pLine = pricingLineMap.get(record.variantId.toString());

      for (const alloc of record.allocations) {
        const splitRatio = alloc.qty / pLine.qty;
        const splitTaxable = Math.round((pLine.taxableValue || 0) * splitRatio);
        const splitGst = Math.round((pLine.gstAmount || 0) * splitRatio);
        const splitLineTotal = pLine.effectiveSellingPrice * alloc.qty;

        orderItems.push({
          product: product._id,
          variant: variant._id,
          name: product.name,
          sku: variant.sku,
          color: variant.color,
          size: variant.size,
          hsnCode: product.hsnCode || '',
          gstPercent: product.gstPercent || 12,
          batchNo: alloc.batchNo,
          batch: alloc.batchId,
          mrp: variant.mrp,
          baseSellingPrice: variant.sellingPrice,
          marginPerUnit: 0,
          sellingPrice: pLine.effectiveSellingPrice,
          qty: alloc.qty,
          discount: 0,
          taxableValue: splitTaxable,
          gstAmount: splitGst,
          lineTotal: splitLineTotal,
          itemStatus: ORDER_ITEM_STATUS.ACTIVE,
        });
      }
    }

    const orderDoc = new Order({
      orderNo,
      customer: customer || null,
      guest: guest || null,
      items: orderItems,
      shippingAddress,
      billingAddress: billingAddress || shippingAddress,
      pricing: {
        itemsTotal: pricing.itemsTotal,
        discount: 0,
        couponCode: null,
        couponDiscount: 0,
        taxableAmount: pricing.taxableAmount,
        gstTotal: pricing.gstTotal,
        shippingFee: pricing.shippingFee,
        codFee: pricing.codFee,
        roundOff: pricing.roundOff,
        grandTotal: pricing.grandTotal,
      },
      payment: {
        method: pMethod,
        status: pMethod === PAYMENT_METHOD.COD ? PAYMENT_STATUS.COD_PENDING : PAYMENT_STATUS.PAID,
        paidAt: pMethod === PAYMENT_METHOD.ONLINE ? new Date() : null,
      },
      status: ORDER_STATUS.CONFIRMED,
      statusHistory: [
        {
          status: ORDER_STATUS.CONFIRMED,
          at: new Date(),
          by: {
            id: adminUser._id,
            role: 'STAFF',
            name: adminUser.fullName || adminUser.name || 'Staff',
          },
          note: `Manual order created by staff: ${notes || ''}`,
        },
      ],
      reselling: {
        isResellerOrder: false,
      },
      source: ORDER_SOURCE.ADMIN,
      notes: notes ? [{ text: notes, at: new Date(), by: adminUser.name || 'Staff' }] : [],
    });

    await orderDoc.save();

    // Commit reservations to sale
    for (const record of reservedBatchRecords) {
      await fifoService.commitReservationToSale({
        variantId: record.variantId,
        allocations: record.allocations,
      }).catch(() => {});
    }

    // Generate invoices
    const invoices = await invoiceService.generateInvoicesForOrder(orderDoc);
    orderDoc.invoices = invoices.map((inv) => inv._id);
    await orderDoc.save();

    eventBus.publish(EVENT_NAMES.ORDER_PLACED, {
      orderId: orderDoc._id,
      orderNo: orderDoc.orderNo,
      grandTotal: orderDoc.pricing.grandTotal,
    });

    return orderDoc;
  }
}

module.exports = new OrderService();

