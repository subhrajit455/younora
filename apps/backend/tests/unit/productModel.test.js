const mongoose = require('mongoose');
const Product = require('../../src/modules/catalog/models/product.model');
const Variant = require('../../src/modules/catalog/models/variant.model');
const { PRODUCT_STATUS } = require('@younora/shared-constants');

describe('Unit: Product & Variant Models', () => {
  describe('Product Model Validation', () => {
    it('fails validation when required fields are missing', () => {
      const product = new Product({});
      const err = product.validateSync();

      expect(err.errors.name).toBeDefined();
      expect(err.errors.slug).toBeDefined();
      expect(err.errors.description).toBeDefined();
      expect(err.errors.audience).toBeDefined();
      expect(err.errors.category).toBeDefined();
      expect(err.errors.subcategory).toBeDefined();
      expect(err.errors.colors).toBeDefined();
    });

    it('fails validation when colors array is empty or has no images', () => {
      const product = new Product({
        name: 'Royal Silk Saree',
        slug: 'royal-silk-saree',
        description: 'Pure Mulberry Silk',
        audience: new mongoose.Types.ObjectId(),
        category: new mongoose.Types.ObjectId(),
        subcategory: new mongoose.Types.ObjectId(),
        colors: [],
      });
      const err = product.validateSync();
      expect(err.errors.colors).toBeDefined();

      const productNoImages = new Product({
        name: 'Royal Silk Saree',
        slug: 'royal-silk-saree',
        description: 'Pure Mulberry Silk',
        audience: new mongoose.Types.ObjectId(),
        category: new mongoose.Types.ObjectId(),
        subcategory: new mongoose.Types.ObjectId(),
        colors: [
          {
            name: 'Gold',
            hex: '#FFD700',
            images: [],
          },
        ],
      });
      const errNoImages = productNoImages.validateSync();
      expect(errNoImages.errors['colors.0.images']).toBeDefined();
    });

    it('passes validation with valid product schema', () => {
      const product = new Product({
        name: 'Royal Silk Saree',
        slug: 'royal-silk-saree',
        description: 'Pure Mulberry Silk',
        audience: new mongoose.Types.ObjectId(),
        category: new mongoose.Types.ObjectId(),
        subcategory: new mongoose.Types.ObjectId(),
        colors: [
          {
            name: 'Gold',
            hex: '#FFD700',
            images: [
              {
                url: 'https://res.cloudinary.com/demo/image/upload/v1/saree_gold.jpg',
                publicId: 'younora/products/saree_gold',
              },
            ],
          },
        ],
        status: PRODUCT_STATUS.DRAFT,
      });

      const err = product.validateSync();
      expect(err).toBeUndefined();
      expect(product.brand).toBe('Younora');
      expect(product.isDeleted).toBe(false);
    });
  });

  describe('Variant Model Validation', () => {
    it('fails validation when sellingPrice exceeds mrp', () => {
      const variant = new Variant({
        product: new mongoose.Types.ObjectId(),
        sku: 'YNR-TEST-001',
        color: { name: 'Black', hex: '#000000' },
        size: 'L',
        mrp: 200000, // ₹2000
        sellingPrice: 250000, // ₹2500 (exceeds mrp)
        costPrice: 100000,
      });

      const err = variant.validateSync();
      expect(err.errors.sellingPrice).toBeDefined();
      expect(err.errors.sellingPrice.message).toContain('cannot exceed MRP');
    });

    it('passes validation when sellingPrice is equal to or less than mrp', () => {
      const variant = new Variant({
        product: new mongoose.Types.ObjectId(),
        sku: 'YNR-TEST-001',
        color: { name: 'Black', hex: '#000000' },
        size: 'L',
        mrp: 200000,
        sellingPrice: 180000,
        costPrice: 100000,
      });

      const err = variant.validateSync();
      expect(err).toBeUndefined();
    });

    it('fails validation when negative money or stock values are passed', () => {
      const variant = new Variant({
        product: new mongoose.Types.ObjectId(),
        sku: 'YNR-TEST-002',
        color: { name: 'Navy' },
        size: 'M',
        mrp: -100,
        sellingPrice: -200,
        costPrice: -50,
        stock: -10,
      });

      const err = variant.validateSync();
      expect(err.errors.mrp).toBeDefined();
      expect(err.errors.sellingPrice).toBeDefined();
      expect(err.errors.costPrice).toBeDefined();
      expect(err.errors.stock).toBeDefined();
    });
  });
});

