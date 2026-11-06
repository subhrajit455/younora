const { z } = require('zod');
const mongoose = require('mongoose');

const objectIdSchema = z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
  message: 'Invalid ObjectId',
});

const imageInputSchema = z
  .object({
    url: z.string().url().or(z.string().min(1)),
    publicId: z.string().min(1),
  })
  .nullable()
  .optional();

// --- Audience Validation ---
const createAudienceSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  slug: z.string().trim().toLowerCase().max(120).optional(),
  image: imageInputSchema,
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const updateAudienceSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  slug: z.string().trim().toLowerCase().max(120).optional(),
  image: imageInputSchema,
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

// --- Category Validation ---
const createCategorySchema = z.object({
  audience: objectIdSchema,
  name: z.string().trim().min(1, 'Name is required').max(100),
  slug: z.string().trim().toLowerCase().max(120).optional(),
  image: imageInputSchema,
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  defaultSizeChart: objectIdSchema.nullable().optional(),
});

const updateCategorySchema = z.object({
  audience: objectIdSchema.optional(),
  name: z.string().trim().min(1).max(100).optional(),
  slug: z.string().trim().toLowerCase().max(120).optional(),
  image: imageInputSchema,
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  defaultSizeChart: objectIdSchema.nullable().optional(),
});

// --- Subcategory Validation ---
const createSubcategorySchema = z.object({
  category: objectIdSchema,
  name: z.string().trim().min(1, 'Name is required').max(100),
  slug: z.string().trim().toLowerCase().max(120).optional(),
  image: imageInputSchema,
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const updateSubcategorySchema = z.object({
  category: objectIdSchema.optional(),
  name: z.string().trim().min(1).max(100).optional(),
  slug: z.string().trim().toLowerCase().max(120).optional(),
  image: imageInputSchema,
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

// --- Reorder Validation ---
const reorderSchema = z.object({
  items: z.array(
    z.object({
      id: objectIdSchema,
      sortOrder: z.number().int(),
    })
  ).min(1, 'At least one item is required for reordering'),
});

// --- Attribute Validation ---
const createAttributeSchema = z.object({
  type: z.enum(['COLOR', 'FABRIC', 'FIT', 'PATTERN', 'OCCASION', 'SLEEVE', 'NECK']),
  name: z.string().trim().min(1, 'Attribute name is required').max(100),
  value: z.string().trim().max(100).optional().default(''),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const updateAttributeSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  value: z.string().trim().max(100).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

const queryAttributeSchema = z.object({
  type: z.enum(['COLOR', 'FABRIC', 'FIT', 'PATTERN', 'OCCASION', 'SLEEVE', 'NECK']).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  search: z.string().trim().optional(),
});

// --- Size Chart Validation ---
const sizeChartRowInputSchema = z.object({
  size: z.string().trim().min(1, 'Size label is required'),
  values: z.record(z.union([z.string(), z.number()])),
});

const createSizeChartSchema = z.object({
  name: z.string().trim().min(1, 'Size chart name is required').max(150),
  category: objectIdSchema.nullable().optional(),
  unit: z.enum(['INCH', 'CM']).default('INCH'),
  columns: z.array(z.string().trim().min(1)).min(1, 'At least one column is required'),
  rows: z.array(sizeChartRowInputSchema).default([]),
});

const updateSizeChartSchema = z.object({
  name: z.string().trim().min(1).max(150).optional(),
  category: objectIdSchema.nullable().optional(),
  unit: z.enum(['INCH', 'CM']).optional(),
  columns: z.array(z.string().trim().min(1)).min(1).optional(),
  rows: z.array(sizeChartRowInputSchema).optional(),
});

const queryPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  includeInactive: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  audience: objectIdSchema.optional(),
  category: objectIdSchema.optional(),
});

module.exports = {
  objectIdSchema,
  createAudienceSchema,
  updateAudienceSchema,
  createCategorySchema,
  updateCategorySchema,
  createSubcategorySchema,
  updateSubcategorySchema,
  createAttributeSchema,
  updateAttributeSchema,
  queryAttributeSchema,
  createSizeChartSchema,
  updateSizeChartSchema,
  reorderSchema,
  queryPaginationSchema,
};
