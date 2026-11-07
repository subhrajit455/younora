const settingsService = require('./settings.service');
const { sendSuccess } = require('../../core/http/response');

class SettingsController {
  async getSettings(req, res, next) {
    try {
      const data = await settingsService.getSettings();
      return sendSuccess(res, {
        message: 'Settings retrieved successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async getPublicConfig(req, res, next) {
    try {
      const data = await settingsService.getPublicConfig();
      return sendSuccess(res, {
        message: 'Public store configuration retrieved successfully',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }

  async updateSection(req, res, next) {
    try {
      const data = await settingsService.updateSection(req.params.section, req.body, {
        actor: req.user,
      });
      return sendSuccess(res, {
        message: `Settings section '${req.params.section}' updated successfully`,
        data,
      });
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new SettingsController();

