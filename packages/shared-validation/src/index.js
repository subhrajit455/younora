const { z } = require('zod');

/**
 * Common reusable Zod validation schemas
 */

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format');

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

module.exports = {
  z,
  objectIdSchema,
  paginationQuerySchema,
};

