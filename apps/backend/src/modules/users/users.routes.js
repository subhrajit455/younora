const { Router } = require('express');
const { z } = require('zod');
const UsersController = require('./users.controller');
const authenticate = require('../../core/middleware/authenticate');
const { authorizeRole } = require('../../core/middleware/authorize');
const validate = require('../../core/middleware/validate');
const { ROLES, TOKEN_AUDIENCE } = require('@younora/shared-constants');
const {
  createStaffSchema,
  updateStaffSchema,
  staffQuerySchema,
  updateAdminProfileSchema,
  updateCustomerProfileSchema,
  changePasswordSchema,
  createAddressSchema,
  updateAddressSchema,
  objectIdSchema,
} = require('./users.validation');

const router = Router();

const idParamsSchema = z.object({ id: objectIdSchema });

// ==========================================
// Admin Profile Routes
// ==========================================
router.get(
  '/admin/me',
  authenticate(TOKEN_AUDIENCE.ADMIN),
  UsersController.getAdminProfile
);
router.patch(
  '/admin/me',
  authenticate(TOKEN_AUDIENCE.ADMIN),
  validate({ body: updateAdminProfileSchema }),
  UsersController.updateAdminProfile
);
router.post(
  '/admin/me/change-password',
  authenticate(TOKEN_AUDIENCE.ADMIN),
  validate({ body: changePasswordSchema }),
  UsersController.changeAdminPassword
);

// ==========================================
// Staff Management Routes (SUPER_ADMIN only)
// ==========================================
router.use('/admin/staff', authenticate(TOKEN_AUDIENCE.ADMIN), authorizeRole(ROLES.SUPER_ADMIN));

router.post('/admin/staff', validate({ body: createStaffSchema }), UsersController.createStaff);
router.get('/admin/staff', validate({ query: staffQuerySchema }), UsersController.listStaff);
router.get('/admin/staff/:id', validate({ params: idParamsSchema }), UsersController.getStaffById);
router.patch(
  '/admin/staff/:id',
  validate({ params: idParamsSchema, body: updateStaffSchema }),
  UsersController.updateStaff
);
router.patch(
  '/admin/staff/:id/deactivate',
  validate({ params: idParamsSchema }),
  UsersController.deactivateStaff
);
router.patch(
  '/admin/staff/:id/reactivate',
  validate({ params: idParamsSchema }),
  UsersController.reactivateStaff
);

// ==========================================
// Customer Profile Routes
// ==========================================
router.get(
  '/me',
  authenticate(TOKEN_AUDIENCE.CUSTOMER),
  UsersController.getCustomerProfile
);
router.patch(
  '/me',
  authenticate(TOKEN_AUDIENCE.CUSTOMER),
  validate({ body: updateCustomerProfileSchema }),
  UsersController.updateCustomerProfile
);
router.post(
  '/me/change-password',
  authenticate(TOKEN_AUDIENCE.CUSTOMER),
  validate({ body: changePasswordSchema }),
  UsersController.changeCustomerPassword
);

// ==========================================
// Customer Address CRUD Routes
// ==========================================
router.get(
  '/addresses',
  authenticate(TOKEN_AUDIENCE.CUSTOMER),
  UsersController.listAddresses
);
router.post(
  '/addresses',
  authenticate(TOKEN_AUDIENCE.CUSTOMER),
  validate({ body: createAddressSchema }),
  UsersController.createAddress
);
router.get(
  '/addresses/:id',
  authenticate(TOKEN_AUDIENCE.CUSTOMER),
  validate({ params: idParamsSchema }),
  UsersController.getAddressById
);
router.patch(
  '/addresses/:id',
  authenticate(TOKEN_AUDIENCE.CUSTOMER),
  validate({ params: idParamsSchema, body: updateAddressSchema }),
  UsersController.updateAddress
);
router.delete(
  '/addresses/:id',
  authenticate(TOKEN_AUDIENCE.CUSTOMER),
  validate({ params: idParamsSchema }),
  UsersController.deleteAddress
);
router.patch(
  '/addresses/:id/default',
  authenticate(TOKEN_AUDIENCE.CUSTOMER),
  validate({ params: idParamsSchema }),
  UsersController.setDefaultAddress
);

module.exports = router;

