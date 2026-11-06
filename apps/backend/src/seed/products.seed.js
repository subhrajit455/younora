/**
 * Products & Variants Idempotent Seed Script
 * Seeds 10 realistic luxury Younora products (Men, Women, Kids)
 * with multi-color, multi-size matrices, realistic pricing, and images.
 */

const Audience = require('../modules/catalog/models/audience.model');
const Category = require('../modules/catalog/models/category.model');
const Subcategory = require('../modules/catalog/models/subcategory.model');
const Product = require('../modules/catalog/models/product.model');
const productService = require('../modules/catalog/product.service');
const { PRODUCT_STATUS } = require('@younora/shared-constants');
const { generateSlug } = require('../core/utils/slug');
const logger = require('../core/logger');

// Categories definition
const SEED_CATEGORIES = [
  { audienceName: 'Men', name: 'Ethnic & Festive Wear', slug: 'men-ethnic-wear', sortOrder: 1 },
  { audienceName: 'Men', name: 'Formal & Evening Wear', slug: 'men-formal-wear', sortOrder: 2 },
  { audienceName: 'Women', name: 'Sarees & Drapes', slug: 'women-sarees', sortOrder: 1 },
  { audienceName: 'Women', name: 'Lehengas & Sets', slug: 'women-lehengas', sortOrder: 2 },
  { audienceName: 'Women', name: 'Anarkalis & Suits', slug: 'women-anarkalis', sortOrder: 3 },
  { audienceName: 'Kids', name: 'Boys Heritage', slug: 'kids-boys-heritage', sortOrder: 1 },
  { audienceName: 'Kids', name: 'Girls Princess', slug: 'kids-girls-princess', sortOrder: 2 },
];

// Subcategories definition
const SEED_SUBCATEGORIES = [
  { categorySlug: 'men-ethnic-wear', name: 'Sherwanis & Kurtas', slug: 'sherwanis-kurtas', sortOrder: 1 },
  { categorySlug: 'men-formal-wear', name: 'Bandhgalas & Tuxedos', slug: 'bandhgalas-tuxedos', sortOrder: 1 },
  { categorySlug: 'women-sarees', name: 'Mulberry & Banarasi Silk', slug: 'mulberry-banarasi-silk', sortOrder: 1 },
  { categorySlug: 'women-lehengas', name: 'Bridal & Festive Lehengas', slug: 'bridal-festive-lehengas', sortOrder: 1 },
  { categorySlug: 'women-anarkalis', name: 'Embroidered Anarkalis', slug: 'embroidered-anarkalis', sortOrder: 1 },
  { categorySlug: 'kids-boys-heritage', name: 'Kurta Sets & Jackets', slug: 'boys-kurta-sets', sortOrder: 1 },
  { categorySlug: 'kids-girls-princess', name: 'Gowns & Lehengas', slug: 'girls-gowns-lehengas', sortOrder: 1 },
];

