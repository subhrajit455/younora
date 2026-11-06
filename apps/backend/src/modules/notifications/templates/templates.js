const { EVENT_NAMES, NOTIFICATION_RECIPIENT_TYPE, PERMISSIONS } = require('@younora/shared-constants');

/**
 * Standard notification templates mapped by event name
 */
const TEMPLATES = {
  [EVENT_NAMES.ORDER_PLACED]: {
    customer: data => ({
      type: 'ORDER_PLACED',
      title: 'Order Confirmed',
      body: `Your order #${data.orderNo || ''} has been placed successfully.`,
      deepLink: `/orders/${data.orderId || ''}`,
    }),
    admin: data => ({
      type: 'ORDER_PLACED',
      title: 'New Order Received',
      body: `Order #${data.orderNo || ''} received from ${data.customerName || 'Customer'}.`,
      deepLink: `/admin/orders/${data.orderId || ''}`,
      permission: PERMISSIONS.ORDERS_READ,
    }),
  },

  [EVENT_NAMES.PAYMENT_FAILED]: {
    customer: data => ({
      type: 'PAYMENT_FAILED',
      title: 'Payment Failed',
      body: `Payment for order #${data.orderNo || ''} could not be processed.`,
      deepLink: `/checkout/retry/${data.orderId || ''}`,
    }),
    admin: data => ({
      type: 'PAYMENT_FAILED',
      title: 'Payment Failed Alert',
      body: `Payment failed for order #${data.orderNo || ''}.`,
      deepLink: `/admin/orders/${data.orderId || ''}`,
      permission: PERMISSIONS.ORDERS_READ,
    }),
  },

  [EVENT_NAMES.ORDER_SHIPPED]: {
    customer: data => ({
      type: 'ORDER_SHIPPED',
      title: 'Order Shipped',
      body: `Your order #${data.orderNo || ''} is on its way via ${data.courier || 'Courier'} (AWB: ${data.awb || ''}).`,
      deepLink: `/orders/${data.orderId || ''}/track`,
    }),
  },

  [EVENT_NAMES.ORDER_OUT_FOR_DELIVERY]: {
    customer: data => ({
      type: 'ORDER_OUT_FOR_DELIVERY',
      title: 'Out for Delivery',
      body: `Your order #${data.orderNo || ''} is out for delivery today.`,
      deepLink: `/orders/${data.orderId || ''}/track`,
    }),
  },

  [EVENT_NAMES.ORDER_DELIVERED]: {
    customer: data => ({
      type: 'ORDER_DELIVERED',
      title: 'Order Delivered',
      body: `Your order #${data.orderNo || ''} has been delivered. Enjoy your luxury items!`,
      deepLink: `/orders/${data.orderId || ''}`,
    }),
  },

  [EVENT_NAMES.ORDER_CANCELLED]: {
    customer: data => ({
      type: 'ORDER_CANCELLED',
      title: 'Order Cancelled',
      body: `Your order #${data.orderNo || ''} has been cancelled.`,
      deepLink: `/orders/${data.orderId || ''}`,
    }),
    admin: data => ({
      type: 'ORDER_CANCELLED',
      title: 'Order Cancelled',
      body: `Order #${data.orderNo || ''} was cancelled.`,
      deepLink: `/admin/orders/${data.orderId || ''}`,
      permission: PERMISSIONS.ORDERS_READ,
    }),
  },

  [EVENT_NAMES.STOCK_LOW]: {
    admin: data => ({
      type: 'STOCK_LOW',
      title: 'Low Stock Alert',
      body: `Stock for ${data.productName || 'product'} (${data.sku || ''}) is down to ${data.remaining || 0} units.`,
      deepLink: `/admin/inventory?sku=${data.sku || ''}`,
      permission: PERMISSIONS.INVENTORY_READ,
    }),
  },

  [EVENT_NAMES.REVIEW_CREATED]: {
    admin: data => ({
      type: 'REVIEW_CREATED',
      title: 'New Review Submitted',
      body: `A new ${data.rating || 5}-star review was submitted for ${data.productName || 'product'}.`,
      deepLink: `/admin/reviews/${data.reviewId || ''}`,
      permission: PERMISSIONS.REVIEWS_MANAGE,
    }),
  },

  [EVENT_NAMES.RESELLER_APPROVED]: {
    customer: data => ({
      type: 'RESELLER_APPROVED',
      title: 'Reseller Application Approved',
      body: `Congratulations! You are now an approved Younora Reseller (Code: ${data.resellerCode || ''}). Start sharing and earning.`,
      deepLink: '/reseller/dashboard',
    }),
  },

  [EVENT_NAMES.PAYOUT_PAID]: {
    customer: data => ({
      type: 'PAYOUT_PAID',
      title: 'Payout Transferred',
      body: `Your payout of ₹${data.amountRupees || ''} has been transferred successfully.`,
      deepLink: '/reseller/wallet',
    }),
  },
};

function renderTemplate(eventName, recipientType, data) {
  const eventConfig = TEMPLATES[eventName];
  if (!eventConfig) return null;

  const templateFn =
    recipientType === NOTIFICATION_RECIPIENT_TYPE.ADMIN
      ? eventConfig.admin
      : eventConfig.customer;

  if (typeof templateFn !== 'function') return null;

  return templateFn(data);
}

module.exports = {
  TEMPLATES,
  renderTemplate,
};

