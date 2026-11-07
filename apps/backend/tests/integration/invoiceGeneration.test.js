const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = require('../../src/app');
const { env } = require('../../src/config/env');
const { startTestDb, stopTestDb, clearTestDb } = require('../helpers/testDb');
const AdminUser = require('../../src/modules/users/models/adminUser.model');
const Customer = require('../../src/modules/users/models/customer.model');
const Audience = require('../../src/modules/catalog/models/audience.model');
const Category = require('../../src/modules/catalog/models/category.model');
const Subcategory = require('../../src/modules/catalog/models/subcategory.model');
const Product = require('../../src/modules/catalog/models/product.model');
const Variant = require('../../src/modules/catalog/models/variant.model');
const Batch = require('../../src/modules/inventory/models/batch.model');
const ResellerShare = require('../../src/modules/pricing/models/resellerShare.model');
const Settings = require('../../src/modules/settings/models/settings.model');
const checkoutService = require('../../src/modules/checkout/checkout.service');
const {
  ROLES,
  TOKEN_AUDIENCE,
  PRODUCT_STATUS,
  BATCH_STATUS,
  PAYMENT_METHOD,
} = require('@younora/shared-constants');

function binaryParser(res, callback) {
  res.setEncoding('binary');
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    callback(null, Buffer.from(data, 'binary'));
  });
}

function extractPdfText(pdfBuffer) {
  const raw = pdfBuffer.toString('utf8');
  const texts = [];
  // 1. (text) Tj
  for (const m of raw.matchAll(/\((.*?)\)\s*Tj/g)) {
    texts.push(m[1]);
  }
  // 2. [<hex>] TJ
  for (const m of raw.matchAll(/\[(.*?)\]\s*TJ/g)) {
    const hexParts = [...m[1].matchAll(/<([0-9a-fA-F]+)>/g)].map((h) =>
      Buffer.from(h[1], 'hex').toString('utf8')
    );
    if (hexParts.length > 0) {
      texts.push(hexParts.join(''));
    }
    const strParts = [...m[1].matchAll(/\((.*?)\)/g)].map((s) => s[1]);
    if (strParts.length > 0) {
      texts.push(strParts.join(''));
    }
  }
  return texts.join(' ');
}

jest.setTimeout(60000);

