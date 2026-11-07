const express = require('express');
const settingsController = require('./settings.controller');
const authenticate = require('../../core/middleware/authenticate');
const { requireAnyPermission } = require('../../core/middleware/authorize');
const { TOKEN_AUDIENCE, PERMISSIONS } = require('@younora/shared-constants');

const adminSettingsRouter = express.Router();
const storeSettingsRouter = express.Router();

// ---------------------------------------------------------------------------
// Admin Settings Routes (/api/v1/admin/settings/*)
// ---------------------------------------------------------------------------
adminSettingsRouter.use(authenticate(TOKEN_AUDIENCE.ADMIN));

adminSettingsRouter.get(
  '/',
  requireAnyPermission(PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.PAYMENTS_SETTINGS),
  (req, res, next) => settingsController.getSettings(req, res, next)
);

adminSettingsRouter.patch(
  '/:section',
  requireAnyPermission(PERMISSIONS.SETTINGS_MANAGE, PERMISSIONS.PAYMENTS_SETTINGS),
  (req, res, next) => settingsController.updateSection(req, res, next)
);

// ---------------------------------------------------------------------------
// Public Store Settings Routes (/api/v1/store/settings/*)
// ---------------------------------------------------------------------------
storeSettingsRouter.get('/config', (req, res, next) =>
  settingsController.getPublicConfig(req, res, next)
);

module.exports = {
  adminSettingsRouter,
  storeSettingsRouter,
};

