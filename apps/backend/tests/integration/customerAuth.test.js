const request = require('supertest');
const app = require('../../src/app');
const { startTestDb, stopTestDb, clearTestDb } = require('../helpers/testDb');
const Customer = require('../../src/modules/users/models/customer.model');
const RefreshToken = require('../../src/modules/users/models/refreshToken.model');
const mailer = require('../../src/core/mail/mailer');
const { hashToken } = require('../../src/core/utils/crypto');

describe('Slice 4: Customer Auth & Password Reset Flow', () => {
  beforeAll(async () => {
    await startTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    mailer.clearSentEmails();
  });

  describe('Customer Registration (POST /api/v1/auth/customer/register)', () => {
    test('registers customer, stores hashed token, sends verification email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/customer/register')
        .send({
          name: 'Priya Sharma',
          email: 'priya@example.com',
          phone: '9876543210',
          password: 'CustomerPass123!',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('priya@example.com');
      expect(res.body.data.emailVerified).toBe(false);

      // Verify email was sent
      const sentEmails = mailer.getSentEmails();
      expect(sentEmails.length).toBe(1);
      expect(sentEmails[0].to).toBe('priya@example.com');
      expect(sentEmails[0].subject).toContain('Verify');

      // Verify DB state
      const customer = await Customer.findOne({ email: 'priya@example.com' }).select(
        '+emailVerificationTokenHash +emailVerificationExpiresAt'
      );
      expect(customer).not.toBeNull();
      expect(customer.emailVerificationTokenHash).toBeDefined();
      expect(customer.emailVerificationExpiresAt).toBeDefined();
    });

    test('rejects duplicate email with 409 Conflict', async () => {
      await request(app)
        .post('/api/v1/auth/customer/register')
        .send({
          name: 'Priya Sharma',
          email: 'priya@example.com',
          password: 'CustomerPass123!',
        });

      const res = await request(app)
        .post('/api/v1/auth/customer/register')
        .send({
          name: 'Priya Duplicate',
          email: 'PRIYA@EXAMPLE.COM',
          password: 'AnotherPassword123!',
        });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CONFLICT');
    });
  });

  describe('Email Verification & Resend', () => {
    let rawToken;
    const email = 'verify.test@example.com';

    beforeEach(async () => {
      rawToken = 'sample-verification-token-32bytes-hex';
      const tokenHash = hashToken(rawToken);

      await Customer.create({
        name: 'Verify User',
        email,
        passwordHash: 'hash',
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        emailVerified: false,
      });
    });

    test('verifies email with valid token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/customer/verify-email')
        .send({ token: rawToken });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Email verified successfully');

      const customer = await Customer.findOne({ email });
      expect(customer.emailVerified).toBe(true);
    });

    test('rejects invalid verification token with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/v1/auth/customer/verify-email')
        .send({ token: 'wrong-or-invalid-token' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('invalid or has expired');
    });

    test('resend verification generates new token and sends email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/customer/resend-verification')
        .send({ email });

      expect(res.status).toBe(200);
      const sentEmails = mailer.getSentEmails();
      expect(sentEmails.length).toBe(1);
      expect(sentEmails[0].to).toBe(email);
    });
  });

  describe('Customer Login (POST /api/v1/auth/customer/login)', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/v1/auth/customer/register')
        .send({
          name: 'Login Customer',
          email: 'login.customer@example.com',
          password: 'Password@123',
        });
    });

    test('authenticates valid credentials, sets ynr_cust_rt cookie, returns customer token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/customer/login')
        .send({
          email: 'login.customer@example.com',
          password: 'Password@123',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data.user.email).toBe('login.customer@example.com');
      expect(res.body.data.user).toHaveProperty('isReseller', false);

      // Verify cookie
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const rtCookie = cookies.find(c => c.startsWith('ynr_cust_rt='));
      expect(rtCookie).toBeDefined();
      expect(rtCookie).toContain('HttpOnly');
      expect(rtCookie).toContain('Path=/api/v1/auth/customer');
    });

    test('returns generic 401 on wrong password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/customer/login')
        .send({
          email: 'login.customer@example.com',
          password: 'WrongPassword!',
        });

      expect(res.status).toBe(401);
      expect(res.body.message).toBe('Invalid email or password');
    });

    test('locks account after 5 consecutive failed attempts', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/v1/auth/customer/login')
          .send({
            email: 'login.customer@example.com',
            password: 'WrongPassword!',
          });
      }

      const res = await request(app)
        .post('/api/v1/auth/customer/login')
        .send({
          email: 'login.customer@example.com',
          password: 'Password@123',
        });

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Account temporarily locked');
    });

    test('rejects blocked customer with block reason', async () => {
      await Customer.updateOne(
        { email: 'login.customer@example.com' },
        { isBlocked: true, blockReason: 'Suspected payment fraud' }
      );

      const res = await request(app)
        .post('/api/v1/auth/customer/login')
        .send({
          email: 'login.customer@example.com',
          password: 'Password@123',
        });

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Suspected payment fraud');
    });
  });

  describe('Audience Isolation: Customer Token Rejected on Admin Routes', () => {
    test('customer access token is rejected on admin endpoints with 401', async () => {
      await request(app)
        .post('/api/v1/auth/customer/register')
        .send({
          name: 'Regular Customer',
          email: 'regular@example.com',
          password: 'Password@123',
        });

      const loginRes = await request(app)
        .post('/api/v1/auth/customer/login')
        .send({
          email: 'regular@example.com',
          password: 'Password@123',
        });

      const customerAccessToken = loginRes.body.data.accessToken;

      const adminRes = await request(app)
        .get('/api/v1/admin/staff')
        .set('Authorization', `Bearer ${customerAccessToken}`);

      expect(adminRes.status).toBe(401);
    });
  });

  describe('Customer Refresh Token Rotation & Grace Window', () => {
    let initialCookie;

    beforeEach(async () => {
      await request(app)
        .post('/api/v1/auth/customer/register')
        .send({
          name: 'Refresh Customer',
          email: 'refresh.customer@example.com',
          password: 'Password@123',
        });

      const loginRes = await request(app)
        .post('/api/v1/auth/customer/login')
        .send({
          email: 'refresh.customer@example.com',
          password: 'Password@123',
        });

      initialCookie = loginRes.headers['set-cookie'];
    });

    test('rotates refresh token and sets new cookie', async () => {
      const res = await request(app)
        .post('/api/v1/auth/customer/refresh')
        .set('Cookie', initialCookie);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('accessToken');
      const newCookie = res.headers['set-cookie'];
      expect(newCookie).toBeDefined();
      expect(newCookie).not.toEqual(initialCookie);
    });

    test('grace window: parallel refresh within 10s succeeds', async () => {
      // First refresh rotates
      const res1 = await request(app)
        .post('/api/v1/auth/customer/refresh')
        .set('Cookie', initialCookie);
      expect(res1.status).toBe(200);

      // Second parallel refresh using same initial cookie within 10s succeeds
      const res2 = await request(app)
        .post('/api/v1/auth/customer/refresh')
        .set('Cookie', initialCookie);
      expect(res2.status).toBe(200);
    });

    test('reuse detection after grace window revokes all sessions in family', async () => {
      // First refresh
      await request(app)
        .post('/api/v1/auth/customer/refresh')
        .set('Cookie', initialCookie);

      // Simulate grace window expiration (>10s)
      await RefreshToken.updateOne(
        { replacedByTokenHash: { $ne: null } },
        { replacedAt: new Date(Date.now() - 15000) }
      );

      // Replay old cookie
      const replayRes = await request(app)
        .post('/api/v1/auth/customer/refresh')
        .set('Cookie', initialCookie);

      expect(replayRes.status).toBe(401);
      expect(replayRes.body.message).toContain('Token reuse detected');

      // Verify sessions revoked
      const activeSessions = await RefreshToken.countDocuments({ revokedAt: null });
      expect(activeSessions).toBe(0);
    });
  });

  describe('Forgot & Reset Password Flow', () => {
    const email = 'reset.flow@example.com';

    beforeEach(async () => {
      await request(app)
        .post('/api/v1/auth/customer/register')
        .send({
          name: 'Reset Flow User',
          email,
          password: 'OldPassword123!',
        });
      mailer.clearSentEmails();
    });

    test('forgot-password always returns 200 (enumeration protection) and sends email if exists', async () => {
      // For existing email
      const res1 = await request(app)
        .post('/api/v1/auth/customer/forgot-password')
        .send({ email });

      expect(res1.status).toBe(200);
      expect(res1.body.message).toContain('If an account exists');
      expect(mailer.getSentEmails().length).toBe(1);

      // For non-existing email
      mailer.clearSentEmails();
      const res2 = await request(app)
        .post('/api/v1/auth/customer/forgot-password')
        .send({ email: 'nonexistent@example.com' });

      expect(res2.status).toBe(200);
      expect(res2.body.message).toContain('If an account exists');
      expect(mailer.getSentEmails().length).toBe(0);
    });

    test('reset-password with valid token updates password and revokes existing sessions', async () => {
      // Trigger forgot password to generate token
      await request(app)
        .post('/api/v1/auth/customer/forgot-password')
        .send({ email });

      // Retrieve customer and reset token hash
      const customer = await Customer.findOne({ email }).select(
        '+passwordResetTokenHash +passwordResetExpiresAt'
      );
      expect(customer.passwordResetTokenHash).toBeDefined();

      // Simulate a known reset token
      const rawResetToken = 'test-reset-token-32bytes-hex';
      customer.passwordResetTokenHash = hashToken(rawResetToken);
      customer.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
      await customer.save();

      // Also create an active refresh token session for customer
      await RefreshToken.create({
        userId: customer._id,
        userType: 'CUSTOMER',
        userModel: 'Customer',
        tokenHash: 'active-session-before-reset',
        family: 'cust-family-reset',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      // Reset password
      const resetRes = await request(app)
        .post('/api/v1/auth/customer/reset-password')
        .send({
          token: rawResetToken,
          password: 'NewBrandPassword@123',
        });

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.message).toContain('Password has been reset successfully');

      // Verify existing sessions were revoked
      const activeSessions = await RefreshToken.find({
        userId: customer._id,
        revokedAt: null,
      });
      expect(activeSessions.length).toBe(0);

      // Verify can login with new password
      const loginRes = await request(app)
        .post('/api/v1/auth/customer/login')
        .send({
          email,
          password: 'NewBrandPassword@123',
        });

      expect(loginRes.status).toBe(200);

      // Old password fails
      const oldLoginRes = await request(app)
        .post('/api/v1/auth/customer/login')
        .send({
          email,
          password: 'OldPassword123!',
        });

      expect(oldLoginRes.status).toBe(401);
    });
  });
});

