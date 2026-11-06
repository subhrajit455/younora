const bcrypt = require('bcryptjs');
const { env } = require('../../config/env');
const { ROLES, USER_TYPES } = require('@younora/shared-constants');
const AdminUser = require('./models/adminUser.model');
const RefreshToken = require('./models/refreshToken.model');
const AppError = require('../../core/errors/appError');
const ERROR_CODES = require('../../core/errors/errorCodes');

class UsersService {
  /**
   * Create a new staff member (SUPER_ADMIN only)
   */
  static async createStaff({ name, email, password, role = ROLES.STAFF, permissions = [] }) {
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
  static async updateStaff(staffId, updates, _actorUser) {
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

    if (updates.name !== undefined) user.name = updates.name;
    if (updates.role !== undefined) user.role = updates.role;
    if (updates.permissions !== undefined) user.permissions = updates.permissions;

    await user.save();

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
  static async deactivateStaff(staffId, actorUser) {
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

    return {
      id: user._id,
      email: user.email,
      isActive: false,
    };
  }

  /**
   * Reactivate staff member
   */
  static async reactivateStaff(staffId, _actorUser) {
    const user = await AdminUser.findById(staffId);
    if (!user) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, 'Staff member not found');
    }

    user.isActive = true;
    await user.save();

    return {
      id: user._id,
      email: user.email,
      isActive: true,
    };
  }
}

module.exports = UsersService;