describe('Slice 5: PDF Invoice Generation & Reseller Privacy Leak Tests', () => {
  let superAdminToken;
  let customerToken;
  let reseller;
  let product;
  let variant;
  let resellerOrder;

  beforeAll(async () => {
    await startTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
    await Settings.getSettings();

    const passwordHash = await bcrypt.hash('Admin@123', 10);

    // 1. Super Admin
    const superAdmin = await AdminUser.create({
      name: 'Super Admin',
      email: 'admin@younora.com',
      passwordHash,
      role: ROLES.SUPER_ADMIN,
      permissions: [],
      isActive: true,
    });
    superAdminToken = jwt.sign(
      { sub: superAdmin._id.toString(), role: superAdmin.role },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '1h', audience: TOKEN_AUDIENCE.ADMIN }
    );

    // 2. Reseller & Buyer
    reseller = await Customer.create({
      name: 'Pooja Reseller',
      email: 'pooja.reseller@example.com',
      passwordHash,
      phone: '9876543210',
      resellerStatus: 'APPROVED',
      isVerified: true,
    });

    const buyer = await Customer.create({
      name: 'Meera Kapoor',
      email: 'meera.buyer@example.com',
      passwordHash,
      phone: '9876543299',
      isVerified: true,
    });
    customerToken = jwt.sign(
      { sub: buyer._id.toString(), role: 'CUSTOMER' },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '1h', audience: TOKEN_AUDIENCE.CUSTOMER }
    );

    // 3. Catalog & Batches
    const audience = await Audience.create({ name: 'Women', slug: 'women' });
    const category = await Category.create({ name: 'Lehengas', slug: 'lehengas', audience: audience._id });
    const subcategory = await Subcategory.create({ name: 'Bridal', slug: 'bridal', category: category._id });

    product = await Product.create({
      name: 'Rajputana Heritage Gold Lehenga',
      slug: 'rajputana-heritage-gold-lehenga',
      description: 'Hand-embroidered pure silk lehenga.',
      audience: audience._id,
      category: category._id,
      subcategory: subcategory._id,
      status: PRODUCT_STATUS.ACTIVE,
      resellingEnabled: true,
      colors: [{ name: 'Antique Gold', hex: '#D4AF37', images: [{ url: 'https://img.com/gold.jpg', publicId: 'g1' }] }],
    });

    variant = await Variant.create({
      product: product._id,
      sku: 'YNR-LEH-GOLD-38',
      color: { name: 'Antique Gold', hex: '#D4AF37' },
      size: '38',
      mrp: 4500000, // 45,000 INR
      basePrice: 3000000,
      sellingPrice: 3000000, // 30,000 INR = 3000000 paise
      costPrice: 1500000, // 15,000 INR (private supplier cost)
      stock: 5,
      reservedStock: 0,
      isActive: true,
    });

    await Batch.create({
      batchNo: 'YNR-2611-WMN-LEAKTEST',
      product: product._id,
      receivedOn: new Date(),
      status: BATCH_STATUS.ACTIVE,
      items: [{ variant: variant._id, qtyReceived: 5, qtyAvailable: 5, qtyReserved: 0, qtySold: 0 }],
    });

    // 4. Create Reseller Share Link with margin of Rs 2,500 (250000 paise)
    await ResellerShare.create({
      reseller: reseller._id,
      product: product._id,
      token: 'leak_check_token_123',
      marginPerUnit: 250000, // 2,500 INR margin
      isActive: true,
    });

    // 5. Place order through the reseller link
    const checkoutResult = await checkoutService.placeOrder({
      customer: buyer,
      body: {
        idempotencyKey: 'idemp-leak-test-order',
        items: [{ variantId: variant._id.toString(), qty: 1 }],
        shareToken: 'leak_check_token_123',
        shippingAddress: {
          name: 'Meera Kapoor',
          phone: '9876543299',
          line1: 'B-701, Oberoi Splendor',
          city: 'Mumbai',
          state: 'Maharashtra',
          stateCode: '27',
          pincode: '400060',
          country: 'IN',
        },
        paymentMethod: PAYMENT_METHOD.COD,
      },
    });

    resellerOrder = checkoutResult.order;
  });

  describe('Internal Invoice Generation', () => {
    it('generates internal tax invoice PDF containing batch numbers and full GST split', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/orders/${resellerOrder.orderNo}/invoices/internal`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .parse(binaryParser)
        .buffer();

      expect(res.status).toBe(200);
      expect(res.header['content-type']).toBe('application/pdf');

      const pdfBuffer = res.body;
      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      // Valid PDF magic header
      expect(pdfBuffer.toString('utf8', 0, 5)).toBe('%PDF-');

      const pdfText = extractPdfText(pdfBuffer);
      expect(pdfText).toContain('TAX INVOICE');
      expect(pdfText).toContain(resellerOrder.orderNo);
      // Internal invoice must contain the batch number
      expect(pdfText).toContain('YNR-2611-WMN-LEAKTEST');
    });
  });

  describe('Reselling Invoice Generation & PRIVACY LEAK TEST', () => {
    it('generates retail invoice for buyer and guarantees NO base price, margin, or batch leaks', async () => {
      const res = await request(app)
        .get(`/api/v1/orders/${resellerOrder.orderNo}/invoices/reselling`)
        .set('Authorization', `Bearer ${customerToken}`)
        .parse(binaryParser)
        .buffer();

      expect(res.status).toBe(200);
      expect(res.header['content-type']).toBe('application/pdf');

      const pdfBuffer = res.body;
      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.toString('utf8', 0, 5)).toBe('%PDF-');

      const pdfText = extractPdfText(pdfBuffer);

      // 1. Must contain Retail Invoice heading, orderNo, and buyer name
      expect(pdfText).toContain('RETAIL INVOICE');
      expect(pdfText).toContain(resellerOrder.orderNo);
      expect(pdfText).toContain('Meera Kapoor');

      // 2. Must contain the unified buyer selling price (32,500.00 INR = 30,000 base + 2,500 margin)
      expect(pdfText).toContain('32500.00');

      // 3. HARD PRIVACY LEAK ASSERTIONS (docs/PLAN.md §9 and Phase B8 gate):
      // - Must NOT contain supplier cost price (15,000 or 1500000)
      expect(pdfText).not.toMatch(/(^|\s)15000(\.00)?(\s|$)/);
      expect(pdfText).not.toContain('1500000');

      // - Must NOT contain reseller margin as a distinct line or value (2500.00 or 250000)
      expect(pdfText).not.toMatch(/(^|\s)2500(\.00)?(\s|$)/);
      expect(pdfText).not.toContain('250000');
      expect(pdfText).not.toMatch(/margin/i);
      expect(pdfText).not.toMatch(/reseller/i);

      // - Must NOT contain the internal batch number
      expect(pdfText).not.toContain('YNR-2611-WMN-LEAKTEST');
      expect(pdfText).not.toMatch(/batch/i);
    });
  });

  describe('Warehouse Packing Slip Generation', () => {
    it('generates packing slip with picking list and batch numbers for warehouse dispatch', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/orders/${resellerOrder.orderNo}/invoices/packing-slip`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .parse(binaryParser)
        .buffer();

      expect(res.status).toBe(200);
      expect(res.header['content-type']).toBe('application/pdf');

      const pdfBuffer = res.body;
      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.toString('utf8', 0, 5)).toBe('%PDF-');

      const pdfText = extractPdfText(pdfBuffer);
      expect(pdfText).toContain('PACKING SLIP');
      expect(pdfText).toContain(resellerOrder.orderNo);
      // Warehouse packing slip must have the batch number to pick from
      expect(pdfText).toContain('YNR-2611-WMN-LEAKTEST');
      expect(pdfText).toContain('Quality Checked By');
    });
  });
});
