# Younora Luxury Fashion — Final Plan v2.0

**Version 2.0 · 5 Nov 2026 · supersedes v1.0 (4 Nov 2026)** **Stack:** MERN · **Build order:** Backend → CRM → Storefront (incl. Reseller panel) · **Philosophy:** simple, correct, working first; advanced features later.

---

## 1. What Changed From v1.0

| Area | v1.0 | v2.0 (this plan) |
| --- | --- | --- |
| Returns | Full return/exchange workflow, QC, risk score, reverse pickup | **Removed from the app.** Returns are handled manually (phone/WhatsApp). CRM gets only a light **Manual Returns Register** so stock, refunds and reseller earnings stay correct. |
| Reselling | Not present | **New module:** resellers share products, buyers order via the share link, reseller earns profit into a wallet, a separate **Reselling Invoice** is generated and lives in its own CRM section. Selected details are **hidden** on reselling flows. |
| Batch | CRM-only tracking | Batch number tracked everywhere **and searchable from both CRM and the customer side**. |
| Complexity | Redis + BullMQ, Web Push, risk scoring, exchange, shared packages, 13 backend phases | **Simplified:** no Redis/BullMQ (DB-backed jobs + `node-cron`), in-app notifications first (Web Push optional later), no risk engine, fewer phases. |
| Stack detail | ESM / mixed | **CommonJS** (same as the old Green Tree code) so reusable files can be copied with minimal change. |

**Everything not mentioned here stays as in v1.0** (money in paise, Zod validation, modular monolith, thin controllers, standard response format, snapshots on orders, idempotent webhooks, audit log, Engineering Rules §3 of v1.0).

---

## 2. Scope of v1 (Simple Core)

### 2.1 In scope

- **Storefront:** home, menu (Audience → Category → Subcategory), listing with filters/sort, search, product page (color images, size selector, size chart, pincode check, reviews), wishlist, cart, coupons, checkout (Razorpay + COD), orders, tracking, invoice download, reviews, account/addresses, policy pages, contact form, **batch search**, **reseller panel**.
- **CRM:** dashboard, catalog (products + variants), inventory & batches (+ batch search), orders, shipping (Bigship), payments (COD toggle/rules, refunds), **Manual Returns Register**, reviews moderation, customers, **resellers + payouts + reselling invoices**, coupons, banners/CMS, settings, staff & permissions, in-app notification bell.

### 2.2 Deferred (later, not forgotten)

In-app return requests with photos · exchange flow · risk score · Web Push · broadcast offers · abandoned-cart nudges · bulk Excel for everything (only products + stock receive in v1) · advanced reports · multi-level reselling · reseller tiers · automatic payouts.

### 2.3 Roles

| Role | Where | Can do |
| --- | --- | --- |
| Customer | Storefront | Shop, orders, reviews |
| **Reseller** | Storefront (extra "Reselling" area) | A customer with `isReseller = true` (approved by admin). Share products, see own orders & earnings, request payout |
| Super Admin | CRM | Everything |
| Staff | CRM | Permission-based (products, orders, inventory, returns register, reviews, resellers, settings) |

---

## 3. Manual Returns (No Return Module)

**Customer side:** a clear Return Policy page and a "Need to return? Contact us" block (phone / WhatsApp / email / contact form). No return button, no photo upload.

**CRM side — Manual Returns Register (light):** the owner or staff records what already happened offline.

```
manual_returns:
  returnNo, order, items[{ orderItem, qty, reason (free text/dropdown), condition: RESELLABLE|DAMAGED }],
  restock (bool) → if true, qty goes back to the ORIGINAL batch (ledger entry RETURN_RESTOCK),
  refund { amount (paise), mode: RAZORPAY|UPI|BANK|NONE, status, razorpayRefundId?, note },
  resellerImpact: auto-reverses the reseller's earning for the returned items,
  handledBy, notes, createdAt
```

Why keep even this small register: (1) stock stays accurate, (2) the batch shows how many pieces came back (spot bad lots), (3) a reseller's profit is reversed automatically, (4) Razorpay refunds can be triggered from one place, (5) every refund is audited.

---

## 4. Reselling Module (New)

### 4.1 Idea in one paragraph

A reseller picks a product, gets a **personal share link**, and sends it to their own buyer. The buyer opens the link, sees the product, and orders (the buyer enters their own address; Younora ships directly to the buyer). When the order is delivered and the hold period passes, the reseller's **profit is credited to their wallet**. A second invoice — the **Reselling Invoice** — is generated in addition to the normal invoice and kept in a separate CRM section.

