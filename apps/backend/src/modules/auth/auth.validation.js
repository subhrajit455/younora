const { z } = require('zod');

const adminLoginSchema = z.object({
  email: z.string({ required_error: 'Email is required' }).email('Valid email is required').trim().toLowerCase(),
  password: z.string({ required_error: 'Password is required' }).min(1, 'Password is required'),
});

module.exports = {
  adminLoginSchema,
};

