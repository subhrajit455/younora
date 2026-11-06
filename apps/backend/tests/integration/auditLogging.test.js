const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = require('../../src/app');
const { env } = require('../../src/config/env');
const AdminUser = require('../../src/modules/users/models/adminUser.model');
const AuditLog = require('../../src/modules/audit/models/auditLog.model');
const { redactSensitiveData } = require('../../src/core/utils/redact');
const { ROLES, TOKEN_AUDIENCE, PERMISSIONS } = require('@younora/shared-constants');

describe('Slice 6: Audit Logging & Security Hardening', () => {
  let mongoServer;
  let superAdmin;
  let superAdminToken;
  let staffWithAudit;
  let staffWithAuditToken;
  let staffWithoutAudit;
  let staffWithoutAuditToken;

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
    await AuditLog.deleteMany({});

    const passwordHash = await bcrypt.hash('Admin@12345', 12);

    // Super Admin
    superAdmin = await AdminUser.create({
      name: 'Super Admin',
      email: 'superadmin@younora.com',
      passwordHash,
      role: ROLES.SUPER_ADMIN,
      permissions: [],
      isActive: true,
    });

    superAdminToken = jwt.sign(
      { sub: superAdmin._id.toString(), aud: TOKEN_AUDIENCE.ADMIN },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );

    // Staff with audit.read permission
    staffWithAudit = await AdminUser.create({
      name: 'Auditor Staff',
      email: 'auditor@younora.com',
      passwordHash,
      role: ROLES.STAFF,
      permissions: [PERMISSIONS.AUDIT_READ],
      isActive: true,
    });

    staffWithAuditToken = jwt.sign(
      { sub: staffWithAudit._id.toString(), aud: TOKEN_AUDIENCE.ADMIN },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );

    // Staff without audit.read permission
    staffWithoutAudit = await AdminUser.create({
      name: 'Regular Staff',
      email: 'staff@younora.com',
      passwordHash,
      role: ROLES.STAFF,
      permissions: [PERMISSIONS.PRODUCTS_READ],
      isActive: true,
    });

    staffWithoutAuditToken = jwt.sign(
      { sub: staffWithoutAudit._id.toString(), aud: TOKEN_AUDIENCE.ADMIN },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' }
    );
  });

  describe('Deep Redaction Utility', () => {
    test('redacts all sensitive keys recursively in nested structures', () => {
      const rawPayload = {
        name: 'Test Customer',
        password: 'PlainTextPassword123',
        nested: {
          token: 'jwt.token.here',
          payoutDetails: { bankAccount: '1234567890' },
          secret: 'api_secret',
          safeField: 'KeepThisValue',
        },
        items: [
          { passwordHash: '$2b$12$somehash', description: 'Item 1' },
          { refreshToken: 'token_val', description: 'Item 2' },
        ],
      };

      const sanitized = redactSensitiveData(rawPayload);

      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.nested.token).toBe('[REDACTED]');
      expect(sanitized.nested.payoutDetails).toBe('[REDACTED]');
      expect(sanitized.nested.secret).toBe('[REDACTED]');
      expect(sanitized.nested.safeField).toBe('KeepThisValue');
      expect(sanitized.items[0].passwordHash).toBe('[REDACTED]');
      expect(sanitized.items[0].description).toBe('Item 1');
      expect(sanitized.items[1].refreshToken).toBe('[REDACTED]');
    });
  });

  describe('Audit Log Triggers on Admin Operations', () => {
    test('records audit log on staff creation with actor and entity info', async () => {
      const res = await request(app)
        .post('/api/v1/admin/staff')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: 'New Support Staff',
          email: 'support@younora.com',
          password: 'Password@123',
          role: ROLES.STAFF,
          permissions: [PERMISSIONS.ORDERS_READ],
        });

      expect(res.status).toBe(201);

      const logs = await AuditLog.find({ action: 'staff.create' });
      expect(logs.length).toBe(1);
      expect(logs[0].actor.toString()).toBe(superAdmin._id.toString());
      expect(logs[0].entity).toBe('AdminUser');
      expect(logs[0].entityId).toBe(res.body.data.id.toString());
      expect(logs[0].after.email).toBe('support@younora.com');
      // Verify secrets never logged
      expect(logs[0].after.password).toBeUndefined();
      expect(logs[0].after.passwordHash).toBeUndefined();
    });

    test('records audit log on staff update with before and after state', async () => {
      // First update staff
      const updateRes = await request(app)
        .patch(`/api/v1/admin/staff/${staffWithoutAudit._id}`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          name: 'Renamed Staff',
          permissions: [PERMISSIONS.PRODUCTS_READ, PERMISSIONS.PRODUCTS_WRITE],
        });

      expect(updateRes.status).toBe(200);

      const log = await AuditLog.findOne({ action: 'staff.update' });
      expect(log).not.toBeNull();
      expect(log.before.name).toBe('Regular Staff');
      expect(log.after.name).toBe('Renamed Staff');
      expect(log.after.permissions).toContain(PERMISSIONS.PRODUCTS_WRITE);
    });

    test('records audit log on staff deactivation and reactivation', async () => {
      // Deactivate
      await request(app)
        .patch(`/api/v1/admin/staff/${staffWithoutAudit._id}/deactivate`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      const deactLog = await AuditLog.findOne({ action: 'staff.deactivate' });
      expect(deactLog).not.toBeNull();
      expect(deactLog.before.isActive).toBe(true);
      expect(deactLog.after.isActive).toBe(false);

      // Reactivate
      await request(app)
        .patch(`/api/v1/admin/staff/${staffWithoutAudit._id}/reactivate`)
        .set('Authorization', `Bearer ${superAdminToken}`);

      const reactLog = await AuditLog.findOne({ action: 'staff.reactivate' });
      expect(reactLog).not.toBeNull();
      expect(reactLog.before.isActive).toBe(false);
      expect(reactLog.after.isActive).toBe(true);
    });

    test('records audit log on admin password change without recording passwords', async () => {
      const res = await request(app)
        .post('/api/v1/admin/me/change-password')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          currentPassword: 'Admin@12345',
          newPassword: 'BrandNewAdminPassword@123',
        });

      expect(res.status).toBe(200);

      const log = await AuditLog.findOne({ action: 'auth.admin.password-change' });
      expect(log).not.toBeNull();
      expect(log.actor.toString()).toBe(superAdmin._id.toString());
      expect(log.after.passwordChangedAt).toBeDefined();
    });

    test('records audit log on admin login', async () => {
      const res = await request(app)
        .post('/api/v1/auth/admin/login')
        .send({
          email: 'superadmin@younora.com',
          password: 'Admin@12345',
        });

      expect(res.status).toBe(200);

      const log = await AuditLog.findOne({ action: 'auth.admin.login' });
      expect(log).not.toBeNull();
      expect(log.actor.toString()).toBe(superAdmin._id.toString());
      expect(log.entity).toBe('AdminUser');
    });
  });

  describe('GET /api/v1/admin/audit-logs (Access Control & Querying)', () => {
    beforeEach(async () => {
      // Pre-seed some audit logs
      await AuditLog.create([
        {
          actor: superAdmin._id,
          actorRole: ROLES.SUPER_ADMIN,
          actorEmail: superAdmin.email,
          action: 'staff.create',
          entity: 'AdminUser',
          entityId: staffWithAudit._id.toString(),
          after: { name: 'Auditor Staff' },
          createdAt: new Date(Date.now() - 3600000),
        },
        {
          actor: staffWithAudit._id,
          actorRole: ROLES.STAFF,
          actorEmail: staffWithAudit.email,
          action: 'inventory.adjust',
          entity: 'Batch',
          entityId: 'batch_123',
          before: { stock: 10 },
          after: { stock: 20 },
          createdAt: new Date(),
        },
      ]);
    });

    test('SUPER_ADMIN can list all audit logs with pagination meta', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(2);
      expect(res.body.meta.total).toBe(2);
      expect(res.body.meta.page).toBe(1);
    });

    test('Staff with audit.read permission can list audit logs', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', `Bearer ${staffWithAuditToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    test('Staff without audit.read permission receives 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', `Bearer ${staffWithoutAuditToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test('Unauthenticated request receives 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/admin/audit-logs');
      expect(res.status).toBe(401);
    });

    test('Customer token is rejected with 401 on audit log endpoint', async () => {
      const customerToken = jwt.sign(
        { sub: new mongoose.Types.ObjectId().toString(), aud: TOKEN_AUDIENCE.CUSTOMER },
        env.JWT_ACCESS_SECRET,
        { expiresIn: '15m' }
      );

      const res = await request(app)
        .get('/api/v1/admin/audit-logs')
        .set('Authorization', `Bearer ${customerToken}`);

      expect(res.status).toBe(401);
    });

    test('supports filtering by action and entity', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-logs')
        .query({ action: 'inventory.adjust' })
        .set('Authorization', `Bearer ${superAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].action).toBe('inventory.adjust');
      expect(res.body.data[0].entity).toBe('Batch');
    });

    test('Immutability: no update or delete routes exist for audit logs', async () => {
      const putRes = await request(app)
        .put('/api/v1/admin/audit-logs/some_id')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ action: 'tampered' });
      expect(putRes.status).toBe(404);

      const deleteRes = await request(app)
        .delete('/api/v1/admin/audit-logs/some_id')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(deleteRes.status).toBe(404);
    });
  });
});

