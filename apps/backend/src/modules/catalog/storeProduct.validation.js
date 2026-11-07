const { z } = require('zod');

const booleanStringSchema = z
  .union([z.boolean(), z.enum(['true', 'false'])])
  .transform((val) => val === true || val === 'true')
  .optional();

const stringArrayOrCsv = z
  .union([
    z.string(),
    z.number(),
    z.array(z.union([z.string(), z.number()])),
  ])
  .transform((val) => {
    if (Array.isArray(val)) return val.map((s) => String(s).trim()).filter(Boolean);
    return String(val)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  })
  .optional();

const storeProductQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  search: z.string().trim().optional(),
  audience: z.string().trim().optional(),
  category: z.string().trim().optional(),
  subcategory: z.string().trim().optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().nonnegative().optional(),
  size: stringArrayOrCsv,
  color: stringArrayOrCsv,
  fabric: stringArrayOrCsv,
  occasion: stringArrayOrCsv,
  fit: stringArrayOrCsv,
  pattern: stringArrayOrCsv,
  discount: z.coerce.number().min(0).max(100).optional(),
  inStockOnly: booleanStringSchema,
  isFeatured: booleanStringSchema,
  isNewArrival: booleanStringSchema,
  isBestSeller: booleanStringSchema,
  sort: z
    .enum(['newest', 'oldest', 'price_asc', 'price_desc', 'rating', 'popular'])
    .optional()
    .default('newest'),
});

const storeFiltersQuerySchema = z.object({
  audience: z.string().trim().optional(),
  category: z.string().trim().optional(),
  subcategory: z.string().trim().optional(),
  search: z.string().trim().optional(),
});

const storeSearchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Search query q is required'),
  limit: z.coerce.number().int().positive().max(50).optional().default(20),
});

module.exports = {
  storeProductQuerySchema,
  storeFiltersQuerySchema,
  storeSearchQuerySchema,
};
