const Coupon = require('./models/coupon.model');
const CouponUsage = require('./models/couponUsage.model');
const AppError = require('../../core/errors/appError');
const AuditLog = require('../audit/models/auditLog.model');
const { COUPON_TYPE } = require('@younora/shared-constants');

class CouponService {
  /**
   * Create a new coupon
   */
  async createCoupon(data, adminUser) {
    const code = (data.code || '').trim().toUpperCase();
    if (!code) {
      throw AppError.badRequest('Coupon code is required');
    }

    const existing = await Coupon.findOne({ code });
    if (existing) {
      throw AppError.conflict(`Coupon with code '${code}' already exists`);
    }

    if (data.type === COUPON_TYPE.PERCENT) {
      if (data.value <= 0 || data.value > 100) {
        throw AppError.badRequest('Percentage coupon value must be between 1 and 100');
      }
    } else if (data.type === COUPON_TYPE.FLAT) {
      if (!Number.isInteger(data.value) || data.value <= 0) {
        throw AppError.badRequest('Flat coupon value must be a positive integer in paise');
      }
    }

    if (data.startsAt && data.expiresAt) {
      const starts = new Date(data.startsAt);
      const expires = new Date(data.expiresAt);
      if (expires <= starts) {
        throw AppError.badRequest('Expiry date must be after start date');
      }
    }

    const coupon = new Coupon({
      ...data,
      code,
    });

    await coupon.save();

    if (AuditLog && adminUser) {
      await AuditLog.create({
        actor: {
          id: adminUser._id,
          role: adminUser.role,
          name: adminUser.fullName || adminUser.email,
        },
        action: 'COUPON_CREATE',
        entity: {
          type: 'Coupon',
          id: coupon._id,
        },
        changes: {
          after: coupon.toObject(),
        },
      }).catch(() => {});
    }

    return coupon;
  }