// Helper to build 10 luxury demo products
function getDemoProductsData(audienceMap, categoryMap, subcategoryMap) {
  return [
    // 1. Men Sherwani
    {
      name: 'Royal Raw Silk Embroidered Sherwani',
      slug: 'royal-raw-silk-embroidered-sherwani',
      audience: audienceMap['men'],
      category: categoryMap['men-ethnic-wear'],
      subcategory: subcategoryMap['sherwanis-kurtas'],
      description: 'Handcrafted raw silk sherwani featuring intricate gold zardozi embroidery on the collar and cuffs. Ideal for royal wedding celebrations.',
      highlights: ['Pure Raw Silk', 'Hand Embroidered Zardozi', 'Matching Stole included', 'Dry Clean Only'],
      fabric: 'Raw Silk',
      fit: 'Tailored Fit',
      pattern: 'Hand Embroidered',
      occasion: 'Wedding & Bridal',
      careInstructions: 'Dry clean only. Store in muslin bag.',
      hsnCode: '6203',
      gstPercent: 12,
      status: PRODUCT_STATUS.ACTIVE,
      isFeatured: true,
      isNewArrival: true,
      resellingEnabled: true,
      colors: [
        {
          name: 'Royal Ivory',
          hex: '#FFFFF0',
          images: [
            {
              url: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=800&q=80',
              publicId: 'younora/demo/sherwani-ivory-1',
              alt: 'Royal Ivory Sherwani Front',
              sortOrder: 0,
            },
          ],
        },
        {
          name: 'Midnight Navy',
          hex: '#000080',
          images: [
            {
              url: 'https://images.unsplash.com/photo-1617137984095-74e4e5e3613f?auto=format&fit=crop&w=800&q=80',
              publicId: 'younora/demo/sherwani-navy-1',
              alt: 'Midnight Navy Sherwani Front',
              sortOrder: 0,
            },
          ],
        },
      ],
      variants: [
        { color: { name: 'Royal Ivory', hex: '#FFFFF0' }, size: '38', mrp: 4999900, sellingPrice: 3999900, costPrice: 1800000, stock: 10 },
        { color: { name: 'Royal Ivory', hex: '#FFFFF0' }, size: '40', mrp: 4999900, sellingPrice: 3999900, costPrice: 1800000, stock: 15 },
        { color: { name: 'Royal Ivory', hex: '#FFFFF0' }, size: '42', mrp: 4999900, sellingPrice: 3999900, costPrice: 1800000, stock: 12 },
        { color: { name: 'Midnight Navy', hex: '#000080' }, size: '38', mrp: 4999900, sellingPrice: 3999900, costPrice: 1800000, stock: 8 },
        { color: { name: 'Midnight Navy', hex: '#000080' }, size: '40', mrp: 4999900, sellingPrice: 3999900, costPrice: 1800000, stock: 14 },
        { color: { name: 'Midnight Navy', hex: '#000080' }, size: '42', mrp: 4999900, sellingPrice: 3999900, costPrice: 1800000, stock: 10 },
      ],
    },

    // 2. Men Velvet Tuxedo
    {
      name: 'Velvet Zardozi Bandhgala Tuxedo',
      slug: 'velvet-zardozi-bandhgala-tuxedo',
      audience: audienceMap['men'],
      category: categoryMap['men-formal-wear'],
      subcategory: subcategoryMap['bandhgalas-tuxedos'],
      description: 'Lustrous micro-velvet tailored bandhgala with metallic handcrafted crest buttons and satin piping.',
      highlights: ['Italian Micro-Velvet', 'Tailored Royal Silhouette', 'Satin Trim Accents'],
      fabric: 'Velvet Silk',
      fit: 'Slim Fit',
      pattern: 'Solid',
      occasion: 'Evening Gala',
      careInstructions: 'Specialist dry clean only.',
      hsnCode: '6203',
      gstPercent: 12,
      status: PRODUCT_STATUS.ACTIVE,
      isFeatured: true,
      resellingEnabled: true,
      colors: [
        {
          name: 'Midnight Black',
          hex: '#0B0B0B',
          images: [
            {
              url: 'https://images.unsplash.com/photo-1507679799987-c73779587ccf?auto=format&fit=crop&w=800&q=80',
              publicId: 'younora/demo/tuxedo-black-1',
              alt: 'Midnight Black Bandhgala',
              sortOrder: 0,
            },
          ],
        },
        {
          name: 'Wine Burgundy',
          hex: '#581845',
          images: [
            {
              url: 'https://images.unsplash.com/photo-1593030761757-71fae45fa0e7?auto=format&fit=crop&w=800&q=80',
              publicId: 'younora/demo/tuxedo-wine-1',
              alt: 'Wine Burgundy Bandhgala',
              sortOrder: 0,
            },
          ],
        },
      ],
      variants: [
        { color: { name: 'Midnight Black', hex: '#0B0B0B' }, size: '38', mrp: 3499900, sellingPrice: 2999900, costPrice: 1250000, stock: 12 },
        { color: { name: 'Midnight Black', hex: '#0B0B0B' }, size: '40', mrp: 3499900, sellingPrice: 2999900, costPrice: 1250000, stock: 16 },
        { color: { name: 'Wine Burgundy', hex: '#581845' }, size: '38', mrp: 3499900, sellingPrice: 2999900, costPrice: 1250000, stock: 9 },
        { color: { name: 'Wine Burgundy', hex: '#581845' }, size: '40', mrp: 3499900, sellingPrice: 2999900, costPrice: 1250000, stock: 11 },
      ],
    },

    // 3. Men Tailored Evening Blazer
    {
      name: 'Tailored Italian Wool Evening Blazer',
      slug: 'tailored-italian-wool-evening-blazer',
      audience: audienceMap['men'],
      category: categoryMap['men-formal-wear'],
      subcategory: subcategoryMap['bandhgalas-tuxedos'],
      description: 'Sophisticated single-breasted evening blazer crafted from fine Italian super-130s wool.',
      highlights: ['Italian Super-130s Wool', 'Horn Buttons', 'Structured Shoulder'],
      fabric: 'Superfine Wool',
      fit: 'Tailored Fit',
      pattern: 'Solid',
      occasion: 'Formal Luxury',
      careInstructions: 'Dry clean only.',
      hsnCode: '6203',
      gstPercent: 12,
      status: PRODUCT_STATUS.ACTIVE,
      isFeatured: false,
      resellingEnabled: true,
      colors: [
        {
          name: 'Charcoal Grey',
          hex: '#36454F',
          images: [
            {
              url: 'https://images.unsplash.com/photo-1598808503746-f34c53b9323e?auto=format&fit=crop&w=800&q=80',
              publicId: 'younora/demo/blazer-charcoal-1',
              alt: 'Charcoal Grey Blazer',
              sortOrder: 0,
            },
          ],
        },
      ],
      variants: [
        { color: { name: 'Charcoal Grey', hex: '#36454F' }, size: '40', mrp: 2799900, sellingPrice: 2299900, costPrice: 950000, stock: 8 },
        { color: { name: 'Charcoal Grey', hex: '#36454F' }, size: '42', mrp: 2799900, sellingPrice: 2299900, costPrice: 950000, stock: 14 },
        { color: { name: 'Charcoal Grey', hex: '#36454F' }, size: '44', mrp: 2799900, sellingPrice: 2299900, costPrice: 950000, stock: 6 },
      ],
    },

    // 4. Women Banarasi Saree
    {
      name: 'Handcrafted Banarasi Katan Silk Saree',
      slug: 'handcrafted-banarasi-katan-silk-saree',
      audience: audienceMap['women'],
      category: categoryMap['women-sarees'],
      subcategory: subcategoryMap['mulberry-banarasi-silk'],
      description: 'Opulent Banarasi Katan silk saree handwoven with gold and silver zari brocade motifs and an ornate pallu.',
      highlights: ['Pure Katan Silk', 'Handloom Woven Zari', 'Silk Mark Certified', 'Includes Unstitched Blouse Piece'],
      fabric: 'Pure Mulberry Silk',
      pattern: 'Zari Brocade',
      occasion: 'Wedding & Bridal',
      careInstructions: 'Dry clean only. Roll in cotton cloth.',
      hsnCode: '5007',
      gstPercent: 5,
      status: PRODUCT_STATUS.ACTIVE,
      isFeatured: true,
      isBestSeller: true,
      resellingEnabled: true,
      colors: [
        {
          name: 'Crimson Red',
          hex: '#990000',
          images: [
            {
              url: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=800&q=80',
              publicId: 'younora/demo/saree-crimson-1',
              alt: 'Crimson Red Banarasi Saree',
              sortOrder: 0,
            },
          ],
        },
        {
          name: 'Emerald Green',
          hex: '#046307',
          images: [
            {
              url: 'https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?auto=format&fit=crop&w=800&q=80',
              publicId: 'younora/demo/saree-emerald-1',
              alt: 'Emerald Green Banarasi Saree',
              sortOrder: 0,
            },
          ],
        },
      ],
      variants: [
        { color: { name: 'Crimson Red', hex: '#990000' }, size: 'FREE SIZE', mrp: 2499900, sellingPrice: 1999900, costPrice: 850000, stock: 25 },
        { color: { name: 'Emerald Green', hex: '#046307' }, size: 'FREE SIZE', mrp: 2499900, sellingPrice: 1999900, costPrice: 850000, stock: 20 },
      ],
    },

    // 5. Women Heritage Zari Saree
    {
      name: 'Heritage Zari Pure Mulberry Silk Saree',
      slug: 'heritage-zari-pure-mulberry-silk-saree',
      audience: audienceMap['women'],
      category: categoryMap['women-sarees'],
      subcategory: subcategoryMap['mulberry-banarasi-silk'],
      description: 'Lustrous Mulberry silk saree with real silver zari threadwork depicting peacocks and traditional vines.',
      highlights: ['Authentic Mulberry Silk', 'Pure Silver Zari Finish', 'Contrast Rich Pallu'],
      fabric: 'Pure Mulberry Silk',
      pattern: 'Hand Embroidered',
      occasion: 'Festive & Celebration',
      careInstructions: 'Dry clean only.',
      hsnCode: '5007',
      gstPercent: 5,
      status: PRODUCT_STATUS.ACTIVE,
      isFeatured: false,
      resellingEnabled: true,
      colors: [
        {
          name: 'Royal Peacock',
          hex: '#005F73',
          images: [
            {
              url: 'https://images.unsplash.com/photo-1610030469668-93530c17b58f?auto=format&fit=crop&w=800&q=80',
              publicId: 'younora/demo/saree-peacock-1',
              alt: 'Royal Peacock Saree',
              sortOrder: 0,
            },
          ],
        },
        {
          name: 'Mustard Gold',
          hex: '#DDA15E',
          images: [
            {
              url: 'https://images.unsplash.com/photo-1609357605129-26f69add5d6e?auto=format&fit=crop&w=800&q=80',
              publicId: 'younora/demo/saree-gold-1',
              alt: 'Mustard Gold Saree',
              sortOrder: 0,
            },
          ],
        },
      ],
      variants: [
        { color: { name: 'Royal Peacock', hex: '#005F73' }, size: 'FREE SIZE', mrp: 2999900, sellingPrice: 2499900, costPrice: 1100000, stock: 15 },
        { color: { name: 'Mustard Gold', hex: '#DDA15E' }, size: 'FREE SIZE', mrp: 2999900, sellingPrice: 2499900, costPrice: 1100000, stock: 18 },
      ],
    },

    // 6. Women Bridal Lehenga
    {
      name: 'Gilded Hand-Embroidered Bridal Lehenga',
      slug: 'gilded-hand-embroidered-bridal-lehenga',
      audience: audienceMap['women'],
      category: categoryMap['women-lehengas'],
      subcategory: subcategoryMap['bridal-festive-lehengas'],
      description: 'Masterpiece 16-kali raw silk lehenga embellished with dabka, sequins, and pearls. Includes dual organza dupattas.',
      highlights: ['16-Kali Flair', 'Intricate Dabka & Pearl Work', 'Dual Embroidered Dupattas'],
      fabric: 'Raw Silk',
      pattern: 'Hand Embroidered',
      occasion: 'Wedding & Bridal',
      careInstructions: 'Specialist bridal dry clean only.',
      hsnCode: '6204',
      gstPercent: 12,
      status: PRODUCT_STATUS.ACTIVE,
      isFeatured: true,
      resellingEnabled: true,
      colors: [
        {
          name: 'Scarlet Ruby',
          hex: '#9B111E',
          images: [
            {
              url: 'https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=800&q=80',
              publicId: 'younora/demo/lehenga-ruby-1',
              alt: 'Scarlet Ruby Bridal Lehenga',
              sortOrder: 0,
            },
          ],
        },
        {
          name: 'Vintage Rose',
          hex: '#B76E79',
          images: [
            {
              url: 'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&w=800&q=80',
              publicId: 'younora/demo/lehenga-rose-1',
              alt: 'Vintage Rose Bridal Lehenga',
              sortOrder: 0,
            },
          ],
        },
      ],
      variants: [
        { color: { name: 'Scarlet Ruby', hex: '#9B111E' }, size: 'S', mrp: 8999900, sellingPrice: 7499900, costPrice: 3200000, stock: 5 },
        { color: { name: 'Scarlet Ruby', hex: '#9B111E' }, size: 'M', mrp: 8999900, sellingPrice: 7499900, costPrice: 3200000, stock: 8 },
        { color: { name: 'Scarlet Ruby', hex: '#9B111E' }, size: 'L', mrp: 8999900, sellingPrice: 7499900, costPrice: 3200000, stock: 6 },
        { color: { name: 'Vintage Rose', hex: '#B76E79' }, size: 'S', mrp: 8999900, sellingPrice: 7499900, costPrice: 3200000, stock: 4 },
        { color: { name: 'Vintage Rose', hex: '#B76E79' }, size: 'M', mrp: 8999900, sellingPrice: 7499900, costPrice: 3200000, stock: 7 },
      ],
    },

    // 7. Women Floral Organza Lehenga
    {
      name: 'Florentine Floral Silk Organza Lehenga',
      slug: 'florentine-floral-silk-organza-lehenga',
      audience: audienceMap['women'],
      category: categoryMap['women-lehengas'],
      subcategory: subcategoryMap['bridal-festive-lehengas'],
      description: 'Ethereal silk organza printed lehenga with hand-embroidered mirrorwork blouse and scalloped dupatta border.',
      highlights: ['Pure Silk Organza', 'Foil & Mirror Hand Embroidery', 'Lightweight Festive Silhouette'],
      fabric: 'Pure Mulberry Silk',
      pattern: 'Hand Embroidered',
      occasion: 'Festive & Celebration',
      careInstructions: 'Dry clean only.',
      hsnCode: '6204',
      gstPercent: 12,
      status: PRODUCT_STATUS.ACTIVE,
      isFeatured: false,
      resellingEnabled: true,
      colors: [
        {
          name: 'Sage Mint',
          hex: '#8A9A5B',
          images: [
            {
              url: 'https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=800&q=80',
              publicId: 'younora/demo/lehenga-sage-1',
              alt: 'Sage Mint Floral Lehenga',
              sortOrder: 0,
            },
          ],
        },
      ],
      variants: [
        { color: { name: 'Sage Mint', hex: '#8A9A5B' }, size: 'S', mrp: 5999900, sellingPrice: 4999900, costPrice: 2100000, stock: 7 },
        { color: { name: 'Sage Mint', hex: '#8A9A5B' }, size: 'M', mrp: 5999900, sellingPrice: 4999900, costPrice: 2100000, stock: 10 },
        { color: { name: 'Sage Mint', hex: '#8A9A5B' }, size: 'L', mrp: 5999900, sellingPrice: 4999900, costPrice: 2100000, stock: 5 },
      ],
    },

    // 8. Women Embroidered Anarkali
    {
      name: 'Imperial Velvet Embroidered Anarkali',
      slug: 'imperial-velvet-embroidered-anarkali',
      audience: audienceMap['women'],
      category: categoryMap['women-anarkalis'],
      subcategory: subcategoryMap['embroidered-anarkalis'],
      description: 'Rich royal blue velvet floor-length anarkali with intricate Kashmiri tilla embroidery along the yoke and hem.',
      highlights: ['Deep Micro-Velvet', 'Kashmiri Tilla Work', 'Churidar & Net Dupatta included'],
      fabric: 'Velvet Silk',
      fit: 'Regular Fit',
      pattern: 'Hand Embroidered',
      occasion: 'Evening Gala',
      careInstructions: 'Dry clean only.',
      hsnCode: '6204',
      gstPercent: 12,
      status: PRODUCT_STATUS.ACTIVE,
      isFeatured: true,
      resellingEnabled: true,
      colors: [
        {
          name: 'Royal Sapphire',
          hex: '#0F52BA',
          images: [
            {
              url: 'https://images.unsplash.com/photo-1566737236500-c8ac43014a67?auto=format&fit=crop&w=800&q=80',
              publicId: 'younora/demo/anarkali-sapphire-1',
              alt: 'Royal Sapphire Anarkali',
              sortOrder: 0,
            },
          ],
        },
      ],
      variants: [
        { color: { name: 'Royal Sapphire', hex: '#0F52BA' }, size: 'S', mrp: 3299900, sellingPrice: 2799900, costPrice: 1200000, stock: 8 },
        { color: { name: 'Royal Sapphire', hex: '#0F52BA' }, size: 'M', mrp: 3299900, sellingPrice: 2799900, costPrice: 1200000, stock: 12 },
        { color: { name: 'Royal Sapphire', hex: '#0F52BA' }, size: 'L', mrp: 3299900, sellingPrice: 2799900, costPrice: 1200000, stock: 9 },
        { color: { name: 'Royal Sapphire', hex: '#0F52BA' }, size: 'XL', mrp: 3299900, sellingPrice: 2799900, costPrice: 1200000, stock: 6 },
      ],
    },

    // 9. Kids Boys Brocade Kurta Set
    {
      name: 'Little Maharaja Brocade Kurta Set',
      slug: 'little-maharaja-brocade-kurta-set',
      audience: audienceMap['kids'],
      category: categoryMap['kids-boys-heritage'],
      subcategory: subcategoryMap['boys-kurta-sets'],
      description: 'Heritage silk-blend woven brocade kurta with cotton silk pants and an ornate sleeveless jacket.',
      highlights: ['Comfortable Cotton Lining', 'Royal Woven Brocade', 'Easy Snap Closures'],
      fabric: 'Egyptian Cotton',
      fit: 'Regular Fit',
      pattern: 'Jacquard Weave',
      occasion: 'Festive & Celebration',
      careInstructions: 'Dry clean recommended.',
      hsnCode: '6203',
      gstPercent: 12,
      status: PRODUCT_STATUS.ACTIVE,
      isFeatured: false,
      resellingEnabled: true,
      colors: [
        {
          name: 'Royal Ivory',
          hex: '#FFFFF0',
          images: [
            {
              url: 'https://images.unsplash.com/photo-1503944570634-1117dd039d16?auto=format&fit=crop&w=800&q=80',
              publicId: 'younora/demo/kids-kurta-ivory-1',
              alt: 'Little Maharaja Ivory Kurta Set',
              sortOrder: 0,
            },
          ],
        },
      ],
      variants: [
        { color: { name: 'Royal Ivory', hex: '#FFFFF0' }, size: '4Y', mrp: 1299900, sellingPrice: 999900, costPrice: 380000, stock: 10 },
        { color: { name: 'Royal Ivory', hex: '#FFFFF0' }, size: '6Y', mrp: 1299900, sellingPrice: 999900, costPrice: 380000, stock: 12 },
        { color: { name: 'Royal Ivory', hex: '#FFFFF0' }, size: '8Y', mrp: 1299900, sellingPrice: 999900, costPrice: 380000, stock: 8 },
      ],
    },

    // 10. Kids Girls Tissue Gown
    {
      name: 'Little Maharani Tissue Gown',
      slug: 'little-maharani-tissue-gown',
      audience: audienceMap['kids'],
      category: categoryMap['kids-girls-princess'],
      subcategory: subcategoryMap['girls-gowns-lehengas'],
      description: 'Lustrous pastel tissue gown with delicate flower applique on the bodice and a tiered tulle skirt with soft cotton inner lining.',
      highlights: ['Soft Breathable Lining', 'Gentle on Sensitive Skin', 'Hand Embroidered Floral Applique'],
      fabric: 'Pure Mulberry Silk',
      pattern: 'Hand Embroidered',
      occasion: 'Festive & Celebration',
      careInstructions: 'Dry clean only.',
      hsnCode: '6204',
      gstPercent: 12,
      status: PRODUCT_STATUS.ACTIVE,
      isFeatured: true,
      resellingEnabled: true,
      colors: [
        {
          name: 'Powder Rose',
          hex: '#F4C2C2',
          images: [
            {
              url: 'https://images.unsplash.com/photo-1518831959646-742c3a14ebf7?auto=format&fit=crop&w=800&q=80',
              publicId: 'younora/demo/kids-gown-rose-1',
              alt: 'Little Maharani Rose Gown',
              sortOrder: 0,
            },
          ],
        },
      ],
      variants: [
        { color: { name: 'Powder Rose', hex: '#F4C2C2' }, size: '4Y', mrp: 1499900, sellingPrice: 1199900, costPrice: 460000, stock: 8 },
        { color: { name: 'Powder Rose', hex: '#F4C2C2' }, size: '6Y', mrp: 1499900, sellingPrice: 1199900, costPrice: 460000, stock: 11 },
        { color: { name: 'Powder Rose', hex: '#F4C2C2' }, size: '8Y', mrp: 1499900, sellingPrice: 1199900, costPrice: 460000, stock: 9 },
      ],
    },
  ];
}

