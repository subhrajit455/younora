const http = require('http');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { io: Client } = require('socket.io-client');

const app = require('../../src/app');
const { env } = require('../../src/config/env');
const { initSocketServer, closeSocketServer } = require('../../src/core/socket/socketServer');
const Customer = require('../../src/modules/users/models/customer.model');
const AdminUser = require('../../src/modules/users/models/adminUser.model');
const Notification = require('../../src/modules/notifications/models/notification.model');
const NotificationsService = require('../../src/modules/notifications/notifications.service');
const { ROLES, TOKEN_AUDIENCE, NOTIFICATION_RECIPIENT_TYPE, PERMISSIONS } = require('@younora/shared-constants');

describe('Slice 3: Socket.IO Server & Real-Time Room Routing', () => {
  let mongoServer;
  let httpServer;
  let serverPort;
  let customerUser;
  let customerToken;
  let otherCustomerUser;
  let otherCustomerToken;
  let superAdminUser;
  let superAdminToken;
  let ordersStaffUser;
  let ordersStaffToken;
  let catalogStaffUser;
  let catalogStaffToken;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    httpServer = http.createServer(app);
    initSocketServer(httpServer);

    await new Promise(resolve => {
      httpServer.listen(0, () => {
        serverPort = httpServer.address().port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await closeSocketServer();
    await new Promise(resolve => httpServer.close(resolve));
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
    });

    customerToken = jwt.sign(
      { sub: customerUser._id.toString(), aud: TOKEN_AUDIENCE.CUSTOMER },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );

    // Customer 2
    otherCustomerUser = await Customer.create({
      name: 'Karan Patel',
      email: 'karan@example.com',
      phone: '9876543211',
      passwordHash,
      emailVerified: true,
    });

    otherCustomerToken = jwt.sign(
      { sub: otherCustomerUser._id.toString(), aud: TOKEN_AUDIENCE.CUSTOMER },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );

    // Super Admin
    superAdminUser = await AdminUser.create({
      name: 'Super Admin',
      email: 'superadmin@younora.com',
      passwordHash,
      role: ROLES.SUPER_ADMIN,
      permissions: [],
      isActive: true,
    });

    superAdminToken = jwt.sign(
      { sub: superAdminUser._id.toString(), aud: TOKEN_AUDIENCE.ADMIN },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );

    // Staff with orders.read
    ordersStaffUser = await AdminUser.create({
      name: 'Orders Staff',
      email: 'orders@younora.com',
      passwordHash,
      role: ROLES.STAFF,
      permissions: [PERMISSIONS.ORDERS_READ],
      isActive: true,
    });

    ordersStaffToken = jwt.sign(
      { sub: ordersStaffUser._id.toString(), aud: TOKEN_AUDIENCE.ADMIN },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );

    // Staff with products.read (no orders.read)
    catalogStaffUser = await AdminUser.create({
      name: 'Catalog Staff',
      email: 'catalog@younora.com',
      passwordHash,
      role: ROLES.STAFF,
      permissions: [PERMISSIONS.PRODUCTS_READ],
      isActive: true,
    });

    catalogStaffToken = jwt.sign(
      { sub: catalogStaffUser._id.toString(), aud: TOKEN_AUDIENCE.ADMIN },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );
  });

  function createClientSocket(token) {
    return Client(`http://localhost:${serverPort}`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
    });
  }

  describe('Handshake Authentication', () => {
    test('connects successfully with valid customer token', done => {
      const socket = createClientSocket(customerToken);
      socket.on('connect', () => {
        expect(socket.connected).toBe(true);
        socket.disconnect();
        done();
      });
      socket.on('connect_error', err => done(err));
    });

    test('connects successfully with valid admin token', done => {
      const socket = createClientSocket(superAdminToken);
      socket.on('connect', () => {
        expect(socket.connected).toBe(true);
        socket.disconnect();
        done();
      });
      socket.on('connect_error', err => done(err));
    });

    test('rejects connection when token is missing', done => {
      const socket = Client(`http://localhost:${serverPort}`, {
        transports: ['websocket'],
        forceNew: true,
      });

      socket.on('connect_error', err => {
        expect(err.message).toBe('Authentication token required');
        socket.disconnect();
        done();
      });
    });

    test('rejects connection when token is invalid', done => {
      const socket = createClientSocket('invalid.jwt.token');

      socket.on('connect_error', err => {
        expect(err.message).toBe('Invalid authentication token');
        socket.disconnect();
        done();
      });
    });

    test('rejects connection when customer account is blocked', async () => {
      await Customer.findByIdAndUpdate(customerUser._id, { isBlocked: true });

      await new Promise(resolve => {
        const socket = createClientSocket(customerToken);
        socket.on('connect_error', err => {
          expect(err.message).toBe('Account has been blocked');
          socket.disconnect();
          resolve();
        });
      });
    });
  });

  describe('Real-Time Room Routing', () => {
    test('delivers notification only to target customer room', async () => {
      const client1 = createClientSocket(customerToken);
      const client2 = createClientSocket(otherCustomerToken);

      await Promise.all([
        new Promise(res => client1.on('connect', res)),
        new Promise(res => client2.on('connect', res)),
      ]);

      let client2Received = false;
      client2.on('notification:new', () => {
        client2Received = true;
      });

      const receivedPromise = new Promise(resolve => {
        client1.on('notification:new', notification => {
          resolve(notification);
        });
      });

      // Dispatch notification to customer 1
      await NotificationsService.createNotification({
        recipientType: NOTIFICATION_RECIPIENT_TYPE.CUSTOMER,
        recipient: customerUser._id,
        type: 'ORDER_PLACED',
        title: 'Order Confirmation',
        body: 'Your order was placed successfully',
      });

      const receivedNotification = await receivedPromise;
      expect(receivedNotification.title).toBe('Order Confirmation');
      expect(client2Received).toBe(false);

      client1.disconnect();
      client2.disconnect();
    });

    test('delivers permission-targeted notification to staff with permission and super admin', async () => {
      const ordersStaffClient = createClientSocket(ordersStaffToken);
      const superAdminClient = createClientSocket(superAdminToken);
      const catalogStaffClient = createClientSocket(catalogStaffToken);

      await Promise.all([
        new Promise(res => ordersStaffClient.on('connect', res)),
        new Promise(res => superAdminClient.on('connect', res)),
        new Promise(res => catalogStaffClient.on('connect', res)),
      ]);

      let catalogStaffReceived = false;
      catalogStaffClient.on('notification:new', () => {
        catalogStaffReceived = true;
      });

      const ordersStaffPromise = new Promise(resolve => {
        ordersStaffClient.on('notification:new', resolve);
      });

      const superAdminPromise = new Promise(resolve => {
        superAdminClient.on('notification:new', resolve);
      });

      // Dispatch notification with permission requirement 'orders.read'
      await NotificationsService.createNotification({
        recipientType: NOTIFICATION_RECIPIENT_TYPE.ADMIN,
        recipient: superAdminUser._id,
        type: 'ORDER_PLACED',
        title: 'New Order Received',
        body: 'Order #3001 needs packing',
        permission: PERMISSIONS.ORDERS_READ,
      });

      const [ordersNotif, superNotif] = await Promise.all([
        ordersStaffPromise,
        superAdminPromise,
      ]);

      expect(ordersNotif.title).toBe('New Order Received');
      expect(superNotif.title).toBe('New Order Received');
      expect(catalogStaffReceived).toBe(false);

      ordersStaffClient.disconnect();
      superAdminClient.disconnect();
      catalogStaffClient.disconnect();
    });
  });
});

