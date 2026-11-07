const express = require('express');
const couponController = require('./coupon.controller');
const authenticate = require('../../core/middleware/authenticate');
const { requirePermission } = require('../../core/middleware/authorize');
const { TOKEN_AUDIENCE, PERMISSIONS } = require('@younora/shared-constants');

const adminCouponRouter = express.Router();

adminCouponRouter.use(authenticate(TOKEN_AUDIENCE.ADMIN));

adminCouponRouter.post(
  '/',
  requirePermission(PERMISSIONS.COUPONS_MANAGE),
  (req, res, next) => couponController.createCoupon(req, res, next)
);

adminCouponRouter.get(
  '/',
  requirePermission(PERMISSIONS.COUPONS_MANAGE),
  (req, res, next) => couponController.getCoupons(req, res, next)
);

adminCouponRouter.get(
  '/:id',
  requirePermission(PERMISSIONS.COUPONS_MANAGE),
  (req, res, next) => couponController.getCouponById(req, res, next)
);

adminCouponRouter.patch(
  '/:id',
  requirePermission(PERMISSIONS.COUPONS_MANAGE),
  (req, res, next) => couponController.updateCoupon(req, res, next)
);

adminCouponRouter.delete(
  '/:id',
  requirePermission(PERMISSIONS.COUPONS_MANAGE),
  (req, res, next) => couponController.deleteCoupon(req, res, next)
);

module.exports = {
  adminCouponRouter,
};

