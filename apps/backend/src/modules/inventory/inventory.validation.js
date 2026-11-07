const { z } = require('zod');
const mongoose = require('mongoose');
const {
  BATCH_STATUS,
  STOCK_MOVEMENT_TYPE,
  ADJUSTMENT_REASON,
} = require('@younora/shared-constants');

const objectIdSchema = z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
  message: 'Invalid ObjectId',
});

const batchItemInputSchema = z.object({
  variant: objectIdSchema,
  qtyReceived: z.number().int().positive('qtyReceived must be a positive integer'),
  costPerUnit: z
    .number()
    .int()
    .nonnegative('costPerUnit must be a non-negative integer in paise')
    .nullable()
    .optional(),
});

const createBatchSchema = z.object({
  product: objectIdSchema,
  batchNo: z.string().trim().toUpperCase().min(3).max(60).optional(),
  receivedOn: z.coerce.date().optional(),
  supplier: z
    .object({
      name: z.string().trim().optional().default(''),
      ref: z.string().trim().optional().default(''),
    })
    .optional()
    .default({}),
  costPerUnit: z
    .number()
    .int()
    .nonnegative('costPerUnit must be a non-negative integer in paise')
    .nullable()
    .optional(),
  items: z.array(batchItemInputSchema).min(1, 'At least one variant item is required'),
  notes: z.string().trim().optional().default(''),
});

const receiveIntoBatchSchema = z.object({
  items: z.array(batchItemInputSchema).min(1, 'At least one variant item is required'),
  notes: z.string().trim().optional().default(''),
});

const updateBatchStatusSchema = z.object({
  status: z.enum(Object.values(BATCH_STATUS)),
  notes: z.string().trim().optional(),
});

const adjustStockSchema = z.object({
  variant: objectIdSchema,
  batch: objectIdSchema.nullable().optional(),
  qty: z
    .number()
    .int()
    .refine((val) => val !== 0, { message: 'Adjustment quantity cannot be zero' }),
  reason: z.enum(Object.values(ADJUSTMENT_REASON)),
  note: z.string().trim().min(3, 'A mandatory descriptive reason/note (min 3 chars) is required'),
});

const queryBatchSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  product: objectIdSchema.optional(),
  variant: objectIdSchema.optional(),
  status: z.enum(Object.values(BATCH_STATUS)).optional(),
  search: z.string().trim().optional(),
});

const queryMovementSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  variant: objectIdSchema.optional(),
  batch: objectIdSchema.optional(),
  type: z.enum(Object.values(STOCK_MOVEMENT_TYPE)).optional(),
});

const queryLowStockSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  outOfStockOnly: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

const searchBatchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Search query q is required'),
});

module.exports = {
  createBatchSchema,
  receiveIntoBatchSchema,
  updateBatchStatusSchema,
  adjustStockSchema,
  queryBatchSchema,
  queryMovementSchema,
  queryLowStockSchema,
  searchBatchQuerySchema,
};

