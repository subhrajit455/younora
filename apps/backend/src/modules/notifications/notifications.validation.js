const { z } = require('zod');

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format');

const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  isRead: z
    .enum(['true', 'false', 'all'])
    .optional()
    .transform(val => {
      if (val === 'true') return true;
      if (val === 'false') return false;
      return undefined;
    }),
});

const notificationIdParamSchema = z.object({
  id: objectIdSchema,
});

module.exports = {
  objectIdSchema,
  listNotificationsQuerySchema,
  notificationIdParamSchema,
};

