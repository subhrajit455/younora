const bcrypt = require('bcryptjs');
const { env } = require('../../config/env');
const { ROLES, USER_TYPES } = require('@younora/shared-constants');
const AdminUser = require('./models/adminUser.model');
const Customer = require('./models/customer.model');
const Address = require('./models/address.model');
const RefreshToken = require('./models/refreshToken.model');
const AuditService = require('../audit/audit.service');
const AppError = require('../../core/errors/appError');
const ERROR_CODES = require('../../core/errors/errorCodes');

class UsersService {
  /**
   * Create a new staff member (SUPER_ADMIN only)
   */
  static async createStaff(
    { name, email, password, role = ROLES.STAFF, permissions = [] },
    context = {}
  ) {
    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await AdminUser.findOne({ email: normalizedEmail });
    if (existingUser) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        `Admin user with email '${normalizedEmail}' already exists`
      );
    }

    const saltRounds = Math.max(env.BCRYPT_SALT_ROUNDS, 12);
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const newStaff = await AdminUser.create({
      name,
      email: normalizedEmail,
      passwordHash,
      role,
      permissions: role === ROLES.SUPER_ADMIN ? [] : permissions,
      isActive: true,
    });

    await AuditService.record({
      actor: context.actor,
      action: 'staff.create',
      entity: 'AdminUser',
      entityId: newStaff._id,
      before: null,
      after: {
        id: newStaff._id,
        name: newStaff.name,
        email: newStaff.email,
        role: newStaff.role,
        permissions: newStaff.permissions,
        isActive: newStaff.isActive,
      },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return {
      id: newStaff._id,
      name: newStaff.name,
      email: newStaff.email,
      role: newStaff.role,
      permissions: newStaff.permissions,
      isActive: newStaff.isActive,
      createdAt: newStaff.createdAt,
    };
  }

  /**
   * List staff members with pagination and filters
   */
  static async listStaff({ page = 1, limit = 20, search, isActive, role } = {}) {
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 20;

    const filter = {};

    if (typeof isActive === 'boolean') {
      filter.isActive = isActive;
    }

    if (role) {
      filter.role = role;
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (pageNum - 1) * limitNum;

    const [staff, total] = await Promise.all([
      AdminUser.find(filter)
        .select('-passwordHash')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      AdminUser.countDocuments(filter),
    ]);

    return {
      staff,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  /**
   * Get single staff member by ID
   */
  static async getStaffById(staffId) {
    const user = await AdminUser.findById(staffId).select('-passwordHash');
    if (!user) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Staff member not found');
    }
    return user;
  }

  /**
   * Update staff member (name, role, permissions)
   */
  static async updateStaff(staffId, updates, actorUser, context = {}) {
    const user = await AdminUser.findById(staffId);
    if (!user) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Staff member not found');
    }

    // Protection: Prevent demoting the last active Super Admin
    if (
      updates.role &&
      updates.role !== ROLES.SUPER_ADMIN &&
      user.role === ROLES.SUPER_ADMIN
    ) {
      const activeSuperAdminCount = await AdminUser.countDocuments({
        role: ROLES.SUPER_ADMIN,
        isActive: true,
      });

      if (activeSuperAdminCount <= 1) {
        throw new AppError(
          400,
          ERROR_CODES.BAD_REQUEST,
          'Cannot demote the last active Super Admin'
        );
      }
    }

    const before = {
      name: user.name,
      role: user.role,
      permissions: user.permissions,
    };

    if (updates.name !== undefined) user.name = updates.name;
    if (updates.role !== undefined) user.role = updates.role;
    if (updates.permissions !== undefined) user.permissions = updates.permissions;

    await user.save();

    await AuditService.record({
      actor: actorUser,
      action: 'staff.update',
      entity: 'AdminUser',
      entityId: user._id,
      before,
      after: {
        name: user.name,
        role: user.role,
        permissions: user.permissions,
      },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      permissions: user.permissions,
      isActive: user.isActive,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Deactivate staff member
   * Enforces Rule 8: Super Admin cannot deactivate themselves or the last active Super Admin
   */
  static async deactivateStaff(staffId, actorUser, context = {}) {
    if (staffId.toString() === actorUser._id.toString()) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        'Security guard: You cannot deactivate your own account'
      );
    }

    const user = await AdminUser.findById(staffId);
    if (!user) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Staff member not found');
    }

    if (user.role === ROLES.SUPER_ADMIN) {
      const activeSuperAdminCount = await AdminUser.countDocuments({
        role: ROLES.SUPER_ADMIN,
        isActive: true,
      });

      if (activeSuperAdminCount <= 1) {
        throw new AppError(
          400,
          ERROR_CODES.BAD_REQUEST,
          'Security guard: Cannot deactivate the last active Super Admin'
        );
      }
    }

    user.isActive = false;
    await user.save();

    // Revoke all active sessions immediately
    await RefreshToken.updateMany(
      { userId: user._id, userType: USER_TYPES.ADMIN, revokedAt: null },
      {
        $set: {
          revokedAt: new Date(),
          revokedReason: 'USER_DEACTIVATED',
        },
      }
    );

    await AuditService.record({
      actor: actorUser,
      action: 'staff.deactivate',
      entity: 'AdminUser',
      entityId: user._id,
      before: { isActive: true },
      after: { isActive: false },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return {
      id: user._id,
      email: user.email,
      isActive: false,
    };
  }

  /**
   * Reactivate staff member
   */
  static async reactivateStaff(staffId, actorUser, context = {}) {
    const user = await AdminUser.findById(staffId);
    if (!user) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Staff member not found');
    }

    user.isActive = true;
    await user.save();

    await AuditService.record({
      actor: actorUser,
      action: 'staff.reactivate',
      entity: 'AdminUser',
      entityId: user._id,
      before: { isActive: false },
      after: { isActive: true },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return {
      id: user._id,
      email: user.email,
      isActive: true,
    };
  }

  /**
   * Get authenticated admin profile
   */
  static async getAdminProfile(adminId) {
    const admin = await AdminUser.findById(adminId).select('-passwordHash');
    if (!admin) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Admin user not found');
    }
    return admin;
  }

  /**
   * Update admin profile (name only per Rule 7)
   */
  static async updateAdminProfile(adminId, { name }) {
    const admin = await AdminUser.findById(adminId);
    if (!admin) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Admin user not found');
    }

    admin.name = name;
    await admin.save();

    return {
      id: admin._id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      permissions: admin.permissions,
      updatedAt: admin.updatedAt,
    };
  }

  /**
   * Change admin password
   * Requires current password verification and revokes other active sessions
   */
  static async changeAdminPassword(adminId, currentPassword, newPassword, context = {}) {
    const admin = await AdminUser.findById(adminId).select('+passwordHash');
    if (!admin) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Admin user not found');
    }

    const isMatch = await bcrypt.compare(currentPassword, admin.passwordHash);
    if (!isMatch) {
      throw new AppError(401, ERROR_CODES.UNAUTHORIZED, 'Invalid current password');
    }

    const saltRounds = Math.max(env.BCRYPT_SALT_ROUNDS, 12);
    admin.passwordHash = await bcrypt.hash(newPassword, saltRounds);
    admin.passwordChangedAt = new Date();
    await admin.save();

    // Revoke all other active sessions for this admin
    await RefreshToken.updateMany(
      { userId: admin._id, userType: USER_TYPES.ADMIN, revokedAt: null },
      {
        $set: {
          revokedAt: new Date(),
          revokedReason: 'PASSWORD_CHANGED',
        },
      }
    );

    await AuditService.record({
      actor: admin,
      action: 'auth.admin.password-change',
      entity: 'AdminUser',
      entityId: admin._id,
      before: null,
      after: { passwordChangedAt: admin.passwordChangedAt },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return { message: 'Password updated successfully' };
  }

  /**
   * Get authenticated customer profile
   */
  static async getCustomerProfile(customerId) {
    const customer = await Customer.findById(customerId).select('-passwordHash');
    if (!customer) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Customer not found');
    }
    return customer;
  }

  /**
   * Update customer profile (name, gender, dob)
   */
  static async updateCustomerProfile(customerId, updates) {
    const customer = await Customer.findById(customerId);
    if (!customer) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Customer not found');
    }

    if (updates.name !== undefined) customer.name = updates.name;
    if (updates.gender !== undefined) customer.gender = updates.gender;
    if (updates.dob !== undefined) customer.dob = updates.dob;

    await customer.save();

    return {
      id: customer._id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      gender: customer.gender,
      dob: customer.dob,
      emailVerified: customer.emailVerified,
      isReseller: customer.isReseller,
      resellerStatus: customer.resellerStatus,
      updatedAt: customer.updatedAt,
    };
  }

  /**
   * Change customer password
   * Requires current password verification and revokes other active sessions
   */
  static async changeCustomerPassword(customerId, currentPassword, newPassword) {
    const customer = await Customer.findById(customerId).select('+passwordHash');
    if (!customer) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Customer not found');
    }

    const isMatch = await bcrypt.compare(currentPassword, customer.passwordHash);
    if (!isMatch) {
      throw new AppError(401, ERROR_CODES.UNAUTHORIZED, 'Invalid current password');
    }

    const saltRounds = Math.max(env.BCRYPT_SALT_ROUNDS, 12);
    customer.passwordHash = await bcrypt.hash(newPassword, saltRounds);
    customer.passwordChangedAt = new Date();
    await customer.save();

    // Revoke all other active sessions for this customer
    await RefreshToken.updateMany(
      { userId: customer._id, userType: USER_TYPES.CUSTOMER, revokedAt: null },
      {
        $set: {
          revokedAt: new Date(),
          revokedReason: 'PASSWORD_CHANGED',
        },
      }
    );

    return { message: 'Password updated successfully' };
  }

  /**
   * List addresses for customer
   */
  static async listAddresses(customerId) {
    return Address.find({ customer: customerId }).sort({ isDefault: -1, createdAt: -1 });
  }

  /**
   * Create new address for customer
   * Auto-promotes first address to default; unsets existing default if isDefault is true
   * Enforces max 10 addresses
   */
  static async createAddress(customerId, addressData) {
    const count = await Address.countDocuments({ customer: customerId });
    if (count >= 10) {
      throw new AppError(400, ERROR_CODES.BAD_REQUEST, 'Maximum 10 addresses allowed per customer');
    }

    const isDefault = count === 0 ? true : !!addressData.isDefault;

    if (isDefault) {
      await Address.updateMany(
        { customer: customerId, isDefault: true },
        { $set: { isDefault: false } }
      );
    }

    const address = await Address.create({
      ...addressData,
      customer: customerId,
      isDefault,
    });

    return address;
  }

  /**
   * Get address by ID for customer
   */
  static async getAddressById(customerId, addressId) {
    const address = await Address.findOne({ _id: addressId, customer: customerId });
    if (!address) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Address not found');
    }
    return address;
  }

  /**
   * Update address
   */
  static async updateAddress(customerId, addressId, updates) {
    const address = await Address.findOne({ _id: addressId, customer: customerId });
    if (!address) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Address not found');
    }

    if (updates.isDefault === true) {
      await Address.updateMany(
        { customer: customerId, _id: { $ne: addressId }, isDefault: true },
        { $set: { isDefault: false } }
      );
    }

    Object.assign(address, updates);
    await address.save();
    return address;
  }

  /**
   * Hard delete address
   * If deleted address was default, auto-promotes another address to default
   */
  static async deleteAddress(customerId, addressId) {
    const address = await Address.findOne({ _id: addressId, customer: customerId });
    if (!address) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Address not found');
    }

    const wasDefault = address.isDefault;
    await Address.deleteOne({ _id: addressId });

    let newDefaultId = null;
    if (wasDefault) {
      const nextAddress = await Address.findOne({ customer: customerId }).sort({ createdAt: -1 });
      if (nextAddress) {
        nextAddress.isDefault = true;
        await nextAddress.save();
        newDefaultId = nextAddress._id;
      }
    }

    return {
      id: addressId,
      deleted: true,
      newDefaultId,
    };
  }

  /**
   * Set address as default
   */
  static async setDefaultAddress(customerId, addressId) {
    const address = await Address.findOne({ _id: addressId, customer: customerId });
    if (!address) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Address not found');
    }

    await Address.updateMany(
      { customer: customerId, isDefault: true },
      { $set: { isDefault: false } }
    );

    address.isDefault = true;
    await address.save();
    return address;
  }
}

module.exports = UsersService;