### 4.2 Profit model — decide one `[CONFIRM]`

| Option | How it works | Pros / cons |
| --- | --- | --- |
| **A. Fixed commission (recommended for v1)** | Admin sets commission % (global default, overridable per category/product). Buyer pays the normal price. Reseller earns % of the item taxable value. | Simplest, no price confusion, easy to reverse on returns |
| B. Reseller sets own margin (Meesho-style) | Reseller adds ₹ margin on top of base price per share link (capped by admin). Buyer pays base + margin. Margin = reseller profit. | More flexible, more validation, GST & invoice handling heavier |

The schema below supports both; v1 implements **A** unless you choose B in the meeting.

### 4.3 Flow

```
Reseller applies → admin approves (isReseller=true, bank/UPI details saved encrypted)
Reseller opens product → "Share to earn" → system creates reseller_share (token)
Share URL: https://younora.com/s/<token>   (product page in "reselling view")
Buyer opens link → orders (guest or login) → order stores reselling { reseller, share, commission }
Order DELIVERED → earning status PENDING → after hold days (e.g. 7) → AVAILABLE in wallet
Manual return recorded in CRM → earning for those items = REVERSED
Reseller requests payout → admin pays outside the app (UPI/bank) → marks PAID with reference
```

### 4.4 Data model additions

```
customers (+): isReseller, resellerStatus: NONE|PENDING|APPROVED|SUSPENDED,
               resellerCode (unique), payoutDetails (ENCRYPTED: upi/bank, pan?)
reseller_shares: reseller, product, token (unique), clicks, ordersCount, isActive, createdAt
                 (option B only: marginPaise)
orders (+): reselling { isResellerOrder, reseller, share, commissionRate|margin, commissionTotal }
wallet_transactions (immutable ledger): reseller, type: EARNING|REVERSAL|PAYOUT|ADJUSTMENT,
               amount (+/-), status: PENDING|AVAILABLE|PAID|REVERSED, order, orderItem, availableOn, note
payout_requests: reseller, amount, status: REQUESTED|PAID|REJECTED, paidRef, paidAt, handledBy
invoices (or order.invoices[]): type: SALE|RESELLING, number, pdfUrl, orderId, generatedAt
settings.reselling: enabled, defaultCommissionPercent, holdDays, minPayout, hiddenFields config
```

Wallet balance is **always derived from the ledger** (never a mutable number edited by hand).

### 4.5 Reselling Invoice

- Generated automatically when the order is confirmed (same moment as the normal invoice) using the **same template/layout** as the original.
- Separate number series: `RINV/2627/00001`.
- Stored and listed in **CRM → Reselling → Invoices** (filter by reseller, date, order; download PDF).
- Content differs from the original per the visibility matrix (§4.6). `[CONFIRM exact use: given to the buyer, to the reseller, or internal only]`.

### 4.6 Hidden-details matrix `[CONFIRM each row]`

Hiding is enforced **on the server** (a `resellingView` serializer strips fields before the response/PDF is built) — never just hidden in the UI.

| Detail | Normal order | Reselling order: reseller sees | Reselling Invoice | Staff without `resellers.view-sensitive` |
| --- | --- | --- | --- | --- |
| Cost price / supplier | Owner only | Hidden | Hidden | Hidden |
| Batch number | Shown | Hidden (default) | Hidden (default) | Shown in inventory only |
| Buyer phone/address | Full | **Name + city/state only** | Buyer address as needed for delivery | Full (needed to ship) |
| Commission / profit | n/a | Own earning only | Hidden from buyer | Visible to owner / permitted staff |
| Other resellers' data | n/a | Never | n/a | Permission-gated |
| Younora MRP vs selling price | Shown | Shown | `[CONFIRM]` | Shown |

The hidden-field list lives in `settings.reselling.hiddenFields` so it can be changed without code changes.

### 4.7 Reselling rules

- Reseller **cannot buy through their own link** to earn commission (block same user/phone/address match).
- Earning is calculated on **taxable value after discounts/coupons**, excluding shipping and COD fee.
- COD reselling orders: earning starts only after COD is marked collected.
- Cancelled / RTO orders: no earning (or reversal if already pending).
- Suspended reseller: links stop working for new orders; existing earnings remain.
- GST/TDS on reseller payouts → **CA confirmation required** before launch.

---

