const AuditLog = require('./models/auditLog.model');
const { redactSensitiveData } = require('../../core/utils/redact');
const logger = require('../../core/logger');

class AuditService {
  /**
   * Record an immutable audit log entry with automatic redaction of sensitive fields.
   */
  static async record({
    actor,
    actorRole,
    actorEmail,
    action,
    entity,
    entityId,
    before = null,
    after = null,
    ip = null,
    userAgent = null,
  }) {
    try {
      let actorId = null;
      let role = actorRole;
      let email = actorEmail;

      if (actor && typeof actor === 'object') {
        actorId = actor._id || actor.id || null;
        role = role || actor.role || null;
        email = email || actor.email || null;
      } else if (actor) {
        actorId = actor;
      }

      const sanitizedBefore = before ? redactSensitiveData(before) : null;
      const sanitizedAfter = after ? redactSensitiveData(after) : null;

      const logEntry = await AuditLog.create({
        actor: actorId,
        actorRole: role,
        actorEmail: email,
        action,
        entity,
        entityId: entityId ? entityId.toString() : null,
        before: sanitizedBefore,
        after: sanitizedAfter,
        ip,
        userAgent,
      });

      return logEntry;
    } catch (error) {
      logger.error({ error, action, entity, entityId }, 'Failed to record audit log');
      return null;
    }
  }

  /**
   * List audit logs with pagination and filters
   */
  static async listLogs({
    page = 1,
    limit = 20,
    action,
    entity,
    entityId,
    actorId,
    startDate,
    endDate,
  } = {}) {
    const pageNum = Number(page) || 1;
    const limitNum = Number(limit) || 20;

    const filter = {};

    if (action) filter.action = action;
    if (entity) filter.entity = entity;
    if (entityId) filter.entityId = entityId.toString();
    if (actorId) filter.actor = actorId;

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.$gte = new Date(startDate);
      if (endDate) filter.createdAt.$lte = new Date(endDate);
    }

    const skip = (pageNum - 1) * limitNum;

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('actor', 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum),
      AuditLog.countDocuments(filter),
    ]);

    return {
      logs,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }
}

module.exports = AuditService;

