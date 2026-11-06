/**
 * Younora Canonical Staff Permissions (docs/PLAN.md v3.0 §26.1)
 */
const PERMISSIONS = Object.freeze({
  // Catalog
  PRODUCTS_READ: 'products.read',
  PRODUCTS_WRITE: 'products.write',
  CATEGORIES_MANAGE: 'categories.manage',

  // Inventory & Batches
  INVENTORY_READ: 'inventory.read',
  INVENTORY_WRITE: 'inventory.write',
  INVENTORY_MANAGE: 'inventory.manage',
  INVENTORY_VIEW_COST: 'inventory.view-cost',
  BATCHES_SEARCH: 'batches.search',

  // Orders & Fulfillment
  ORDERS_READ: 'orders.read',
  ORDERS_WRITE: 'orders.write',
  ORDERS_REFUND: 'orders.refund',
  SHIPPING_MANAGE: 'shipping.manage',

  // Payments & Settings
  PAYMENTS_SETTINGS: 'payments.settings',

  // Returns
  RETURNS_MANAGE: 'returns.manage',
  MANUAL_RETURNS_MANAGE: 'manual-returns.manage',

  // Customers & Reviews
  REVIEWS_MANAGE: 'reviews.manage',
  CUSTOMERS_READ: 'customers.read',
  CUSTOMERS_MANAGE: 'customers.manage',

  // Resellers & Payouts
  RESELLERS_MANAGE: 'resellers.manage',
  RESELLERS_VIEW_SENSITIVE: 'resellers.view-sensitive',
  RESELLING_INVOICES_READ: 'reselling-invoices.read',
  PAYOUTS_MANAGE: 'payouts.manage',

  // Marketing & CMS
  COUPONS_MANAGE: 'coupons.manage',
  CMS_MANAGE: 'cms.manage',

  // System & Administration
  SETTINGS_MANAGE: 'settings.manage',
  STAFF_MANAGE: 'staff.manage',
  REPORTS_READ: 'reports.read',
  AUDIT_READ: 'audit.read',
  NOTIFICATIONS_BROADCAST: 'notifications.broadcast',
});

const ALL_PERMISSIONS = Object.freeze(Object.values(PERMISSIONS));

module.exports = {
  PERMISSIONS,
  ALL_PERMISSIONS,
};