## 5. Batch System (Simple + Searchable)

### 5.1 Model (simplified)

A **batch = one received lot of one product**, holding quantities per variant.

```
batches: batchNo (unique), product, receivedOn, supplier{name, ref}, costPerUnit?,
         items[{ variant, qtyReceived, qtyAvailable, qtySold, qtyReturned, qtyDamaged }],
         status: ACTIVE|EXHAUSTED|QUARANTINED, notes
```

- **Format (proposed):** `YNR-<YYMM>-<AUD>-<SEQ4>` e.g. `YNR-2611-WMN-0042`; admin may type their own unique value `[CONFIRM]`.
- **Allocation:** FIFO; the `batchNo` is snapshotted on each order line (split lines if an order spans two batches).
- Receiving stock creates/updates the batch and raises variant stock; every change writes a `stock_movements` ledger row.

### 5.2 Batch search — both sides

| Side | Endpoint | Input | Result |
| --- | --- | --- | --- |
| **CRM** `GET /admin/batches/search?q=` | partial batch no., product name, SKU | Batch card: product, variants & remaining qty, received date, supplier, cost (permission-gated), **orders sold from it**, manual returns/damages, link to product |  |
| **Customer** `GET /store/batch/:batchNo` | exact batch no. (printed on tag/invoice) | **Public-safe only:** product name, image, color/size in that batch, "Authentic Younora batch", link to product page. No cost, supplier, stock counts or other customers' data. Rate-limited. Hidden for reselling views per §4.6 |  |

Customer UI: a small "Search by batch no." box (footer/header or on the My Orders page).

---

## 6. Simplified Architecture

- Modular monolith (Node 20, **Express 5, CommonJS**, Mongoose 8, MongoDB Atlas replica set for transactions).
- **No Redis/BullMQ in v1:** background work uses a small `jobs` collection (status, attempts, runAt) polled by `node-cron` every minute — enough for shipment retry, expiring unpaid orders, reseller hold release, tracking sync. Redis can be added later behind the same `queue` interface.
- **Realtime:** Socket.IO for the CRM bell and storefront in-app notifications; `notifications` collection for history. Web Push = optional later phase (adds `web-push` + service worker).
- Cloudinary for media, Razorpay for online payment, Bigship via a provider adapter, `pdfkit` for invoices, `exceljs` for import/export, `pino` logging, Jest + Supertest + mongodb-memory-server.
- CRM: React + Vite + TanStack Query + RHF/Zod + Tailwind. Storefront: Next.js (SSR for SEO) + Tailwind. Design tokens from v1.0 §4 (onyx / espresso / gold / amber / ivory).
- Shared code: only **`packages/shared-constants`** (statuses, roles, permissions) in v1; add shared validation later if useful.

### Module list (backend)

`auth · users (admin, customers, addresses) · catalog (taxonomy, products, variants) · inventory (batches, ledger, batch search) · storefront (public read) · cart · pricing · coupons · checkout · orders (+invoices) · payments · shipping · manual-returns · reselling (shares, earnings, wallet, payouts, reselling invoices) · reviews · notifications · cms · enquiry · reports · settings · audit`

Each module keeps the v1.0 layering: `route → validation → controller → service → model`.

---

## 7. Core Business Rules (Unchanged Essentials)

1. **Pricing engine** is the single source of truth: server-side prices, coupon, GST (CGST+SGST vs IGST), shipping, COD fee, round-off — all integer paise. Reselling commission is computed **from** this breakup, never mixed into it.
2. **Stock:** atomic reserve (`stock >= qty`), release on cancel/expiry, ledger for every movement. Concurrency test is a hard gate.
3. **Order status:** `PENDING_PAYMENT → CONFIRMED → PACKED → READY_TO_SHIP → SHIPPED → OUT_FOR_DELIVERY → DELIVERED → COMPLETED`; `CANCELLED` (before shipping) and `RTO`. Illegal transitions rejected; history kept.
4. **Payments:** Razorpay webhook is the source of truth (raw-body signature check, event-id idempotency); client verify is for instant UI only. COD toggle + rules (min/max, blocked pincodes, fee) from settings.
5. **Shipping:** Bigship call is a background job with retry; an order is never lost if the courier is down; admin sees **Retry**; manual AWB entry as fallback. `[VERIFY]` all Bigship endpoints, webhooks and sandbox against official docs first.
6. **Reviews:** verified buyers only (delivered order), admin hide/show/reply/delete, only VISIBLE counted in ratings.
7. **Invoices:** financial-year numbering, GSTIN, HSN, tax breakup, batch per line (normal invoice). `[CONFIRM with CA]`.

