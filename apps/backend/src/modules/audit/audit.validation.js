const { z } = require('zod');

const auditQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  action: z.string().trim().optional(),
  entity: z.string().trim().optional(),
  entityId: z.string().trim().optional(),
  actorId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid actorId format').optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

module.exports = {
  auditQuerySchema,
};

