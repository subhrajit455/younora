const { z } = require('zod');

const adminLoginSchema = z.object({
  email: z.string({ required_error: 'Email is required' }).email('Valid email is required').trim().toLowerCase(),
  password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required'),
});

const customerRegisterSchema = z.object({
  name: z.string({ required_error: 'Name is required' }).trim().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string({ required_error: 'Email is required' }).email('Valid email is required').trim().toLowerCase(),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian phone number')
    .optional(),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .max(128),
});

const customerLoginSchema = z.object({
  email: z.string({ required_error: 'Email is required' }).email('Valid email is required').trim().toLowerCase(),
  password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required'),
});

const forgotPasswordSchema = z.object({
  email: z.string({ required_error: 'Email is required' }).email('Valid email is required').trim().toLowerCase(),
});

const resetPasswordSchema = z.object({
  token: z.string({ required_error: 'Reset token is required' }).min(1, 'Reset token is required'),
  password: z
    .string({ required_error: 'Password is required' })
    .min(8, 'Password must be at least 8 characters')
    .max(128),
});

const verifyEmailSchema = z.object({
  token: z.string({ required_error: 'Verification token is required' }).min(1, 'Verification token is required'),
});

const resendVerificationSchema = z.object({
  email: z.string({ required_error: 'Email is required' }).email('Valid email is required').trim().toLowerCase(),
});

module.exports = {
  adminLoginSchema,
  customerRegisterSchema,
  customerLoginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  resendVerificationSchema,
};

