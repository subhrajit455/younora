const { Router } = require('express');
const AuthController = require('./auth.controller');
const validate = require('../../core/middleware/validate');
const { adminLoginSchema } = require('./auth.validation');

const router = Router();

// Admin auth routes
router.post('/admin/login', validate({ body: adminLoginSchema }), AuthController.loginAdmin);
router.post('/admin/logout', AuthController.logoutAdmin);
router.post('/admin/refresh', AuthController.refreshAdmin);

module.exports = router;

