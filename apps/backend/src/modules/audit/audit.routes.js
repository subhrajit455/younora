const { Router } = require('express');
const AuditController = require('./audit.controller');
const authenticate = require('../../core/middleware/authenticate');
const { requirePermission } = require('../../core/middleware/authorize');
const validate = require('../../core/middleware/validate');
const { TOKEN_AUDIENCE, PERMISSIONS } = require('@younora/shared-constants');
const { auditQuerySchema } = require('./audit.validation');

const router = Router();

// GET /api/v1/admin/audit-logs
router.get(
  '/admin/audit-logs',
  authenticate(TOKEN_AUDIENCE.ADMIN),
  requirePermission(PERMISSIONS.AUDIT_READ),
  validate({ query: auditQuerySchema }),
  AuditController.listLogs
);

module.exports = router;

