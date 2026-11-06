const { z } = require('zod');
const { ROLES, ALL_PERMISSIONS, ADDRESS_TYPE, GENDER } = require('@younora/shared-constants');

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

// Profile & Password Schemas
const updateAdminProfileSchema = z.object({
  name: z.string({ required_error: 'Name is required' }).trim().min(2, 'Name must be at least 2 characters').max(100),
});

const updateCustomerProfileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100).optional(),
  gender: z.enum(Object.values(GENDER)).optional(),
  dob: z.coerce.date().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string({ required_error: 'Current password is required' }),
  newPassword: z
    .string({ required_error: 'New password is required' })
    .min(8, 'New password must be at least 8 characters')
    .max(128)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    ),
});

// Address Schemas
const createAddressSchema = z.object({
  name: z.string({ required_error: 'Name is required' }).trim().min(2).max(100),
  phone: z
    .string({ required_error: 'Phone number is required' })
    .regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian phone number'),
  line1: z.string({ required_error: 'Address line 1 is required' }).trim().min(3).max(200),
  line2: z.string().trim().max(200).optional(),
  landmark: z.string().trim().max(100).optional(),
  city: z.string({ required_error: 'City is required' }).trim().min(2).max(100),
  state: z.string({ required_error: 'State is required' }).trim().min(2).max(100),
  pincode: z
    .string({ required_error: 'Pincode is required' })
    .regex(/^[1-9][0-9]{5}$/, 'Please enter a valid 6-digit Indian PIN code'),
  country: z.string().trim().default('IN'),
  type: z.enum(Object.values(ADDRESS_TYPE)).default(ADDRESS_TYPE.HOME),
  isDefault: z.boolean().default(false),
});

const updateAddressSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian phone number')
    .optional(),
  line1: z.string().trim().min(3).max(200).optional(),
  line2: z.string().trim().max(200).optional(),
  landmark: z.string().trim().max(100).optional(),
  city: z.string().trim().min(2).max(100).optional(),
  state: z.string().trim().min(2).max(100).optional(),
  pincode: z
    .string()
    .regex(/^[1-9][0-9]{5}$/, 'Please enter a valid 6-digit Indian PIN code')
    .optional(),
  country: z.string().trim().optional(),
  type: z.enum(Object.values(ADDRESS_TYPE)).optional(),
  isDefault: z.boolean().optional(),
});

module.exports = {
  objectIdSchema,
  createStaffSchema,
  updateStaffSchema,
  staffQuerySchema,
  updateAdminProfileSchema,
  updateCustomerProfileSchema,
  changePasswordSchema,
  createAddressSchema,
  updateAddressSchema,
};

