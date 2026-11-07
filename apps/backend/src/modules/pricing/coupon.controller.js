const couponService = require('./coupon.service');
const { sendSuccess } = require('../../core/http/response');

class CouponController {
  async createCoupon(req, res, next) {
    try {
      const coupon = await couponService.createCoupon(req.body, req.user);
      return sendSuccess(res, {
        statusCode: 201,
        message: 'Coupon created successfully',
        data: coupon,
      });
    } catch (err) {
      return next(err);
    }
  }

  async getCoupons(req, res, next) {
    try {
      const result = await couponService.getCoupons(req.query);
      return sendSuccess(res, {
        message: 'Coupons retrieved successfully',
        data: result.items,
        meta: result.pagination,
      });
    } catch (err) {
      return next(err);
    }
  }

  async getCouponById(req, res, next) {
    try {
      const coupon = await couponService.getCouponById(req.params.id);
      return sendSuccess(res, {
        message: 'Coupon retrieved successfully',
        data: coupon,
      });
    } catch (err) {
      return next(err);
    }
  }

  async updateCoupon(req, res, next) {
    try {
      const coupon = await couponService.updateCoupon(req.params.id, req.body, req.user);
      return sendSuccess(res, {
        message: 'Coupon updated successfully',
        data: coupon,
      });
    } catch (err) {
      return next(err);
    }
  }

  async deleteCoupon(req, res, next) {
    try {
      const result = await couponService.deleteCoupon(req.params.id, req.user);
      return sendSuccess(res, {
        message: result.message,
      });
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new CouponController();