---

## 8. API Additions / Changes vs v1.0

**Removed:** all `/returns` customer & `/admin/returns` workflow endpoints, risk-score endpoints, push endpoints (until optional phase).

**New**

| Group | Endpoints |
| --- | --- |
| Manual returns (A) | `POST/GET /admin/manual-returns`, `GET /:id`, `PATCH /:id`, `POST /:id/refund` |
| Batch search | `GET /admin/batches/search`, `GET /store/batch/:batchNo` |
| Reseller (C) | `POST /reseller/apply`, `GET /reseller/me`, `POST /reseller/shares`, `GET /reseller/shares`, `GET /reseller/orders`, `GET /reseller/wallet`, `POST /reseller/payouts` |
| Public share | `GET /store/share/:token` (product in reselling view; increments click count) |
| Reseller admin (A) | `GET /admin/resellers`, \`PATCH /:id/approve |
| Settings | `PATCH /admin/settings/reselling` |

All other endpoints follow v1.0 §14.

---

## 9. Reuse From the Uploaded Green Tree Backend

I reviewed the uploaded code (Express 5, Mongoose 8, CommonJS, Razorpay, Cloudinary, multer, xlsx, node-cron; one 52 KB `order.controller.js`; Shiprocket + Fast2SMS calls inline).

| Old file(s) | Decision | Notes |
| --- | --- | --- |
| `config/cloudinary.js`, `upload.controller.js` (multer-cloudinary) | **Reuse** | Add type/size limits, per-entity folders |
| `middleware/authorization.js` | **Reuse idea, fix** | Currently returns **400** for missing/invalid token and checks only a role string → must be 401/403, permission-based, with refresh tokens |
| `register.controller/models` | **Split & rewrite** | Separate `admin_users` / `customers`; hash OTP; remove SMS; add reseller fields |
| `staff.controller` | Reuse → admin users + permissions |  |
| `payment.controller.js` | **Reuse core** | Create-order + signature verify exist; add webhook, payments collection, server-side amount |
| `cod.models/controller` | Reuse → `settings.payments` | Add rules |
| `coupon.*` | **Rewrite** | Old model is flat-by-category only (type/min/expiry are commented out) |
| `category/subCategory/mainCategory` | Reuse structure → Audience/Category/Subcategory with ObjectId refs |  |
| `address`, `wishlist`, `cart` | Reuse, make variant-aware |  |
| `slide`, `title` | Reuse → CMS banners/sections |  |
| `enquiry` | Reuse | Add status/reply |
| `shippingPrice` | Keep as pincode-based fallback |  |
| `upload.controller` (xlsx) | Reuse idea | Variant-aware product import with row-error report |
| `order.controller.js` | **Rewrite** | Split into checkout / orders / payments / shipping services |
| `product.models.js` | **Rewrite** | Product + Variant + Batch |
| `shipping.controller` (Fast2SMS), `whatsapp.service`, birthday/anniversary crons, `roadChallan.*`, `tax.*` | **Drop** | SMS/WhatsApp out; nursery-specific; tax moves to HSN/GST on product |
| `app.js` | Fix | `cors: *`, no helmet/rate-limit, no error middleware, no tests |

**Security note:** before reusing anything, check the old repo's git history for committed `.env`/keys and rotate any Razorpay, Cloudinary, Shiprocket, SMTP or JWT secrets.

---

## 10. Phase Plan — Backend (Plan → Implement → Test → Sign-off)

One phase at a time. No phase starts until the previous phase's gate passes. Timings = solo developer with AI help.

| # | Phase | Key deliverables | Gate (must pass) | Est. |
| --- | --- | --- | --- | --- |
| **B0** | Foundation | Repo, lint/format, Express 5 app, env validation, pino, helmet/cors/rate-limit, error + response format, health, Jest setup, CI | Clone→install→test in <10 min | 2–3 d |
| **B1** | Auth & Users | admin\_users, customers (with reseller fields), addresses, JWT + rotating refresh cookie, permissions, staff CRUD, seed super-admin, audit log | 401/403 correct, refresh rotation, staff permission tests | 4–5 d |
| **B2** | Notifications (in-app) | Event bus, notifications model, Socket.IO rooms, list/read/unread APIs, template registry | Event reaches only the right user/admin room | 2–3 d |
| **B3** | Taxonomy & Media | Audience/Category/Subcategory, attributes, size charts, Cloudinary upload | Menu tree API, upload limits | 3 d |
| **B4** | Products & Variants | Product + color images + variant matrix in one transaction, SKU, price/stock per variant, import/export | Create 10 real products via API | 6–8 d |
| **B5** | Inventory & Batches | Batch numbering, receive stock, adjustments, FIFO allocation, ledger, low-stock events, **CRM batch search** | 50 parallel reserves on stock 10 → exactly 10 win | 4–5 d |
| **B6** | Storefront Read APIs | Listing/filters/sort/search, product detail, home/CMS read, wishlist, **public batch lookup** | Hidden/draft never exposed; contract frozen in OpenAPI | 4–5 d |
| **B7** | Cart, Pricing, Coupons, Settings | Pricing engine + golden tests, coupons, cart (guest merge), settings, pincode check stub | ≥25 pricing cases approved (+ CA review) | 5–6 d |
| **B8** | Checkout, Orders, Payments, Invoices | Idempotent checkout, Razorpay + webhook, COD rules, order state machine, manual order, **invoice PDF with batch**, cancel+refund | Tamper test, duplicate submit, webhook replay, last-item race | 8–10 d |
| **B9** | Shipping (Bigship) | Client, adapter, serviceability, shipment job with retry, label, tracking webhook + cron, cancel | 3 sandbox shipments (prepaid, COD, cancelled) | 6–8 d |
| **B10** | **Reselling** | Reseller apply/approve, share links, order attribution, earnings, hold & release job, wallet ledger, payouts, **Reselling Invoice**, server-side hiding | Earning created on delivery, reversed on manual return, own-link purchase blocked, hidden fields never leak | 6–8 d |
| **B11** | Manual Returns, Reviews | Returns register (restock to batch, refund via Razorpay, reseller reversal), reviews + moderation + rating aggregates | Return updates stock, ledger, refund and wallet consistently | 4–5 d |
| **B12** | CMS, Enquiry, Dashboard, Reports | Banners/sections/pages, enquiry, KPIs, sales/GST/batch/reselling reports + export | Dashboard reconciles with raw orders | 4–5 d |
| **B13** | Hardening & Release | Security pass, indexes, OpenAPI + Postman, runbooks, backup drill, load test, staging | CI green, staging stable 3 days | 4–6 d |

**Backend total ≈ 10–13 weeks.** (v1.0 estimated 12–15 weeks; savings come from dropping returns/risk/push/Redis.)

**Optional later phase — Web Push:** VAPID keys, `push_subscriptions`, service worker, permission UX (≈4–5 days, after storefront).

---

## 11. Phase Plan — Frontend

| # | Phase | Scope | Est. |
| --- | --- | --- | --- |
| F0 | Design system | Tailwind tokens (Younora palette/fonts), base components, API client with refresh, logo assets | 3–4 d |
| F1 | CRM shell & auth | Login, guards by permission, layout, staff UI | 3 d |
| F2 | CRM catalog | Taxonomy, size charts, product form with variant matrix, import/export | 8–10 d |
| F3 | CRM inventory | Batches, receive stock, ledger, low stock, **batch search** | 4 d |
| F4 | CRM orders & shipping | Orders table/detail, status actions, invoice/slip/label, retry shipment, COD toggle & rules, refund | 7–8 d |
| F5 | CRM manual returns, reviews, customers | Returns register form, review moderation, customer list/block/COD restrict | 4–5 d |
| F6 | **CRM reselling** | Resellers list/approve, wallet & payouts, reselling orders, **Reselling Invoices section**, hidden-field settings | 5–6 d |
| F7 | CRM marketing, settings, dashboard, notification bell | Coupons, banners, pages, settings, charts, reports | 6–8 d |
| — | **CRM UAT with owner** | Full cycle: product → batch → order → ship → manual return | — |
| F8 | Storefront core | Header/menu, home, listing + filters, search, product page, **batch search box**, SEO | 9–11 d |
| F9 | Cart & checkout | Cart, coupon, address, Razorpay/COD, success/failure pages | 7–8 d |
| F10 | Account, **Reseller panel**, reviews | Auth, orders/tracking/invoice, wishlist, reviews, return-policy + contact, **share links, my reselling orders, wallet, payout request** | 8–10 d |
| F11 | QA & launch | Cross-device QA, accessibility, legal pages, live keys, monitoring, soft launch, training | 6–8 d |

**Frontend total ≈ 11–14 weeks.**

---

## 12. Testing & Quality Gates

- **Every phase:** unit tests for critical logic + integration tests (Supertest) + manual Postman checklist + sign-off note in `docs/phases/`.
- **Critical test sets:** pricing golden cases · stock concurrency · idempotent checkout & webhooks · state machine · permission matrix · **reselling earning/reversal math** · **hidden-field leak tests** (assert reseller/staff responses never contain forbidden keys) · batch lookup returns only public-safe fields.
- **E2E (API):** browse → cart → pay → ship → deliver → earning pending → hold passes → wallet available → payout paid; and the same with a manual return.
- Rules from v1.0 stay: plan-first with Antigravity, one slice at a time, you review every diff, run tests yourself, small Conventional Commits.

---

## 13. Security Highlights (additions)

- Reseller payout details (UPI/bank/PAN) **encrypted at rest**, masked in logs/UI.
- Public batch endpoint rate-limited and whitelist-serialized (return only chosen fields).
- Share tokens are random, unguessable, revocable; no user IDs in URLs.
- Referral self-purchase and duplicate-account abuse checks.
- Wallet is ledger-only (immutable rows, reversals as new rows); payout marking requires `payouts.manage` and is audited.
- All v1.0 §18 controls remain (rotating refresh tokens, Zod everywhere, webhook raw-body verification, helmet, CORS whitelist, dependency audit).

---

## 14. Questions To Close Before Building (Priority Order)

**Reselling (blocks B10)**

1. Profit model: **A fixed commission %** or **B reseller-set margin**? Rates per category?
2. Who receives the **Reselling Invoice** (buyer, reseller, internal) and what is its legal nature (GST/CA)?
3. Exact list of details to hide (use the §4.6 table and mark each row).
4. Reseller onboarding: open signup, admin approval, or invite only? KYC (PAN/bank) needed?
5. Hold period after delivery (suggest 7 days), minimum payout, payout schedule (weekly/monthly), manual payout OK?
6. Does the buyer need an account, or can they order as guest via the share link?
7. COD allowed on reselling orders?

**Batch** 8. What is a batch in his business — one production/purchase lot per product? Who enters it and when? 9. Should customers see the batch on their invoice, and what should the public batch search reveal?

**Returns (manual)** 10. Return window and conditions to publish on the policy page; who pays reverse shipping; refund timing/mode for COD orders.

**Core (from v1.0 §22, still open)** GST details/HSN/inclusive-vs-exclusive · COD limits & fee · Bigship account/sandbox/pickup address · Razorpay KYC · guest checkout & customer login method without SMS (email OTP?) · review moderation mode · hosting budget and account ownership · data to migrate.

---

## 15. Risks & Mitigations (updated)

| Risk | Mitigation |
| --- | --- |
| Reselling rules unclear → rework | Close §14 Q1–7 before B10; keep commission logic isolated in one service |
| Tax treatment of reseller payouts / second invoice | CA sign-off before launch; settings-driven, no hard-coded assumptions |
| Sensitive data leaking to resellers/staff | Server-side serializer + automated leak tests + permission `resellers.view-sensitive` |
| Manual returns drift from system (stock/refund mismatch) | Single Returns Register entry updates stock, refund, reseller wallet together; audit log |
| Bigship API differences | Verify docs/sandbox at B9 start; adapter + manual AWB fallback |
| Overselling / webhook duplicates | Atomic reservation, idempotency, concurrency tests |
| Scope creep | Deferred list (§2.2), phase gating, change log |

---

## 16. Decision Log (v2.0 additions)

| # | Decision | Reason |
| --- | --- | --- |
| D10 | No in-app returns; manual register only | Owner handles returns manually; keeps v1 simple |
| D11 | Reselling is a first-class module with its own wallet ledger and invoice series | Core new business requirement |
| D12 | Field hiding enforced server-side, configurable via settings | Prevent leaks; flexible rules |
| D13 | Batch searchable in CRM and public (safe fields only) | Traceability + customer trust |
| D14 | Drop Redis/BullMQ and risk scoring; in-app notifications first; Web Push later | Simplicity |
| D15 | CommonJS retained | Maximum reuse of old code |

**Next step:** answer §14 Q1–Q9 (even rough answers), then start **B0** with the plan-first prompt: *"Using Engineering Rules and this v2.0 plan, scaffold Phase B0 only. Produce the file list first and wait for approval."*
