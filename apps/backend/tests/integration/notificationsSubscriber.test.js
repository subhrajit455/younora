const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

const app = require('../../src/app');
const { EVENT_NAMES, NOTIFICATION_RECIPIENT_TYPE, ROLES } = require('@younora/shared-constants');
const Customer = require('../../src/modules/users/models/customer.model');
const AdminUser = require('../../src/modules/users/models/adminUser.model');
const Notification = require('../../src/modules/notifications/models/notification.model');
const { handleDomainEvent } = require('../../src/modules/notifications/notifications.subscriber');

describe('Slice 4: Templates, Event Subscriber & Dev Verification', () => {
  let mongoServer;
  let customerUser;

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

    // Customer
    customerUser = await Customer.create({
      name: 'Ananya Roy',
      email: 'ananya@example.com',
      phone: '9876543210',
      emailVerified: true,
    });

    // Super Admin
    await AdminUser.create({
      name: 'Super Admin',
      email: 'admin@younora.com',
      passwordHash: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewKyfBf.Q7H24yqy',
      role: ROLES.SUPER_ADMIN,
      permissions: [],
      isActive: true,
    });
  });

  describe('Event Bus Domain Event Handling', () => {
    test('handles order.placed event: creates notifications for both customer and admin', async () => {
      await handleDomainEvent(EVENT_NAMES.ORDER_PLACED, {
        customerId: customerUser._id.toString(),
        orderId: '672b1234567890abcdef1001',
        orderNo: 'YNR-2611-0001',
        customerName: 'Ananya Roy',
        amount: 850000,
      });

      // Customer notification
      const customerNotice = await Notification.findOne({
        recipientType: NOTIFICATION_RECIPIENT_TYPE.CUSTOMER,
        recipient: customerUser._id,
      });
      expect(customerNotice).not.toBeNull();
      expect(customerNotice.title).toBe('Order Confirmed');
      expect(customerNotice.body).toContain('YNR-2611-0001');
      expect(customerNotice.deepLink).toContain('672b1234567890abcdef1001');

      // Admin notification
      const adminNotice = await Notification.findOne({
        recipientType: NOTIFICATION_RECIPIENT_TYPE.ADMIN,
      });
      expect(adminNotice).not.toBeNull();
      expect(adminNotice.title).toBe('New Order Received');
      expect(adminNotice.body).toContain('Ananya Roy');
    });

    test('handles stock.low event: creates admin notification with inventory.read permission', async () => {
      await handleDomainEvent(EVENT_NAMES.STOCK_LOW, {
        productName: 'Silk Tuxedo Jacket',
        sku: 'YNR-MEN-TUX-BLK-42',
        remaining: 2,
      });

      const notice = await Notification.findOne({
        recipientType: NOTIFICATION_RECIPIENT_TYPE.ADMIN,
        type: 'STOCK_LOW',
      });
      expect(notice).not.toBeNull();
      expect(notice.title).toBe('Low Stock Alert');
      expect(notice.body).toContain('Silk Tuxedo Jacket');
      expect(notice.body).toContain('2 units');
    });

    test('handles reseller.approved event: creates congratulatory notification for reseller', async () => {
      await handleDomainEvent(EVENT_NAMES.RESELLER_APPROVED, {
        customerId: customerUser._id.toString(),
        resellerCode: 'ROY99',
      });

      const notice = await Notification.findOne({
        recipientType: NOTIFICATION_RECIPIENT_TYPE.CUSTOMER,
        type: 'RESELLER_APPROVED',
      });
      expect(notice).not.toBeNull();
      expect(notice.title).toBe('Reseller Application Approved');
      expect(notice.body).toContain('ROY99');
      expect(notice.deepLink).toBe('/reseller/dashboard');
    });
  });

  describe('Dev Emitter & Preview Routes', () => {
    test('POST /api/v1/notifications/dev-emit publishes event onto eventBus', async () => {
      const res = await request(app)
        .post('/api/v1/notifications/dev-emit')
        .send({
          eventName: EVENT_NAMES.ORDER_PLACED,
          recipientId: customerUser._id.toString(),
          payload: {
            orderNo: 'DEV-9999',
            customerName: 'Ananya Roy',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('emitted onto eventBus');
    });

    test('POST /api/v1/notifications/dev-emit directly creates test notification', async () => {
      const res = await request(app)
        .post('/api/v1/notifications/dev-emit')
        .send({
          recipientType: NOTIFICATION_RECIPIENT_TYPE.CUSTOMER,
          recipientId: customerUser._id.toString(),
          title: 'Custom Test Toast',
          body: 'Directly dispatched via dev-emit',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Custom Test Toast');

      const saved = await Notification.findById(res.body.data.id);
      expect(saved).not.toBeNull();
    });

    test('GET /api/v1/notifications/dev-preview returns HTML document with toast container', async () => {
      const res = await request(app).get('/api/v1/notifications/dev-preview');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('Younora Live Notifications Preview');
      expect(res.text).toContain('toast-container');
    });
  });
});
