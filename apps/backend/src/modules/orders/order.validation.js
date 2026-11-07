const { z } = require('zod');
const { PAYMENT_METHOD } = require('@younora/shared-constants');

const addressSchema = z.object({
  name: z.string().min(1, 'Name is required').trim(),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian phone number'),
  line1: z.string().min(1, 'Address line 1 is required').trim(),
  line2: z.string().trim().optional().default(''),
  landmark: z.string().trim().optional().default(''),
  city: z.string().min(1, 'City is required').trim(),
  state: z.string().min(1, 'State is required').trim(),
  stateCode: z.string().length(2, 'State code must be 2 digits (e.g. 07)').trim().default('07'),
  pincode: z
    .string()
    .trim()
    .regex(/^[1-9][0-9]{5}$/, 'Please enter a valid 6-digit Indian PIN code'),
  country: z.string().default('IN'),
});

const guestInfoSchema = z.object({
  name: z.string().min(1, 'Guest name is required').trim(),
  email: z.string().email('Please enter a valid email address').trim().toLowerCase(),
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian phone number'),
});

const checkoutItemSchema = z.object({
  variantId: z.string().min(1, 'variantId is required'),
  qty: z.coerce.number().int().min(1).max(10).default(1),
});

const checkoutPreviewSchema = z.object({
  items: z.array(checkoutItemSchema).optional(),
  shippingAddress: addressSchema.optional(),
  billingAddress: addressSchema.optional(),
  couponCode: z.string().trim().optional().nullable(),
  shareToken: z.string().trim().optional().nullable(),
  paymentMethod: z.nativeEnum(PAYMENT_METHOD).default(PAYMENT_METHOD.ONLINE),
  guestToken: z.string().trim().optional().nullable(),
  guest: guestInfoSchema.optional(),
});

const checkoutPlaceSchema = z.object({
  idempotencyKey: z
    .string({ required_error: 'idempotencyKey is required' })
    .min(1, 'idempotencyKey cannot be empty')
    .trim(),
  items: z.array(checkoutItemSchema).optional(),
  shippingAddress: addressSchema,
  billingAddress: addressSchema.optional(),
  couponCode: z.string().trim().optional().nullable(),
  shareToken: z.string().trim().optional().nullable(),
  paymentMethod: z.nativeEnum(PAYMENT_METHOD).default(PAYMENT_METHOD.ONLINE),
  guestToken: z.string().trim().optional().nullable(),
  guest: guestInfoSchema.optional(),
});

module.exports = {
  addressSchema,
  guestInfoSchema,
  checkoutPreviewSchema,
  checkoutPlaceSchema,
};

