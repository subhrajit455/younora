const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = require('../../src/app');
const { env } = require('../../src/config/env');
const AdminUser = require('../../src/modules/users/models/adminUser.model');
const Customer = require('../../src/modules/users/models/customer.model');
const Address = require('../../src/modules/users/models/address.model');
const RefreshToken = require('../../src/modules/users/models/refreshToken.model');
const { ROLES, USER_TYPES, TOKEN_AUDIENCE, ADDRESS_TYPE, GENDER } = require('@younora/shared-constants');

describe('Slice 5: Profile & Addresses CRUD', () => {
  let mongoServer;
  let adminUser;
  let adminToken;
  let customerUser;
  let customerToken;
  let otherCustomerUser;

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
    await AdminUser.deleteMany({});
    await Customer.deleteMany({});
    await Address.deleteMany({});
    await RefreshToken.deleteMany({});

    // Seed Admin
    const passwordHash = await bcrypt.hash('Admin@12345', 12);
    adminUser = await AdminUser.create({
      name: 'Super Admin',
      email: 'superadmin@younora.com',
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

    // Seed Customer 1
    const custPasswordHash = await bcrypt.hash('Customer@12345', 12);
    customerUser = await Customer.create({
      name: 'Priya Sharma',
      email: 'priya@example.com',
      phone: '9876543210',
      passwordHash: custPasswordHash,
      emailVerified: true,
    });

    customerToken = jwt.sign(
      { sub: customerUser._id.toString(), aud: TOKEN_AUDIENCE.CUSTOMER },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );

    // Seed Customer 2 (for isolation checks)
    otherCustomerUser = await Customer.create({
      name: 'Rohan Mehta',
      email: 'rohan@example.com',
      phone: '9876543211',
      passwordHash: custPasswordHash,
      emailVerified: true,
    });
  });

  describe('Admin Profile Endpoints', () => {
    test('GET /api/v1/admin/me returns admin profile without passwordHash', async () => {
      const res = await request(app)
        .get('/api/v1/admin/me')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('superadmin@younora.com');
      expect(res.body.data.passwordHash).toBeUndefined();
    });

    test('PATCH /api/v1/admin/me updates name only', async () => {
      const res = await request(app)
        .patch('/api/v1/admin/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Head of Operations' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Head of Operations');

      const updated = await AdminUser.findById(adminUser._id);
      expect(updated.name).toBe('Head of Operations');
    });

    test('POST /api/v1/admin/me/change-password validates current password and revokes sessions', async () => {
      // Create active refresh token
      await RefreshToken.create({
        userId: adminUser._id,
        userType: USER_TYPES.ADMIN,
        userModel: 'AdminUser',
        tokenHash: 'dummy_admin_hash',
        family: 'fam_admin_1',
        expiresAt: new Date(Date.now() + 86400000),
      });

      // Wrong current password fails
      const failRes = await request(app)
        .post('/api/v1/admin/me/change-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          currentPassword: 'WrongPassword@123',
          newPassword: 'BrandNewPassword@123',
        });

      expect(failRes.status).toBe(401);

      // Correct current password succeeds
      const successRes = await request(app)
        .post('/api/v1/admin/me/change-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          currentPassword: 'Admin@12345',
          newPassword: 'BrandNewPassword@123',
        });

      expect(successRes.status).toBe(200);

      // Verify sessions revoked
      const activeSessions = await RefreshToken.countDocuments({
        userId: adminUser._id,
        revokedAt: null,
      });
      expect(activeSessions).toBe(0);

      // Verify password changed
      const updated = await AdminUser.findById(adminUser._id).select('+passwordHash');
      expect(updated.passwordChangedAt).toBeDefined();
      const match = await bcrypt.compare('BrandNewPassword@123', updated.passwordHash);
      expect(match).toBe(true);
    });
  });

  describe('Customer Profile Endpoints', () => {
    test('GET /api/v1/me returns customer profile without passwordHash', async () => {
      const res = await request(app)
        .get('/api/v1/me')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('priya@example.com');
      expect(res.body.data.passwordHash).toBeUndefined();
    });

    test('PATCH /api/v1/me updates customer profile fields', async () => {
      const res = await request(app)
        .patch('/api/v1/me')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          name: 'Priya S.',
          gender: GENDER.FEMALE,
          dob: '1995-08-15',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Priya S.');
      expect(res.body.data.gender).toBe(GENDER.FEMALE);
      expect(new Date(res.body.data.dob).toISOString()).toContain('1995-08-15');
    });

    test('POST /api/v1/me/change-password validates current password and revokes sessions', async () => {
      // Create active refresh token for customer
      await RefreshToken.create({
        userId: customerUser._id,
        userType: USER_TYPES.CUSTOMER,
        userModel: 'Customer',
        tokenHash: 'dummy_cust_hash',
        family: 'fam_cust_1',
        expiresAt: new Date(Date.now() + 86400000),
      });

      // Wrong current password fails
      const failRes = await request(app)
        .post('/api/v1/me/change-password')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          currentPassword: 'WrongPassword@123',
          newPassword: 'CustNewPassword@123',
        });

      expect(failRes.status).toBe(401);

      // Correct current password succeeds
      const successRes = await request(app)
        .post('/api/v1/me/change-password')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          currentPassword: 'Customer@12345',
          newPassword: 'CustNewPassword@123',
        });

      expect(successRes.status).toBe(200);

      // Verify sessions revoked
      const activeSessions = await RefreshToken.countDocuments({
        userId: customerUser._id,
        revokedAt: null,
      });
      expect(activeSessions).toBe(0);

      // Verify password changed
      const updated = await Customer.findById(customerUser._id).select('+passwordHash');
      expect(updated.passwordChangedAt).toBeDefined();
      const match = await bcrypt.compare('CustNewPassword@123', updated.passwordHash);
      expect(match).toBe(true);
    });
  });

  describe('Address Management CRUD (/api/v1/addresses)', () => {
    test('POST /api/v1/addresses: first address automatically becomes default', async () => {
      const res = await request(app)
        .post('/api/v1/addresses')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          name: 'Priya Home',
          phone: '9876543210',
          line1: 'Flat 402, Luxury Heights',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          type: ADDRESS_TYPE.HOME,
          isDefault: false, // Even if false, first address becomes default
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isDefault).toBe(true);
      expect(res.body.data.pincode).toBe('400001');
    });

    test('POST /api/v1/addresses: rejects invalid 6-digit PIN and 10-digit phone', async () => {
      // Invalid pincode
      const badPinRes = await request(app)
        .post('/api/v1/addresses')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          name: 'Priya Home',
          phone: '9876543210',
          line1: 'Flat 402, Luxury Heights',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '000123', // Invalid PIN
        });

      expect(badPinRes.status).toBe(400);

      // Invalid phone
      const badPhoneRes = await request(app)
        .post('/api/v1/addresses')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          name: 'Priya Home',
          phone: '1234567890', // Does not start with 6-9
          line1: 'Flat 402, Luxury Heights',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
        });

      expect(badPhoneRes.status).toBe(400);
    });

    test('POST /api/v1/addresses: new default unsets previous default', async () => {
      // First address
      const addr1 = await Address.create({
        customer: customerUser._id,
        name: 'Address 1',
        phone: '9876543210',
        line1: 'Line 1',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        isDefault: true,
      });

      // Second address created as default
      const res = await request(app)
        .post('/api/v1/addresses')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          name: 'Address 2',
          phone: '9876543210',
          line1: 'Line 2',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400002',
          isDefault: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.data.isDefault).toBe(true);

      const oldAddr1 = await Address.findById(addr1._id);
      expect(oldAddr1.isDefault).toBe(false);
    });

    test('POST /api/v1/addresses: enforces max 10 addresses limit', async () => {
      // Create 10 addresses
      for (let i = 1; i <= 10; i++) {
        await Address.create({
          customer: customerUser._id,
          name: `Address ${i}`,
          phone: '9876543210',
          line1: `Street ${i}`,
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          isDefault: i === 1,
        });
      }

      // 11th address should fail
      const res = await request(app)
        .post('/api/v1/addresses')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          name: 'Address 11',
          phone: '9876543210',
          line1: 'Street 11',
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Maximum 10 addresses allowed');
    });

    test('GET /api/v1/addresses returns customer addresses with default first', async () => {
      await Address.create({
        customer: customerUser._id,
        name: 'Work Address',
        phone: '9876543210',
        line1: 'Office park',
        city: 'Pune',
        state: 'Maharashtra',
        pincode: '411001',
        isDefault: false,
      });

      await Address.create({
        customer: customerUser._id,
        name: 'Home Address',
        phone: '9876543210',
        line1: 'Apartment 10',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        isDefault: true,
      });

      const res = await request(app)
        .get('/api/v1/addresses')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.data[0].name).toBe('Home Address');
      expect(res.body.data[0].isDefault).toBe(true);
    });

    test('GET /api/v1/addresses/:id prevents accessing other customer addresses', async () => {
      const otherAddr = await Address.create({
        customer: otherCustomerUser._id,
        name: 'Rohan Private',
        phone: '9876543211',
        line1: 'Private street',
        city: 'Delhi',
        state: 'Delhi',
        pincode: '110001',
      });

      const res = await request(app)
        .get(`/api/v1/addresses/${otherAddr._id}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(404);
    });

    test('PATCH /api/v1/addresses/:id updates fields', async () => {
      const addr = await Address.create({
        customer: customerUser._id,
        name: 'Old Name',
        phone: '9876543210',
        line1: 'Old Street',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
      });

      const res = await request(app)
        .patch(`/api/v1/addresses/${addr._id}`)
        .set('Authorization', `Bearer ${customerToken}`)
        .send({
          name: 'Updated Name',
          line1: 'New Street',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Updated Name');
      expect(res.body.data.line1).toBe('New Street');
    });

    test('PATCH /api/v1/addresses/:id/default atomically marks as default and unsets previous', async () => {
      const addr1 = await Address.create({
        customer: customerUser._id,
        name: 'Address 1',
        phone: '9876543210',
        line1: 'Street 1',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        isDefault: true,
      });

      const addr2 = await Address.create({
        customer: customerUser._id,
        name: 'Address 2',
        phone: '9876543210',
        line1: 'Street 2',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400002',
        isDefault: false,
      });

      const res = await request(app)
        .patch(`/api/v1/addresses/${addr2._id}/default`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.isDefault).toBe(true);

      const refreshedAddr1 = await Address.findById(addr1._id);
      expect(refreshedAddr1.isDefault).toBe(false);
    });

    test('DELETE /api/v1/addresses/:id: hard deletes and auto-promotes remaining address if default was deleted', async () => {
      const addr1 = await Address.create({
        customer: customerUser._id,
        name: 'Address 1 (Default)',
        phone: '9876543210',
        line1: 'Street 1',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        isDefault: true,
      });

      const addr2 = await Address.create({
        customer: customerUser._id,
        name: 'Address 2 (Secondary)',
        phone: '9876543210',
        line1: 'Street 2',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400002',
        isDefault: false,
      });

      const res = await request(app)
        .delete(`/api/v1/addresses/${addr1._id}`)
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.deleted).toBe(true);
      expect(res.body.data.newDefaultId.toString()).toBe(addr2._id.toString());

      // Verify addr1 deleted
      const checkDeleted = await Address.findById(addr1._id);
      expect(checkDeleted).toBeNull();

      // Verify addr2 auto-promoted to default
      const checkPromoted = await Address.findById(addr2._id);
      expect(checkPromoted.isDefault).toBe(true);
    });
  });
});
