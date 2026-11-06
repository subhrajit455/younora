/**
 * Taxonomy & Attribute Idempotent Seed Script
 * Initializes standard audiences (Men, Women, Kids) and core attributes.
 */

const Audience = require('../modules/catalog/models/audience.model');
const Attribute = require('../modules/catalog/models/attribute.model');
const { ATTRIBUTE_TYPE } = require('@younora/shared-constants');
const { generateSlug } = require('../core/utils/slug');
const logger = require('../core/logger');

const INITIAL_AUDIENCES = [
  { name: 'Men', sortOrder: 1 },
  { name: 'Women', sortOrder: 2 },
  { name: 'Kids', sortOrder: 3 },
];

const INITIAL_ATTRIBUTES = [
  // Colors
  { type: ATTRIBUTE_TYPE.COLOR, name: 'Midnight Black', value: '#0B0B0B', sortOrder: 1 },
  { type: ATTRIBUTE_TYPE.COLOR, name: 'Royal Ivory', value: '#FFFFF0', sortOrder: 2 },
  { type: ATTRIBUTE_TYPE.COLOR, name: 'Emerald Green', value: '#046307', sortOrder: 3 },
  { type: ATTRIBUTE_TYPE.COLOR, name: 'Crimson Red', value: '#990000', sortOrder: 4 },
  { type: ATTRIBUTE_TYPE.COLOR, name: 'Navy Blue', value: '#000080', sortOrder: 5 },

  // Fabrics
  { type: ATTRIBUTE_TYPE.FABRIC, name: 'Pure Mulberry Silk', sortOrder: 1 },
  { type: ATTRIBUTE_TYPE.FABRIC, name: 'Egyptian Cotton', sortOrder: 2 },
  { type: ATTRIBUTE_TYPE.FABRIC, name: 'Pure Cashmere', sortOrder: 3 },
  { type: ATTRIBUTE_TYPE.FABRIC, name: 'Organic Linen', sortOrder: 4 },
  { type: ATTRIBUTE_TYPE.FABRIC, name: 'Velvet Silk', sortOrder: 5 },

  // Fits
  { type: ATTRIBUTE_TYPE.FIT, name: 'Slim Fit', sortOrder: 1 },
  { type: ATTRIBUTE_TYPE.FIT, name: 'Regular Fit', sortOrder: 2 },
  { type: ATTRIBUTE_TYPE.FIT, name: 'Tailored Fit', sortOrder: 3 },
  { type: ATTRIBUTE_TYPE.FIT, name: 'Relaxed Fit', sortOrder: 4 },

  // Patterns
  { type: ATTRIBUTE_TYPE.PATTERN, name: 'Solid', sortOrder: 1 },
  { type: ATTRIBUTE_TYPE.PATTERN, name: 'Hand Embroidered', sortOrder: 2 },
  { type: ATTRIBUTE_TYPE.PATTERN, name: 'Jacquard Weave', sortOrder: 3 },
  { type: ATTRIBUTE_TYPE.PATTERN, name: 'Zari Brocade', sortOrder: 4 },

  // Occasions
  { type: ATTRIBUTE_TYPE.OCCASION, name: 'Wedding & Bridal', sortOrder: 1 },
  { type: ATTRIBUTE_TYPE.OCCASION, name: 'Festive & Celebration', sortOrder: 2 },
  { type: ATTRIBUTE_TYPE.OCCASION, name: 'Evening Gala', sortOrder: 3 },
  { type: ATTRIBUTE_TYPE.OCCASION, name: 'Formal Luxury', sortOrder: 4 },
];

async function seedTaxonomy() {
  const seeded = { audiences: 0, attributes: 0 };

  // 1. Seed Audiences
  for (const aud of INITIAL_AUDIENCES) {
    const slug = generateSlug(aud.name);
    const existing = await Audience.findOne({ slug });
    if (!existing) {
      await Audience.create({
        name: aud.name,
        slug,
        sortOrder: aud.sortOrder,
        isActive: true,
      });
      seeded.audiences += 1;
    }
  }

  // 2. Seed Attributes
  for (const attr of INITIAL_ATTRIBUTES) {
    const existing = await Attribute.findOne({
      type: attr.type,
      name: attr.name,
    });
    if (!existing) {
      await Attribute.create(attr);
      seeded.attributes += 1;
    }
  }

  logger.info(
    { seeded },
    `Taxonomy seed completed: ${seeded.audiences} audiences, ${seeded.attributes} attributes added.`
  );
  return seeded;
}

if (require.main === module) {
  const mongoose = require('mongoose');
  const { env } = require('../config/env');

  mongoose
    .connect(env.MONGODB_URI)
    .then(async () => {
      await seedTaxonomy();
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch((err) => {
      logger.fatal({ err }, 'Failed to seed taxonomy');
      process.exit(1);
    });
}

module.exports = {
  seedTaxonomy,
  INITIAL_AUDIENCES,
  INITIAL_ATTRIBUTES,
};
