const { z } = require('zod');
const mongoose = require('mongoose');
const { PRODUCT_STATUS } = require('@younora/shared-constants');

const objectIdSchema = z.string().refine((val) => mongoose.Types.ObjectId.isValid(val), {
  message: 'Invalid ObjectId',
});

const colorImageSchema = z.object({
  url: z.string().url('Invalid image URL'),
  publicId: z.string().min(1, 'publicId is required'),
  alt: z.string().trim().optional().default(''),
  sortOrder: z.number().int().optional().default(0),
});

const colorOptionSchema = z.object({
  name: z.string().trim().min(1, 'Color name is required'),
  hex: z.string().trim().optional().default(''),
  images: z.array(colorImageSchema).min(1, 'At least 1 image is required per color'),
  video: z
    .object({
      url: z.string().url(),
      publicId: z.string(),
    })
    .nullable()
    .optional(),
});

const variantInputSchema = z.object({
  id: objectIdSchema.optional(),
  sku: z.string().trim().toUpperCase().optional(),
  barcode: z.string().trim().nullable().optional(),
  color: z.object({
    name: z.string().trim().min(1, 'Color name is required'),
    hex: z.string().trim().optional().default(''),
  }),
  size: z.string().trim().toUpperCase().min(1, 'Size is required'),
  mrp: z.number().int().nonnegative('MRP must be a non-negative integer in paise'),
  sellingPrice: z.number().int().nonnegative('Selling price must be a non-negative integer in paise'),
  costPrice: z.number().int().nonnegative('Cost price must be a non-negative integer in paise'),
  stock: z.number().int().nonnegative('Stock must be non-negative').default(0),
  lowStockThreshold: z.number().int().nonnegative().default(5),
  weightGrams: z.number().nonnegative().optional().default(0),
  lengthCm: z.number().nonnegative().optional().default(0),
  breadthCm: z.number().nonnegative().optional().default(0),
  heightCm: z.number().nonnegative().optional().default(0),
  isActive: z.boolean().optional().default(true),
});

const createProductSchema = z
  .object({
    name: z.string().trim().min(1, 'Product name is required').max(200),
    slug: z.string().trim().toLowerCase().max(250).optional(),
    description: z.string().trim().min(1, 'Description is required'),
    highlights: z.array(z.string().trim()).optional().default([]),
    audience: objectIdSchema,
    category: objectIdSchema,
    subcategory: objectIdSchema,
    brand: z.string().trim().default('Younora'),
    fabric: z.string().trim().optional().default(''),
    fit: z.string().trim().optional().default(''),
    pattern: z.string().trim().optional().default(''),
    occasion: z.string().trim().optional().default(''),
    careInstructions: z.string().trim().optional().default(''),
    countryOfOrigin: z.string().trim().default('India'),
    hsnCode: z.string().trim().optional().default(''),
    gstPercent: z.enum(['0', '5', '12', '18', '28']).transform(Number).default('12'),
    sizeChart: objectIdSchema.nullable().optional(),
    tags: z.array(z.string().trim()).optional().default([]),
    seo: z
      .object({
        title: z.string().trim().optional().default(''),
        description: z.string().trim().optional().default(''),
        keywords: z.array(z.string().trim()).optional().default([]),
      })
      .optional()
      .default({}),
    returnPolicyText: z.string().trim().optional(),
    colors: z.array(colorOptionSchema).min(1, 'Product must have at least one color option'),
    variants: z.array(variantInputSchema).min(1, 'Product must have at least one variant'),
    status: z.enum(Object.values(PRODUCT_STATUS)).default(PRODUCT_STATUS.DRAFT),
    isFeatured: z.boolean().optional().default(false),
    isNewArrival: z.boolean().optional().default(true),
    isBestSeller: z.boolean().optional().default(false),
    resellingEnabled: z.boolean().optional().default(true),
  })
  .refine(
    (data) => {
      // Ensure sellingPrice <= mrp for every variant
      return data.variants.every((v) => v.sellingPrice <= v.mrp);
    },
    {
      message: 'Selling price cannot exceed MRP for any variant',
      path: ['variants'],
    }
  );

const updateProductSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    slug: z.string().trim().toLowerCase().max(250).optional(),
    description: z.string().trim().min(1).optional(),
    highlights: z.array(z.string().trim()).optional(),
    audience: objectIdSchema.optional(),
    category: objectIdSchema.optional(),
    subcategory: objectIdSchema.optional(),
    brand: z.string().trim().optional(),
    fabric: z.string().trim().optional(),
    fit: z.string().trim().optional(),
    pattern: z.string().trim().optional(),
    occasion: z.string().trim().optional(),
    careInstructions: z.string().trim().optional(),
    countryOfOrigin: z.string().trim().optional(),
    hsnCode: z.string().trim().optional(),
    gstPercent: z.enum(['0', '5', '12', '18', '28']).transform(Number).optional(),
    sizeChart: objectIdSchema.nullable().optional(),
    tags: z.array(z.string().trim()).optional(),
    seo: z
      .object({
        title: z.string().trim().optional(),
        description: z.string().trim().optional(),
        keywords: z.array(z.string().trim()).optional(),
      })
      .optional(),
    returnPolicyText: z.string().trim().optional(),
    colors: z.array(colorOptionSchema).min(1).optional(),
    variants: z.array(variantInputSchema).min(1).optional(),
    status: z.enum(Object.values(PRODUCT_STATUS)).optional(),
    isFeatured: z.boolean().optional(),
    isNewArrival: z.boolean().optional(),
    isBestSeller: z.boolean().optional(),
    resellingEnabled: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (!data.variants) return true;
      return data.variants.every((v) => v.sellingPrice <= v.mrp);
    },
    {
      message: 'Selling price cannot exceed MRP for any variant',
      path: ['variants'],
    }
  );

const updateStatusSchema = z.object({
  status: z.enum(Object.values(PRODUCT_STATUS)),
});

const queryProductSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  audience: objectIdSchema.optional(),
  category: objectIdSchema.optional(),
  subcategory: objectIdSchema.optional(),
  status: z.enum(Object.values(PRODUCT_STATUS)).optional(),
  lowStock: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().nonnegative().optional(),
  size: z.string().trim().optional(),
  color: z.string().trim().optional(),
  sortBy: z.enum(['createdAt', 'price', 'name', 'totalStock', 'rating']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

module.exports = {
  createProductSchema,
  updateProductSchema,
  updateStatusSchema,
  queryProductSchema,
};

