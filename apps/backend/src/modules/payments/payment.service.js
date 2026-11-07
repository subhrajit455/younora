const Order = require('../orders/models/order.model');
const Payment = require('./models/payment.model');
const razorpayService = require('./razorpay.service');
const fifoService = require('../inventory/fifo.service');
const invoiceService = require('../orders/invoice.service');
const eventBus = require('../../core/events/eventBus');
const AppError = require('../../core/errors/appError');
const logger = require('../../core/logger');
const {
  ORDER_STATUS,
  PAYMENT_STATUS,
  EVENT_NAMES,
} = require('@younora/shared-constants');

class PaymentService {
  /**
   * Client-side instant payment signature verification
   */
  async verifyPayment({ orderNo, razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
    if (!orderNo || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      throw AppError.badRequest('Missing required payment verification details');
    }

    const isValid = razorpayService.verifyPaymentSignature({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });

    if (!isValid) {
      throw AppError.badRequest('Invalid payment signature');
    }

    const order = await Order.findOne({ orderNo });
    if (!order) {
      throw AppError.notFound(`Order ${orderNo} not found`);
    }

    // Idempotent: if already confirmed or paid, return immediately
    if (order.status !== ORDER_STATUS.PENDING_PAYMENT) {
      return order;
    }

    order.status = ORDER_STATUS.CONFIRMED;
    order.payment.status = PAYMENT_STATUS.PAID;
    order.payment.paidAt = new Date();
    order.payment.razorpayPaymentId = razorpayPaymentId;
    order.expiresAt = null;

    order.statusHistory.push({
      status: ORDER_STATUS.CONFIRMED,
      at: new Date(),
      by: {
        id: order.customer,
        role: order.customer ? 'CUSTOMER' : 'GUEST',
        name: 'Razorpay Client Verification',
      },
      note: `Online payment captured (${razorpayPaymentId})`,
    });

    // Update payment record
    await Payment.findOneAndUpdate(
      { order: order._id },
      {
        status: 'CAPTURED',
        razorpayPaymentId,
        razorpaySignature,
      }
    );

    // Commit FIFO reservations to sale
    const allocationsByVariant = new Map();
    order.items.forEach((item) => {
      const vId = item.variant.toString();
      if (!allocationsByVariant.has(vId)) allocationsByVariant.set(vId, []);
      allocationsByVariant.get(vId).push({
        batchId: item.batch,
        batchNo: item.batchNo,
        qty: item.qty,
      });
    });

    for (const [vId, allocations] of allocationsByVariant.entries()) {
      await fifoService.commitReservationToSale({
        variantId: vId,
        allocations,
      }).catch((err) => {
        logger.error({ err, orderNo, variantId: vId }, 'Commit sale failed during payment verification');
      });
    }

    // Generate invoices
    const invoices = await invoiceService.generateInvoicesForOrder(order);
    order.invoices = invoices.map((inv) => inv._id);

    await order.save();

    eventBus.publish(EVENT_NAMES.ORDER_PLACED, {
      orderId: order._id,
      orderNo: order.orderNo,
      grandTotal: order.pricing.grandTotal,
      customerEmail: order.guest?.email,
    });

    return order;
  }

  /**
   * Webhook processor (raw body signature verified, source of truth)
   */
  async handleWebhook({ rawBody, signature, event }) {
    const isValid = razorpayService.verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      throw AppError.badRequest('Invalid webhook signature');
    }

    const eventId = event.id;
    const eventType = event.event;

    // Idempotency: verify this event wasn't already processed
    const alreadyProcessed = await Payment.findOne({
      'webhookEvents.eventId': eventId,
    });

    if (alreadyProcessed) {
      logger.info({ eventId, eventType }, 'Webhook event already processed');
      return { processed: true, duplicate: true };
    }

    logger.info({ eventId, eventType }, 'Processing Razorpay webhook');

    if (eventType === 'payment.captured') {
      const paymentEntity = event.payload.payment.entity;
      const razorpayOrderId = paymentEntity.order_id;
      const razorpayPaymentId = paymentEntity.id;

      let order = await Order.findOne({
        'payment.razorpayOrderId': razorpayOrderId,
      });

      if (!order && paymentEntity.notes?.orderNo) {
        order = await Order.findOne({ orderNo: paymentEntity.notes.orderNo });
      }

      if (order) {
        if (order.status === ORDER_STATUS.PENDING_PAYMENT) {
          order.status = ORDER_STATUS.CONFIRMED;
          order.payment.status = PAYMENT_STATUS.PAID;
          order.payment.paidAt = new Date();
          order.payment.razorpayPaymentId = razorpayPaymentId;
          order.expiresAt = null;

          order.statusHistory.push({
            status: ORDER_STATUS.CONFIRMED,
            at: new Date(),
            by: { role: 'SYSTEM', name: 'Razorpay Webhook' },
            note: `Payment captured via webhook (${razorpayPaymentId})`,
          });

          // Commit reservations to sale
          const allocationsByVariant = new Map();
          order.items.forEach((item) => {
            const vId = item.variant.toString();
            if (!allocationsByVariant.has(vId)) allocationsByVariant.set(vId, []);
            allocationsByVariant.get(vId).push({
              batchId: item.batch,
              batchNo: item.batchNo,
              qty: item.qty,
            });
          });

          for (const [vId, allocations] of allocationsByVariant.entries()) {
            await fifoService.commitReservationToSale({
              variantId: vId,
              allocations,
            }).catch(() => {});
          }

          const invoices = await invoiceService.generateInvoicesForOrder(order);
          order.invoices = invoices.map((inv) => inv._id);
          await order.save();

          eventBus.publish(EVENT_NAMES.ORDER_PLACED, {
            orderId: order._id,
            orderNo: order.orderNo,
            grandTotal: order.pricing.grandTotal,
          });
        }

        // Record webhook event on Payment
        await Payment.findOneAndUpdate(
          { order: order._id },
          {
            status: 'CAPTURED',
            razorpayPaymentId,
            $push: {
              webhookEvents: {
                eventId,
                type: eventType,
                receivedAt: new Date(),
              },
            },
          },
          { upsert: true }
        );
      }
    } else if (eventType === 'payment.failed') {
      const paymentEntity = event.payload.payment.entity;
      const razorpayOrderId = paymentEntity.order_id;

      const order = await Order.findOne({
        'payment.razorpayOrderId': razorpayOrderId,
      });

      if (order && order.status === ORDER_STATUS.PENDING_PAYMENT) {
        order.payment.status = PAYMENT_STATUS.FAILED;
        order.statusHistory.push({
          status: order.status,
          at: new Date(),
          by: { role: 'SYSTEM', name: 'Razorpay Webhook' },
          note: `Payment failed: ${paymentEntity.error_description || 'Unknown error'}`,
        });
        await order.save();

        await Payment.findOneAndUpdate(
          { order: order._id },
          {
            status: 'FAILED',
            $push: {
              webhookEvents: {
                eventId,
                type: eventType,
                receivedAt: new Date(),
              },
            },
          }
        );

        eventBus.publish(EVENT_NAMES.PAYMENT_FAILED, {
          orderId: order._id,
          orderNo: order.orderNo,
          reason: paymentEntity.error_description,
        });
      }
    }

    return { processed: true };
  }

