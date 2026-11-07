# Younora Pricing Engine & Cart Architecture (`v0.7.0`)

## Overview
The Pricing Engine (`apps/backend/src/modules/pricing/pricing.engine.js`) serves as the **single source of truth** for all monetary calculations across the Younora Luxury Fashion platform. It is designed as a deterministic, pure function without direct I/O, guaranteeing mathematical consistency between cart previews, checkout confirmations, and invoice generation.

---

## Core Invariants

### 1. Integer Paise Standard (Rule 7)
All monetary values are strictly represented and calculated in **integer paise** ($1\text{ INR} = 100\text{ paise}$).
- No floating-point currencies.
- Fractional divisions (such as tax back-calculations and pro-rated coupon distributions) utilize round-half-up integer rounding (`Math.round`), with odd-paise remainder adjustments explicitly balancing totals.

### 2. Reseller Margin Injection & Safety Caps
When a buyer accesses an item via a valid reseller share token (`ResellerShare`):
- Reseller margin ($M_{\text{unit}}$) is injected on top of the base selling price.
- **Category Cap:** Margin percentage cannot exceed category-configured caps (`marginLimitsByCategory`) or the store-wide default (`defaultMaxMarginPercent`, default 25%).
- **MRP Ceiling:** The effective buyer price cannot exceed the variant's Maximum Retail Price (`mrp`) unless explicitly overridden by `priceMayExceedMrp = true`.
- **Product Gate:** If a product has `resellingEnabled: false`, no reseller margin is added.
- **Status Gate:** Margin is only injected if the reseller account is in `APPROVED` status and the share link is active.

### 3. Coupon Pro-Ration & Reseller Interaction
Coupons are evaluated and pro-rated across eligible cart line items:
- **Scope Filtering:** Coupons support `ALL`, `CATEGORY`, and `PRODUCT` scoping. Lines outside scope receive 0 discount.
- **Pro-Ration Formula:** Discount on line $i$ is distributed proportionally to its weight in eligible items total:
  $$\text{discount}_i = \text{round}\left(\text{totalDiscount} \times \frac{\text{lineTotal}_i}{\sum \text{lineTotal}}\right)$$
  Any rounding delta between $\sum \text{discount}_i$ and $\text{totalDiscount}$ is added to the highest-value item, ensuring exact sum equality.
- **Reseller Order Lock:** If an order has reseller margin, coupons are blocked by default unless `settings.reselling.couponsAllowedOnResellerOrders === true`.

### 4. Dual GST Tax Back-Calculation
Luxury fashion retail prices in India are typically tax-inclusive:
- **Taxable Base Back-Calculation:**
  $$\text{taxableAmount} = \text{round}\left(\frac{\text{netGoodsPrice}}{1 + \text{gstRate}}\right)$$
  $$\text{totalGST} = \text{netGoodsPrice} - \text{taxableAmount}$$
- **Intra-State (Delhi to Delhi, `07`):** Split equally into `CGST` ($50\%$) and `SGST` ($50\%$). Odd paise are assigned to `CGST` so $\text{CGST} + \text{SGST} = \text{totalGST}$.
- **Inter-State (Delhi to Other States):** Charged entirely as `IGST` ($100\%$).

### 5. Shipping & Cash on Delivery (COD) Rules
- **Free Shipping:** Applicable when net goods total (after coupon discount) $\ge \text{freeShippingAbove}$. Otherwise flat shipping fee is added.
- **COD Restrictions:** Enforces global toggle (`codEnabled`), order value bounds (`codMinOrder` to `codMaxOrder`), and delivery pincode blocklist (`codBlockedPincodes`).

---

## Cart Module Lifecycle (`modules/cart`)

1. **Guest & Customer Carts:**
   - Unauthenticated users interact via `x-guest-token`.
   - Authenticated customers interact via customer JWT.
   - Upon login, guest carts are atomically merged (`POST /api/v1/cart/merge`), combining quantities up to stock/safety limits and transferring share tokens and coupons.
2. **Live Stock Check:**
   - On retrieval, cart line items are checked against live physical and reserved inventory (`variant.stock - variant.reservedStock`).
   - If stock is insufficient, items trigger stock warnings without failing request previews.

