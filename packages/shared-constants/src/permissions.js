/**
 * Younora Canonical Staff Permissions
 */
const PERMISSIONS = Object.freeze({
  PRODUCTS_READ: 'products.read',
  PRODUCTS_WRITE: 'products.write',
  CATEGORIES_MANAGE: 'categories.manage',
  INVENTORY_READ: 'inventory.read',
  INVENTORY_MANAGE: 'inventory.manage',
  ORDERS_READ: 'orders.read',
  ORDERS_WRITE: 'orders.write',
  SHIPPING_MANAGE: 'shipping.manage',
  RETURNS_MANAGE: 'returns.manage',
  REVIEWS_MANAGE: 'reviews.manage',
  CUSTOMERS_READ: 'customers.read',
  CUSTOMERS_MANAGE: 'customers.manage',
  COUPONS_MANAGE: 'coupons.manage',
  CMS_MANAGE: 'cms.manage',
  SETTINGS_MANAGE: 'settings.manage',
  REPORTS_READ: 'reports.read',
  AUDIT_READ: 'audit.read',
  NOTIFICATIONS_BROADCAST: 'notifications.broadcast',
});

const ALL_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));

module.exports = {
  PERMISSIONS,
  ALL_PERMISSIONS,
};

