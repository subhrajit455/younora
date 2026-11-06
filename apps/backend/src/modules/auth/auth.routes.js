const { Router } = require('express');
const AuthController = require('./auth.controller');
const validate = require('../../core/middleware/validate');
const {
  adminLoginSchema,
  customerRegisterSchema,
  customerLoginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema,
} = require('./auth.validation');

const router = Router();

// Admin auth routes
router.post('/admin/login', validate({ body: adminLoginSchema }), AuthController.loginAdmin);
router.post('/admin/logout', AuthController.logoutAdmin);
router.post('/admin/refresh', AuthController.refreshAdmin);

// Customer auth routes
router.post(
  '/customer/register',
  validate({ body: customerRegisterSchema }),
  AuthController.registerCustomer
);
router.post(
  '/customer/login',
  validate({ body: customerLoginSchema }),
  AuthController.loginCustomer
);
router.post('/customer/logout', AuthController.logoutCustomer);
router.post('/customer/refresh', AuthController.refreshCustomer);
router.post(
  '/customer/forgot-password',
  validate({ body: forgotPasswordSchema }),
  AuthController.forgotPassword
);
router.post(
  '/customer/reset-password',
  validate({ body: resetPasswordSchema }),
  AuthController.resetPassword
);
router.post(
  '/customer/verify-email',
  validate({ body: verifyEmailSchema }),
  AuthController.verifyEmail
);
router.post(
  '/customer/resend-verification',
  validate({ body: resendVerificationSchema }),
  AuthController.resendVerification
);

module.exports = router;

