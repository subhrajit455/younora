const { z } = require('zod');
const { ROLES, ALL_PERMISSIONS } = require('@younora/shared-constants');

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId format');

const createStaffSchema = z.object({
  name: z.string({ required_error: 'Name is required' }).trim().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string({ required_error: 'Email is required' }).email('Valid email is required').trim().toLowerCase(),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .max(128),
  role: z.enum([ROLES.SUPER_ADMIN, ROLES.STAFF]).default(ROLES.STAFF),
  permissions: z.array(z.enum(ALL_PERMISSIONS)).default([]),
});

const updateStaffSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  role: z.enum([ROLES.SUPER_ADMIN, ROLES.STAFF]).optional(),
  permissions: z.array(z.enum(ALL_PERMISSIONS)).optional(),
});

const staffQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  isActive: z
    .enum(['true', 'false', 'all'])
    .optional()
    .transform(val => {
      if (val === 'true') return true;
      if (val === 'false') return false;
      return undefined;
    }),
  role: z.enum([ROLES.SUPER_ADMIN, ROLES.STAFF]).optional(),
});

module.exports = {
  objectIdSchema,
  createStaffSchema,
  updateStaffSchema,
  staffQuerySchema,
};