  /**
   * Cron / worker job: expires unpaid orders past expiresAt and releases stock back to batches
   */
  async expirePendingOrders() {
    const now = new Date();
    const expiredOrders = await Order.find({
      status: ORDER_STATUS.PENDING_PAYMENT,
      expiresAt: { $lt: now },
    });

    let expiredCount = 0;
    for (const order of expiredOrders) {
      try {
        // Release batch reservations
        const allocationsByVariant = new Map();
        order.items.forEach((item) => {
          const vId = item.variant.toString();
          if (!allocationsByVariant.has(vId)) allocationsByVariant.set(vId, []);
          allocationsByVariant.get(vId).push({
            batchId: item.batch,
            batchNo: item.batchNo,
            qty: item.qty,
          });
        });

        for (const [vId, allocations] of allocationsByVariant.entries()) {
          await fifoService.releaseReservation({
            variantId: vId,
            allocations,
            refType: 'ORDER',
            refId: order.orderNo,
            note: `Payment expired release ${order.orderNo}`,
          });
        }

        order.status = ORDER_STATUS.CANCELLED;
        order.statusHistory.push({
          status: ORDER_STATUS.CANCELLED,
          at: new Date(),
          by: { role: 'SYSTEM', name: 'Expiry Job' },
          note: 'Order expired due to payment timeout (15 mins)',
        });

        await order.save();
        expiredCount += 1;

        eventBus.publish(EVENT_NAMES.ORDER_CANCELLED, {
          orderId: order._id,
          orderNo: order.orderNo,
          reason: 'Payment timeout',
        });
      } catch (err) {
        logger.error({ err, orderNo: order.orderNo }, 'Failed to expire order');
      }
    }

    logger.info({ expiredCount }, 'Expired pending orders process completed');
    return expiredCount;
  }
}

module.exports = new PaymentService();