  /**
   * List coupons with pagination and filters
   */
  async getCoupons(query = {}) {
    const { page = 1, limit = 20, search, isActive, type, scope } = query;
    const filter = {};

    if (typeof isActive !== 'undefined') {
      filter.isActive = isActive === 'true' || isActive === true;
    }
    if (type) {
      filter.type = type;
    }
    if (scope) {
      filter.scope = scope;
    }
    if (search) {
      filter.code = { $regex: search.trim().toUpperCase(), $options: 'i' };
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [coupons, total] = await Promise.all([
      Coupon.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limitNum),
      Coupon.countDocuments(filter),
    ]);

    return {
      items: coupons,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  /**
   * Get coupon by ID
   */
  async getCouponById(id) {
    const coupon = await Coupon.findById(id);
    if (!coupon) {
      throw AppError.notFound('Coupon not found');
    }
    return coupon;
  }

  /**
   * Update coupon
   */
  async updateCoupon(id, updateData, adminUser) {
    const coupon = await Coupon.findById(id);
    if (!coupon) {
      throw AppError.notFound('Coupon not found');
    }

    // If code is modified, check uniqueness and ensure not already used
    if (updateData.code && updateData.code.trim().toUpperCase() !== coupon.code) {
      if (coupon.usedCount > 0) {
        throw AppError.badRequest('Cannot change coupon code after it has been used');
      }
      const newCode = updateData.code.trim().toUpperCase();
      const existing = await Coupon.findOne({ code: newCode, _id: { $ne: id } });
      if (existing) {
        throw AppError.conflict(`Coupon with code '${newCode}' already exists`);
      }
      coupon.code = newCode;
    }

    if (typeof updateData.value !== 'undefined') {
      const type = updateData.type || coupon.type;
      if (type === COUPON_TYPE.PERCENT && (updateData.value <= 0 || updateData.value > 100)) {
        throw AppError.badRequest('Percentage coupon value must be between 1 and 100');
      }
      if (type === COUPON_TYPE.FLAT && (!Number.isInteger(updateData.value) || updateData.value <= 0)) {
        throw AppError.badRequest('Flat coupon value must be a positive integer in paise');
      }
      coupon.value = updateData.value;
    }

    const fields = [
      'description',
      'type',
      'maxDiscount',
      'minCartValue',
      'scope',
      'scopeIds',
      'usageLimit',
      'perUserLimit',
      'startsAt',
      'expiresAt',
      'isActive',
      'firstOrderOnly',
      'paymentMethodRestriction',
    ];

    const before = coupon.toObject();

    fields.forEach((field) => {
      if (typeof updateData[field] !== 'undefined') {
        coupon[field] = updateData[field];
      }
    });

    if (coupon.startsAt && coupon.expiresAt && new Date(coupon.expiresAt) <= new Date(coupon.startsAt)) {
      throw AppError.badRequest('Expiry date must be after start date');
    }

    await coupon.save();

    if (AuditLog && adminUser) {
      await AuditLog.create({
        actor: {
          id: adminUser._id,
          role: adminUser.role,
          name: adminUser.fullName || adminUser.email,
        },
        action: 'COUPON_UPDATE',
        entity: {
          type: 'Coupon',
          id: coupon._id,
        },
        changes: {
          before,
          after: coupon.toObject(),
        },
      }).catch(() => {});
    }

    return coupon;
  }

  /**
   * Delete or deactivate coupon
   */
  async deleteCoupon(id, adminUser) {
    const coupon = await Coupon.findById(id);
    if (!coupon) {
      throw AppError.notFound('Coupon not found');
    }

    if (coupon.usedCount > 0) {
      coupon.isActive = false;
      await coupon.save();
    } else {
      await Coupon.findByIdAndDelete(id);
    }

    if (AuditLog && adminUser) {
      await AuditLog.create({
        actor: {
          id: adminUser._id,
          role: adminUser.role,
          name: adminUser.fullName || adminUser.email,
        },
        action: 'COUPON_DELETE',
        entity: {
          type: 'Coupon',
          id: coupon._id,
        },
      }).catch(() => {});
    }

    return { message: 'Coupon deleted or deactivated successfully' };
  }

  /**
   * Validate coupon eligibility for a cart or checkout
   */
  async validateCouponForCart(code, { customerId = null, paymentMethod = null } = {}) {
    if (!code) {
      throw AppError.badRequest('Coupon code is required');
    }

    const cleanCode = code.trim().toUpperCase();
    const coupon = await Coupon.findOne({ code: cleanCode });

    if (!coupon || !coupon.isActive) {
      throw AppError.badRequest(`Coupon '${cleanCode}' is invalid or inactive`);
    }

    const now = new Date();
    if (coupon.startsAt && now < new Date(coupon.startsAt)) {
      throw AppError.badRequest(`Coupon '${cleanCode}' is not active yet`);
    }

    if (coupon.expiresAt && now > new Date(coupon.expiresAt)) {
      throw AppError.badRequest(`Coupon '${cleanCode}' has expired`);
    }

    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      throw AppError.badRequest(`Coupon '${cleanCode}' usage limit has been reached`);
    }

    if (customerId && coupon.perUserLimit) {
      const userUsageCount = await CouponUsage.countDocuments({
        couponCode: cleanCode,
        customer: customerId,
      });

      if (userUsageCount >= coupon.perUserLimit) {
        throw AppError.badRequest(`You have reached the maximum usage limit for coupon '${cleanCode}'`);
      }
    }

    if (customerId && coupon.firstOrderOnly) {
      const priorUses = await CouponUsage.countDocuments({
        customer: customerId,
      });
      if (priorUses > 0) {
        throw AppError.badRequest(`Coupon '${cleanCode}' is valid only for first-time orders`);
      }
    }

    if (coupon.paymentMethodRestriction && paymentMethod && coupon.paymentMethodRestriction !== paymentMethod) {
      throw AppError.badRequest(`Coupon '${cleanCode}' is only valid for ${coupon.paymentMethodRestriction} payments`);
    }

    return coupon;
  }
}

module.exports = new CouponService();
