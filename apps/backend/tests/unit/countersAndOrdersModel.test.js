const mongoose = require('mongoose');
const {
  getIndianFinancialYear,
  generateOrderNo,
  generateInvoiceNo,
} = require('../../src/core/utils/counters');
const Order = require('../../src/modules/orders/models/order.model');
const Invoice = require('../../src/modules/orders/models/invoice.model');
const Payment = require('../../src/modules/payments/models/payment.model');
const {
  ORDER_STATUS,
  PAYMENT_METHOD,
  PAYMENT_STATUS,
  INVOICE_TYPE,
  ORDER_SOURCE,
  ORDER_ITEM_STATUS,
} = require('@younora/shared-constants');
const { startTestDb, stopTestDb, clearTestDb } = require('../helpers/testDb');

describe('Slice 1: Counters, Numbering & Core Order/Payment/Invoice Models', () => {
  beforeAll(async () => {
    await startTestDb();
  });

  afterAll(async () => {
    await stopTestDb();
  });

  beforeEach(async () => {
    await clearTestDb();
  });

  describe('Indian Financial Year Calculation', () => {
    it('returns correct FY for April through December (e.g. Nov 2026 -> 2627)', () => {
      const nov2026 = new Date('2026-11-07');
      expect(getIndianFinancialYear(nov2026)).toBe('2627');

      const apr2026 = new Date('2026-04-01');
      expect(getIndianFinancialYear(apr2026)).toBe('2627');
    });

    it('returns correct FY for January through March (e.g. Feb 2027 -> 2627)', () => {
      const feb2027 = new Date('2027-02-15');
      expect(getIndianFinancialYear(feb2027)).toBe('2627');

      const mar2027 = new Date('2027-03-31');
      expect(getIndianFinancialYear(mar2027)).toBe('2627');
    });
  });

  describe('Sequential Order Number Generator', () => {
    it('generates format YNR-YYMM-00001 with atomic increments', async () => {
      const orderNo1 = await generateOrderNo();
      const orderNo2 = await generateOrderNo();

      expect(orderNo1).toMatch(/^YNR-\d{4}-00001$/);
      expect(orderNo2).toMatch(/^YNR-\d{4}-00002$/);
    });
  });

  describe('Sequential Invoice Number Generator', () => {
    it('generates INTERNAL invoice format INV/FY/00001', async () => {
      const invNo1 = await generateInvoiceNo(INVOICE_TYPE.INTERNAL, '2627');
      const invNo2 = await generateInvoiceNo(INVOICE_TYPE.INTERNAL, '2627');

      expect(invNo1).toBe('INV/2627/00001');
      expect(invNo2).toBe('INV/2627/00002');
    });

    it('generates RESELLING invoice format RINV/FY/00001', async () => {
      const rinvNo1 = await generateInvoiceNo(INVOICE_TYPE.RESELLING, '2627');
      const rinvNo2 = await generateInvoiceNo(INVOICE_TYPE.RESELLING, '2627');

      expect(rinvNo1).toBe('RINV/2627/00001');
      expect(rinvNo2).toBe('RINV/2627/00002');
    });
  });

  describe('Order Model Validation', () => {
    it('creates a valid order with embedded snapshots and integer paise', async () => {
      const order = new Order({
        orderNo: 'YNR-2611-00001',
        customer: new mongoose.Types.ObjectId(),
        items: [
          {
            product: new mongoose.Types.ObjectId(),
            variant: new mongoose.Types.ObjectId(),
            name: 'Banarasi Silk Saree',
            sku: 'YNR-SAREE-RED-FREE',
            color: { name: 'Crimson Red', hex: '#DC143C' },
            size: 'FREE',
            batchNo: 'YNR-2611-WMN-0001',
            mrp: 1200000,
            baseSellingPrice: 900000,
            marginPerUnit: 100000,
            sellingPrice: 1000000, // 900000 + 100000
            qty: 1,
            taxableValue: 892857,
            gstAmount: 107143,
            lineTotal: 1000000,
            itemStatus: ORDER_ITEM_STATUS.ACTIVE,
          },
        ],
        shippingAddress: {
          name: 'Ananya Roy',
          phone: '9876543210',
          line1: 'Flat 402, Royal Palms',
          city: 'New Delhi',
          state: 'Delhi',
          stateCode: '07',
          pincode: '110001',
          country: 'IN',
        },
        billingAddress: {
          name: 'Ananya Roy',
          phone: '9876543210',
          line1: 'Flat 402, Royal Palms',
          city: 'New Delhi',
          state: 'Delhi',
          stateCode: '07',
          pincode: '110001',
          country: 'IN',
        },
        pricing: {
          itemsTotal: 1000000,
          discount: 0,
          taxableAmount: 892857,
          gstTotal: { cgst: 53572, sgst: 53571, igst: 0, total: 107143, isIntraState: true },
          shippingFee: 0,
          codFee: 0,
          roundOff: 0,
          grandTotal: 1000000,
        },
        payment: {
          method: PAYMENT_METHOD.ONLINE,
          status: PAYMENT_STATUS.PENDING,
          razorpayOrderId: 'order_test_123',
        },
        status: ORDER_STATUS.PENDING_PAYMENT,
        reselling: {
          isResellerOrder: true,
          marginTotal: 100000,
          baseAmount: 900000,
          buyerAmount: 1000000,
        },
        idempotencyKey: 'idemp-key-order-1',
        source: ORDER_SOURCE.WEB,
      });

      await order.save();
      expect(order._id).toBeDefined();
      expect(order.orderNo).toBe('YNR-2611-00001');
      expect(order.pricing.grandTotal).toBe(1000000);
    });

    it('rejects order without line items', async () => {
      const order = new Order({
        orderNo: 'YNR-2611-00002',
        items: [],
      });

      await expect(order.save()).rejects.toThrow();
    });
  });

  describe('Invoice & Payment Models Validation', () => {
    it('creates and indexes Invoice and Payment records correctly', async () => {
      const orderId = new mongoose.Types.ObjectId();
      const invoice = new Invoice({
        order: orderId,
        orderNo: 'YNR-2611-00001',
        type: INVOICE_TYPE.INTERNAL,
        number: 'INV/2627/00001',
        financialYear: '2627',
        issuedTo: {
          name: 'Ananya Roy',
          line1: 'Flat 402, Royal Palms',
          city: 'New Delhi',
          state: 'Delhi',
          pincode: '110001',
        },
        totals: {
          taxableAmount: 892857,
          totalGst: 107143,
          grandTotal: 1000000,
        },
      });

      await invoice.save();
      expect(invoice.number).toBe('INV/2627/00001');

      const payment = new Payment({
        order: orderId,
        orderNo: 'YNR-2611-00001',
        method: PAYMENT_METHOD.ONLINE,
        provider: 'RAZORPAY',
        amount: 1000000,
        razorpayOrderId: 'order_test_123',
        status: 'CREATED',
      });

      await payment.save();
      expect(payment.amount).toBe(1000000);
    });
  });
});

