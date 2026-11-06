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
  objectIdSchema,
} = require('./users.validation');

const router = Router();

const idParamsSchema = z.object({ id: objectIdSchema });

// Staff management routes — SUPER_ADMIN only
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

module.exports = router;

