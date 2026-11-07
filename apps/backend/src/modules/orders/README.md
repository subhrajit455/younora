# Orders, Checkout, Payments & Invoices Module

## Overview
This module orchestrates the end-to-end checkout, payment processing, order lifecycle state machine, and PDF invoice generation for Younora Luxury Fashion.

## Architecture

```
apps/backend/src/modules/
├── checkout/
│   ├── checkout.controller.js  # Preview & order placement handlers
│   ├── checkout.routes.js      # /api/v1/checkout
│   └── checkout.service.js     # Pricing computation, inventory reservation & idempotency
├── orders/
│   ├── models/
│   │   ├── order.model.js      # Order schema with items, pricing, addresses, lifecycle history
│   │   └── invoice.model.js    # Invoice records (Internal GST vs Reselling Retail)
│   ├── pdf/
│   │   └── invoicePdf.js       # PDFKit generators for Tax Invoices, Retail Invoices, Packing Slips
│   ├── adminOrder.routes.js    # /api/v1/admin/orders
│   ├── invoice.service.js      # Invoice numbering & PDF streaming
│   ├── order.controller.js     # Customer & Admin endpoints
│   ├── order.routes.js         # /api/v1/orders
│   ├── order.service.js        # State transitions, cancellations, restock, manual phone orders
│   └── order.validation.js     # Zod schemas for order creation, status update, packing proof
└── payments/
    ├── models/
    │   └── payment.model.js    # Payment transactions schema
    ├── payment.controller.js   # Verify payment & webhook receiver
    ├── payment.routes.js       # /api/v1/payments
    ├── payment.service.js      # Signature verification, idempotency, order confirmation & expiry
    └── razorpay.service.js     # Razorpay API client & webhook signature verification
```

## Key Invariants

1. **Integer Paise Representation (Rule 7)**:
   - All monetary figures (`sellingPrice`, `subtotal`, `taxableAmount`, `gstAmount`, `shippingFee`, `codFee`, `discount`, `grandTotal`, `marginPerUnit`) are strictly stored as integer paise.
   - Zero floating-point rounding errors across database storage and calculations.

2. **FIFO Stock Allocation & Reversal**:
   - Order placement reserves inventory using FIFO logic (`qtyAvailable` -> `qtyReserved`).
   - Payment confirmation converts reservations to sold (`qtyReserved` -> `qtySold`).
   - Payment expiry (15-min timeout) or pre-confirmation cancellation safely releases reserved stock back to `qtyAvailable`.
   - Pre-shipment cancellation (`CONFIRMED`, `PACKED`, `READY_TO_SHIP`) restores `qtySold` back to `qtyAvailable` (`fifoService.restockCancelledSale`).

3. **Sequential Atomic Numbering**:
   - Order numbers: `YNR-YYMM-00001` (resets monthly).
   - Internal invoices: `INV/FY/00001` (resets with Indian Financial Year, Apr 1 – Mar 31).
   - Reselling retail invoices: `RINV/FY/00001`.

4. **Reseller Privacy Protection (Leak Gate)**:
   - Reselling invoices (`RINV`) presented to customers guarantee 100% isolation of wholesale/margin data:
     - No base selling price
     - No reseller margin
     - No internal batch numbers
     - No supplier cost
   - Only the unified customer retail price (`basePrice + resellerMargin`) is rendered.

5. **Webhook Security & Idempotency**:
   - Razorpay webhooks use `req.rawBody` for timing-safe HMAC SHA-256 verification.
   - Webhook events are tracked via `razorpayEventId` to prevent duplicate processing.

