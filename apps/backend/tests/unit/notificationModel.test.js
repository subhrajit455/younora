const mongoose = require('mongoose');
const Notification = require('../../src/modules/notifications/models/notification.model');
const { NOTIFICATION_RECIPIENT_TYPE } = require('@younora/shared-constants');

describe('Unit: Notification Model', () => {
  test('validates required fields: recipientType, recipient, type, title, body', () => {
    const notification = new Notification({});
    const error = notification.validateSync();

    expect(error).toBeDefined();
    expect(error.errors.recipientType).toBeDefined();
    expect(error.errors.recipient).toBeDefined();
    expect(error.errors.type).toBeDefined();
    expect(error.errors.title).toBeDefined();
    expect(error.errors.body).toBeDefined();
  });

  test('rejects invalid recipientType enum', () => {
    const notification = new Notification({
      recipientType: 'INVALID_TYPE',
      recipient: new mongoose.Types.ObjectId(),
      type: 'TEST',
      title: 'Test Title',
      body: 'Test Body',
    });

    const error = notification.validateSync();
    expect(error).toBeDefined();
    expect(error.errors.recipientType).toBeDefined();
  });

  test('auto-derives recipientModel to Customer or AdminUser based on recipientType', () => {
    const customerNotification = new Notification({
      recipientType: NOTIFICATION_RECIPIENT_TYPE.CUSTOMER,
      recipient: new mongoose.Types.ObjectId(),
      type: 'ORDER_PLACED',
      title: 'Order Placed',
      body: 'Your order was placed successfully',
    });
    expect(customerNotification.recipientModel).toBe('Customer');

    const adminNotification = new Notification({
      recipientType: NOTIFICATION_RECIPIENT_TYPE.ADMIN,
      recipient: new mongoose.Types.ObjectId(),
      type: 'STOCK_LOW',
      title: 'Low Stock Alert',
      body: 'Stock is running low',
    });
    expect(adminNotification.recipientModel).toBe('AdminUser');
  });

  test('virtual isRead returns false when readAt is null and true when readAt is set', () => {
    const unread = new Notification({
      recipientType: NOTIFICATION_RECIPIENT_TYPE.CUSTOMER,
      recipient: new mongoose.Types.ObjectId(),
      type: 'TEST',
      title: 'Test',
      body: 'Test',
    });
    expect(unread.isRead).toBe(false);

    const read = new Notification({
      recipientType: NOTIFICATION_RECIPIENT_TYPE.CUSTOMER,
      recipient: new mongoose.Types.ObjectId(),
      type: 'TEST',
      title: 'Test',
      body: 'Test',
      readAt: new Date(),
    });
    expect(read.isRead).toBe(true);
  });

  test('has TTL index configured for 90 days (7776000 seconds) on createdAt', () => {
    const createdAtPath = Notification.schema.path('createdAt');
    expect(createdAtPath.options.expires).toBe(7776000);
  });
});

