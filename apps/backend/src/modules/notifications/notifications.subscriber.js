const eventBus = require('../../core/events/eventBus');
const { EVENT_NAMES, NOTIFICATION_RECIPIENT_TYPE } = require('@younora/shared-constants');
const { renderTemplate } = require('./templates/templates');
const NotificationsService = require('./notifications.service');
const AdminUser = require('../users/models/adminUser.model');
const { ROLES } = require('@younora/shared-constants');
const logger = require('../../core/logger');

let isRegistered = false;
const unsubscribers = [];

function registerNotificationSubscribers() {
  if (isRegistered) return;
  isRegistered = true;

  // Generic handler for events
  for (const eventName of Object.values(EVENT_NAMES)) {
    const unsub = eventBus.subscribe(eventName, async payload => {
      try {
        await handleDomainEvent(eventName, payload);
      } catch (error) {
        logger.error({ error, eventName }, 'Error handling domain event in notification subscriber');
      }
    });
    unsubscribers.push(unsub);
  }

  logger.info('Notification event subscribers registered successfully');
}

async function handleDomainEvent(eventName, payload = {}) {
  // 1. Customer Notification
  if (payload.customerId || payload.userId) {
    const customerId = payload.customerId || payload.userId;
    const template = renderTemplate(eventName, NOTIFICATION_RECIPIENT_TYPE.CUSTOMER, payload);
    if (template) {
      await NotificationsService.createNotification({
        recipientType: NOTIFICATION_RECIPIENT_TYPE.CUSTOMER,
        recipient: customerId,
        type: template.type,
        title: template.title,
        body: template.body,
        deepLink: template.deepLink,
        data: payload,
      });
    }
  }

  // 2. Admin Notification
  const adminTemplate = renderTemplate(eventName, NOTIFICATION_RECIPIENT_TYPE.ADMIN, payload);
  if (adminTemplate) {
    let targetAdminId = payload.adminId || null;

    // If no specific admin specified, pick super admin as primary recipient reference for DB persistence
    if (!targetAdminId) {
      const primaryAdmin = await AdminUser.findOne({ role: ROLES.SUPER_ADMIN, isActive: true });
      if (primaryAdmin) {
        targetAdminId = primaryAdmin._id;
      }
    }

    if (targetAdminId) {
      await NotificationsService.createNotification({
        recipientType: NOTIFICATION_RECIPIENT_TYPE.ADMIN,
        recipient: targetAdminId,
        type: adminTemplate.type,
        title: adminTemplate.title,
        body: adminTemplate.body,
        deepLink: adminTemplate.deepLink,
        data: payload,
        permission: adminTemplate.permission || null,
      });
    }
  }
}

function unregisterNotificationSubscribers() {
  for (const unsub of unsubscribers) {
    unsub();
  }
  unsubscribers.length = 0;
  isRegistered = false;
}

module.exports = {
  registerNotificationSubscribers,
  unregisterNotificationSubscribers,
  handleDomainEvent,
};

