const AuditService = require('./audit.service');
const { sendSuccess } = require('../../core/http/response');

class AuditController {
  static async listLogs(req, res, next) {
    try {
      const result = await AuditService.listLogs(req.query);
      return sendSuccess(res, {
        message: 'Audit logs retrieved successfully',
        data: result.logs,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = AuditController;

