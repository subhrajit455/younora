const {
  ROLES,
  USER_TYPES,
  TOKEN_AUDIENCE,
  RESELLER_STATUS,
  ALL_PERMISSIONS,
  PERMISSIONS,
  ADDRESS_TYPE,
} = require('@younora/shared-constants');
const AdminUser = require('../../src/modules/users/models/adminUser.model');
const Customer = require('../../src/modules/users/models/customer.model');
const Address = require('../../src/modules/users/models/address.model');
const RefreshToken = require('../../src/modules/users/models/refreshToken.model');

describe('Slice 1: Models & Constants', () => {
  describe('Shared Constants & Permissions', () => {
    test('defines required roles, user types, and token audiences', () => {
      expect(ROLES.SUPER_ADMIN).toBe('SUPER_ADMIN');
      expect(ROLES.STAFF).toBe('STAFF');
      expect(ROLES.CUSTOMER).toBe('CUSTOMER');

      expect(USER_TYPES.ADMIN).toBe('ADMIN');
      expect(USER_TYPES.CUSTOMER).toBe('CUSTOMER');

      expect(TOKEN_AUDIENCE.ADMIN).toBe('younora:admin');
      expect(TOKEN_AUDIENCE.CUSTOMER).toBe('younora:customer');
    });

    test('defines canonical reseller statuses including NONE', () => {
      expect(RESELLER_STATUS.NONE).toBe('NONE');
      expect(RESELLER_STATUS.PENDING).toBe('PENDING');
      expect(RESELLER_STATUS.APPROVED).toBe('APPROVED');
      expect(RESELLER_STATUS.REJECTED).toBe('REJECTED');
      expect(RESELLER_STATUS.SUSPENDED).toBe('SUSPENDED');
    });

    test('contains full agreed permission list', () => {
      const requiredPermissions = [
        'inventory.view-cost',
        'resellers.view-sensitive',
        'reselling-invoices.read',
        'payouts.manage',
        'manual-returns.manage',
        'audit.read',
        'staff.manage',
        'products.read',
        'products.write',
        'orders.write',
        'returns.manage',
        'settings.manage',
      ];

      for (const perm of requiredPermissions) {
        expect(ALL_PERMISSIONS).toContain(perm);
      }

      expect(PERMISSIONS.INVENTORY_VIEW_COST).toBe('inventory.view-cost');
      expect(PERMISSIONS.RESELLERS_VIEW_SENSITIVE).toBe('resellers.view-sensitive');
      expect(PERMISSIONS.RESELLING_INVOICES_READ).toBe('reselling-invoices.read');
      expect(PERMISSIONS.PAYOUTS_MANAGE).toBe('payouts.manage');
      expect(PERMISSIONS.MANUAL_RETURNS_MANAGE).toBe('manual-returns.manage');
      expect(PERMISSIONS.AUDIT_READ).toBe('audit.read');
      expect(PERMISSIONS.STAFF_MANAGE).toBe('staff.manage');
    });
  });

  describe('AdminUser Model', () => {
    test('validates required fields, timestamps, defaults, and select: false on passwordHash', () => {
      const user = new AdminUser({
        name: 'Staff Member',
        email: 'STAFF@YOUNORA.COM',
        passwordHash: 'hashed_pw',
      });

      expect(user.name).toBe('Staff Member');
      expect(user.email).toBe('staff@younora.com'); // lowercase normalization
      expect(user.role).toBe(ROLES.STAFF); // default role
      expect(user.isActive).toBe(true);
      expect(user.failedLoginAttempts).toBe(0);
      expect(user.lockUntil).toBeNull();
      expect(user.lastLoginAt).toBeNull();
      expect(user.passwordChangedAt).toBeNull();

      // Check schema config for passwordHash select: false
      const pwPath = AdminUser.schema.path('passwordHash');
      expect(pwPath.options.select).toBe(false);
    });

    test('fails validation when email is invalid', () => {
      const user = new AdminUser({
        name: 'Invalid Email User',
        email: 'not-an-email',
        passwordHash: 'hash',
      });

      const err = user.validateSync();
      expect(err.errors.email).toBeDefined();
    });

    test('isLocked returns true only when lockUntil is in the future', () => {
      const user = new AdminUser({
        name: 'Admin',
        email: 'admin@younora.com',
        passwordHash: 'hash',
      });

      expect(user.isLocked()).toBe(false);

      user.lockUntil = new Date(Date.now() + 60000);
      expect(user.isLocked()).toBe(true);

      user.lockUntil = new Date(Date.now() - 60000);
      expect(user.isLocked()).toBe(false);
    });
  });

  describe('Customer Model', () => {
    test('resellerStatus is single source of truth and isReseller is a virtual', () => {
      const customer = new Customer({
        name: 'Jane Doe',
        email: 'JANE@EXAMPLE.COM',
        passwordHash: 'hash',
      });

      // Default state: resellerStatus is NONE, isReseller virtual is false
      expect(customer.resellerStatus).toBe(RESELLER_STATUS.NONE);
      expect(customer.isReseller).toBe(false);

      // Status PENDING -> isReseller false
      customer.resellerStatus = RESELLER_STATUS.PENDING;
      expect(customer.isReseller).toBe(false);

      // Status APPROVED -> isReseller true
      customer.resellerStatus = RESELLER_STATUS.APPROVED;
      expect(customer.isReseller).toBe(true);

      // Status REJECTED / SUSPENDED -> isReseller false
      customer.resellerStatus = RESELLER_STATUS.REJECTED;
      expect(customer.isReseller).toBe(false);

      customer.resellerStatus = RESELLER_STATUS.SUSPENDED;
      expect(customer.isReseller).toBe(false);

      // Verify serialization includes virtual
      const json = customer.toJSON();
      expect(json).toHaveProperty('isReseller', false);
    });

    test('validates customer defaults, timestamps, and passwordHash select: false', () => {
      const customer = new Customer({
        name: 'Jane Doe',
        email: 'JANE@EXAMPLE.COM',
      });

      expect(customer.name).toBe('Jane Doe');
      expect(customer.email).toBe('jane@example.com'); // lowercase normalization
      expect(customer.isBlocked).toBe(false);
      expect(customer.codRestricted).toBe(false);
      expect(customer.emailVerified).toBe(false);
      expect(customer.failedLoginAttempts).toBe(0);
      expect(customer.lockUntil).toBeNull();
      expect(customer.lastLoginAt).toBeNull();
      expect(customer.passwordChangedAt).toBeNull();
      expect(customer.payoutDetails).toEqual({});

      // Check schema config for passwordHash select: false
      const pwPath = Customer.schema.path('passwordHash');
      expect(pwPath.options.select).toBe(false);
    });

    test('validates Indian 10-digit phone format', () => {
      const validCustomer = new Customer({
        name: 'Valid Phone',
        phone: '9876543210',
      });
      expect(validCustomer.validateSync()).toBeUndefined();

      const invalidCustomer = new Customer({
        name: 'Invalid Phone',
        phone: '12345',
      });
      const err = invalidCustomer.validateSync();
      expect(err.errors.phone).toBeDefined();
    });
  });

  describe('Address Model', () => {
    test('validates Indian 6-digit pincode format', () => {
      const address = new Address({
        customer: '507f1f77bcf86cd799439011',
        name: 'Recipient Name',
        phone: '9876543210',
        line1: '123 Fashion Blvd',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        type: ADDRESS_TYPE.HOME,
      });

      expect(address.validateSync()).toBeUndefined();
      expect(address.country).toBe('IN');
      expect(address.isDefault).toBe(false);

      // Invalid pincode test
      address.pincode = '01234';
      const err = address.validateSync();
      expect(err.errors.pincode).toBeDefined();
    });
  });

  describe('RefreshToken Model', () => {
    test('validates userType, replacedAt for grace window, and token hash storage', () => {
      const token = new RefreshToken({
        userId: '507f1f77bcf86cd799439011',
        userType: USER_TYPES.ADMIN,
        userModel: 'AdminUser',
        tokenHash: 'sha256_mock_hash_value',
        family: 'mock-uuid-family-id',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      expect(token.validateSync()).toBeUndefined();
      expect(token.userType).toBe(USER_TYPES.ADMIN);
      expect(token.replacedByTokenHash).toBeNull();
      expect(token.replacedAt).toBeNull();
      expect(token.revokedAt).toBeNull();

      // Check tokenHash path config
      const hashPath = RefreshToken.schema.path('tokenHash');
      expect(hashPath.options.required).toBe(true);
      expect(hashPath.options.unique).toBe(true);

      // Check TTL index configuration
      const expiresPath = RefreshToken.schema.path('expiresAt');
      expect(expiresPath.options.index).toEqual({ expires: 0 });
    });
  });
});
