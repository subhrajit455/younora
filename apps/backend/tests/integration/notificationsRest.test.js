const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = require('../../src/app');
const { env } = require('../../src/config/env');
const Customer = require('../../src/modules/users/models/customer.model');
const AdminUser = require('../../src/modules/users/models/adminUser.model');
const Notification = require('../../src/modules/notifications/models/notification.model');
const NotificationsService = require('../../src/modules/notifications/notifications.service');
const { ROLES, TOKEN_AUDIENCE, NOTIFICATION_RECIPIENT_TYPE } = require('@younora/shared-constants');

describe('Slice 2: Notification Service & REST APIs', () => {
  let mongoServer;
  let customerUser;
  let customerToken;
  let otherCustomerUser;
  let adminUser;
  let adminToken;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await Customer.deleteMany({});
    await AdminUser.deleteMany({});
    await Notification.deleteMany({});

    const passwordHash = await bcrypt.hash('Secret@12345', 12);

    // Customer 1
    customerUser = await Customer.create({
      name: 'Diya Sen',
      email: 'diya@example.com',
      phone: '9876543210',
      passwordHash,
      emailVerified: true,
      notificationPrefs: {
        orders: true,
        offers: true,
        returns: true,
        reviews: true,
      },
    });

    customerToken = jwt.sign(
      { sub: customerUser._id.toString(), aud: TOKEN_AUDIENCE.CUSTOMER },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );

    // Customer 2 (for isolation checks)
    otherCustomerUser = await Customer.create({
      name: 'Karan Patel',
      email: 'karan@example.com',
      phone: '9876543211',
      passwordHash,
      emailVerified: true,
    });

    // Admin User
    adminUser = await AdminUser.create({
      name: 'Admin Manager',
      email: 'manager@younora.com',
      passwordHash,
      role: ROLES.SUPER_ADMIN,
      permissions: [],
      isActive: true,
    });

    adminToken = jwt.sign(
      { sub: adminUser._id.toString(), aud: TOKEN_AUDIENCE.ADMIN },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );
  });

  describe('GET /api/v1/notifications', () => {
    test('returns paginated notifications for authenticated customer with unread count', async () => {
      // Create 3 notifications for customerUser (2 unread, 1 read)
      await Notification.create([
        {
          recipientType: NOTIFICATION_RECIPIENT_TYPE.CUSTOMER,
          recipient: customerUser._id,
          type: 'ORDER_PLACED',
          title: 'Order Confirmed',
          body: 'Your order #1001 is placed.',
        },
        {
          recipientType: NOTIFICATION_RECIPIENT_TYPE.CUSTOMER,
          recipient: customerUser._id,
          type: 'ORDER_SHIPPED',
          title: 'Order Shipped',
          body: 'Your order #1001 has shipped.',
        },
        {
          recipientType: NOTIFICATION_RECIPIENT_TYPE.CUSTOMER,
          recipient: customerUser._id,
          type: 'WELCOME',
          title: 'Welcome to Younora',
          body: 'Thanks for joining us.',
          readAt: new Date(),
        },
      ]);

      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(3);
      expect(res.body.meta.total).toBe(3);
      expect(res.body.meta.unreadCount).toBe(2);
    });

    test('supports isRead filter (true / false)', async () => {
      await Notification.create([
        {
          recipientType: NOTIFICATION_RECIPIENT_TYPE.CUSTOMER,
          recipient: customerUser._id,
          type: 'UNREAD_NOTICE',
          title: 'Unread Alert',
          body: 'Body 1',
        },
        {
          recipientType: NOTIFICATION_RECIPIENT_TYPE.CUSTOMER,
          recipient: customerUser._id,
          type: 'READ_NOTICE',
          title: 'Read Notice',
          body: 'Body 2',
          readAt: new Date(),
        },
      ]);

      const unreadRes = await request(app)
        .get('/api/v1/notifications')
        .query({ isRead: 'false' })
        .set('Authorization', `Bearer ${customerToken}`);

      expect(unreadRes.status).toBe(200);
      expect(unreadRes.body.data.length).toBe(1);
      expect(unreadRes.body.data[0].type).toBe('UNREAD_NOTICE');

      const readRes = await request(app)
        .get('/api/v1/notifications')
        .query({ isRead: 'true' })
        .set('Authorization', `Bearer ${customerToken}`);

      expect(readRes.status).toBe(200);
      expect(readRes.body.data.length).toBe(1);
      expect(readRes.body.data[0].type).toBe('READ_NOTICE');
    });

    test('admin receives only admin notifications', async () => {
      await Notification.create([
        {
          recipientType: NOTIFICATION_RECIPIENT_TYPE.ADMIN,
          recipient: adminUser._id,
          type: 'STOCK_LOW',
          title: 'Low Stock Alert',
          body: 'Variant X is low in batch 10.',
        },
        {
          recipientType: NOTIFICATION_RECIPIENT_TYPE.CUSTOMER,
          recipient: customerUser._id,
          type: 'ORDER_PLACED',
          title: 'Customer Notice',
          body: 'Customer body',
        },
      ]);

      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].type).toBe('STOCK_LOW');
    });
  });

  describe('GET /api/v1/notifications/unread-count', () => {
    test('returns accurate unread notification count', async () => {
      await Notification.create([
        {
          recipientType: NOTIFICATION_RECIPIENT_TYPE.CUSTOMER,
          recipient: customerUser._id,
          type: 'NOTICE_1',
          title: 'Notice 1',
          body: 'Body',
        },
        {
          recipientType: NOTIFICATION_RECIPIENT_TYPE.CUSTOMER,
          recipient: customerUser._id,
          type: 'NOTICE_2',
          title: 'Notice 2',
          body: 'Body',
        },
      ]);

      const res = await request(app)
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.unreadCount).toBe(2);
    });
  });

  describe('PATCH /api/v1/notifications/:id/read and /read-all', () => {
    test('marks individual notification as read', async () => {
      const notice = await Notification.create({
        recipientType: NOTIFICATION_RECIPIENT_TYPE.CUSTOMER,
        recipient: customerUser._id,
        type: 'ORDER_PLACED',
        title: 'New Order',
        body: 'Your order was received',
      });

      const res = await request(app)
        .patch(`/api/v1/notifications/${notice._id}/read`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isRead).toBe(true);

      const refreshed = await Notification.findById(notice._id);
      expect(refreshed.readAt).not.toBeNull();
    });

    test('PATCH /api/v1/notifications/read-all marks all unread notifications as read', async () => {
      await Notification.create([
        {
          recipientType: NOTIFICATION_RECIPIENT_TYPE.CUSTOMER,
          recipient: customerUser._id,
          type: 'N1',
          title: 'N1',
          body: 'B1',
        },
        {
          recipientType: NOTIFICATION_RECIPIENT_TYPE.CUSTOMER,
          recipient: customerUser._id,
          type: 'N2',
          title: 'N2',
          body: 'B2',
        },
      ]);

      const res = await request(app)
        .patch('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.updatedCount).toBe(2);

      const unreadCount = await Notification.countDocuments({
        recipient: customerUser._id,
        readAt: null,
      });
      expect(unreadCount).toBe(0);
    });

    test('prevents marking another user notification as read (isolation)', async () => {
      const otherNotice = await Notification.create({
        recipientType: NOTIFICATION_RECIPIENT_TYPE.CUSTOMER,
        recipient: otherCustomerUser._id,
        type: 'SECRET',
        title: 'Private',
        body: 'Confidential',
      });

      const res = await request(app)
        .patch(`/api/v1/notifications/${otherNotice._id}/read`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/notifications/:id', () => {
    test('deletes notification owned by authenticated user', async () => {
      const notice = await Notification.create({
        recipientType: NOTIFICATION_RECIPIENT_TYPE.CUSTOMER,
        recipient: customerUser._id,
        type: 'DELETE_ME',
        title: 'Old Notification',
        body: 'To be removed',
      });

      const res = await request(app)
        .delete(`/api/v1/notifications/${notice._id}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.deleted).toBe(true);

      const check = await Notification.findById(notice._id);
      expect(check).toBeNull();
    });

    test('prevents deleting another user notification', async () => {
      const otherNotice = await Notification.create({
        recipientType: NOTIFICATION_RECIPIENT_TYPE.CUSTOMER,
        recipient: otherCustomerUser._id,
        type: 'OTHER_NOTICE',
        title: 'Other',
        body: 'Other',
      });

      const res = await request(app)
        .delete(`/api/v1/notifications/${otherNotice._id}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('Customer Notification Preferences', () => {
    test('skips optional marketing notifications when customer has opted out in notificationPrefs', async () => {
      // Opt out of offers
      await Customer.findByIdAndUpdate(customerUser._id, {
        'notificationPrefs.offers': false,
      });

      const skipped = await NotificationsService.createNotification({
        recipientType: NOTIFICATION_RECIPIENT_TYPE.CUSTOMER,
        recipient: customerUser._id,
        type: 'SPECIAL_OFFER_ALERT',
        title: '50% Off Everything',
        body: 'Weekend flash sale',
      });

      expect(skipped).toBeNull();

      // Transactional notifications still delivered
      const delivered = await NotificationsService.createNotification({
        recipientType: NOTIFICATION_RECIPIENT_TYPE.CUSTOMER,
        recipient: customerUser._id,
        type: 'ORDER_PLACED',
        title: 'Order Received',
        body: 'Order #2002 confirmed',
      });

      expect(delivered).not.toBeNull();
      expect(delivered.type).toBe('ORDER_PLACED');
    });
  });

  describe('Authentication Guard', () => {
    test('unauthenticated request gets 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/notifications');
      expect(res.status).toBe(401);
    });
  });
});