async function seedProducts() {
  const result = { seededProducts: 0, skippedProducts: 0, totalVariants: 0 };

  // 1. Ensure audiences exist
  const audiences = await Audience.find({ isDeleted: false });
  const audienceMap = {};
  for (const aud of audiences) {
    audienceMap[aud.slug.toLowerCase()] = aud._id;
  }

  // Fallback check if basic audiences don't exist
  if (!audienceMap['men'] || !audienceMap['women'] || !audienceMap['kids']) {
    for (const name of ['Men', 'Women', 'Kids']) {
      const slug = generateSlug(name);
      let aud = await Audience.findOne({ slug });
      if (!aud) {
        aud = await Audience.create({ name, slug, isActive: true });
      }
      audienceMap[slug] = aud._id;
    }
  }

  // 2. Ensure categories exist
  const categoryMap = {};
  for (const c of SEED_CATEGORIES) {
    const audienceId = audienceMap[c.audienceName.toLowerCase()];
    let cat = await Category.findOne({ audience: audienceId, slug: c.slug, isDeleted: false });
    if (!cat) {
      cat = await Category.create({
        audience: audienceId,
        name: c.name,
        slug: c.slug,
        sortOrder: c.sortOrder,
        isActive: true,
      });
    }
    categoryMap[c.slug] = cat._id;
  }

  // 3. Ensure subcategories exist
  const subcategoryMap = {};
  for (const s of SEED_SUBCATEGORIES) {
    const categoryId = categoryMap[s.categorySlug];
    let sub = await Subcategory.findOne({ category: categoryId, slug: s.slug, isDeleted: false });
    if (!sub) {
      sub = await Subcategory.create({
        category: categoryId,
        name: s.name,
        slug: s.slug,
        sortOrder: s.sortOrder,
        isActive: true,
      });
    }
    subcategoryMap[s.slug] = sub._id;
  }

  // 4. Seed the 10 demo products
  const productsToSeed = getDemoProductsData(audienceMap, categoryMap, subcategoryMap);

  for (const productData of productsToSeed) {
    const existing = await Product.findOne({ slug: productData.slug, isDeleted: false });
    if (existing) {
      result.skippedProducts += 1;
      continue;
    }

    const created = await productService.createProduct(productData);
    result.seededProducts += 1;
    result.totalVariants += created.variants ? created.variants.length : 0;
  }

  logger.info(
    {
      seededProducts: result.seededProducts,
      skippedProducts: result.skippedProducts,
      totalVariants: result.totalVariants,
    },
    'Demo products seed process finished'
  );

  return result;
}

if (require.main === module) {
  const mongoose = require('mongoose');
  const { env } = require('../config/env');

  mongoose
    .connect(env.MONGODB_URI)
    .then(async () => {
      await seedProducts();
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch((err) => {
      logger.error({ err }, 'Failed to seed demo products');
      process.exit(1);
    });
}

module.exports = {
  seedProducts,
  SEED_CATEGORIES,
  SEED_SUBCATEGORIES,
};

