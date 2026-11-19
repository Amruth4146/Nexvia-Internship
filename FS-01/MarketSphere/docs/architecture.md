# MarketSphere System Architecture (Indian E-Commerce Specification)

## 1. System Overview

**MarketSphere** is an enterprise-grade multi-vendor e-commerce marketplace platform tailored for the Indian retail ecosystem. The platform enforces strict Role-Based Access Control (RBAC) across three primary actors:
- **`customer`**: Browses catalog, adds products to persistent cart/wishlist, places parent orders, tracks delivery, and writes verified reviews.
- **`vendor`**: Manages GST-registered store profile, lists products in INR (₹) with specific GST rates, fulfills vendor-specific suborders, and tracks payouts.
- **`admin`**: Moderates platform accounts, oversees multi-vendor commissions, approves vendor stores, monitors orders, and accesses the Admin Console.

The platform architecture implements a parent-order / vendor-suborder split, ensuring multi-merchant transactions are cleanly segmented into separate fulfillment streams with automated platform commission, GST calculations, and atomic database operations.

---

## 2. High-Level Architecture Diagram

```
+-------------------------------------------------------------------+
|                        Client Layer                               |
|            (React 19 + Vite SPA, Tailwind CSS / Custom CSS)        |
|  - Role-Aware Navigation (Customer / Vendor / Admin)              |
|  - Admin Console UI & Vendor Portal                               |
|  - Currency Formatter (INR ₹) & Persistent Cart State             |
+---------------------------------+---------------------------------+
                                  |
                                  | HTTPS / REST JSON APIs + Cookies
                                  v
+-------------------------------------------------------------------+
|                       API Gateway / Server                        |
|            (Node.js + Express.js - Modular Monolith)              |
|  - Auth Middleware (JWT Bearer Token + DB Role Verification)      |
|  - HttpOnly Cookie Refresh Token & SHA-256 Hashing Verification   |
|  - Request Validation (Express-Validator)                         |
|  - Centralized Error & Exception Handler                          |
|  - Currency & Product-Specific GST Engine (0%, 5%, 12%, 18%, 28%) |
+-----------+---------------------+---------------------+-----------+
            |                     |                     |
            v                     v                     v
+---------------------+ +-----------------+ +-----------------------+
|   Database Layer    | |   Cache Layer   | |     Search Layer      |
|    (MongoDB 7.0)    | |  (Redis 7.0)    | | (Elasticsearch 8.17)  |
| - Users, Vendors    | | - Persistent    | | - Fuzzy Search        |
| - Products, Carts   | |   Cart Store    | | - Catalog Aggregation |
| - Orders, Suborders | | - Featured Read | | - Fallback to MongoDB |
| - Payments, Coupons | |   Cache         | |                       |
| - Commissions       | |                 | |                       |
+---------------------+ +-----------------+ +-----------------------+
            |                                           |
            v                                           v
+-----------------------------------+   +---------------------------+
|          Payment Gateway          |   |       Cloud Storage       |
|    (Razorpay - UPI/Cards/Net)     |   |    (AWS S3 - ap-south-1)  |
|  - HMAC SHA256 Signature Verify   |   |  - S3 SDK Client & Multer |
|  - Idempotent Webhook Listener    |   |  - Presigned Upload URLs  |
+-----------------------------------+   +---------------------------+
```

---

## 3. Technology Stack & External Services Status

| Layer | Service / Technology | Status | Integration Scope |
| :--- | :--- | :--- | :--- |
| **Runtime & Framework** | Node.js v24 + Express 4.21 | **Active Integration** | Full server implementation with 13 modular route groups & cookie-parser |
| **Client** | React 19 + Vite | **Active Integration** | Full SPA with Auth, Persistent Cart, Catalog, Checkout, Vendor Portal & Admin Console |
| **Primary Database** | MongoDB 7.0 + Mongoose 8.10 | **Active Integration** | 13 dedicated models with indexes, hooks, and transaction sessions |
| **Caching & Cart Store** | Redis 7.0 (Alpine) + ioredis | **Active Integration** | Persistent cart storage & featured catalog read cache with durable MongoDB fallback |
| **Search Engine** | Elasticsearch 8.17.0 | **Active Integration** | `products_index` mapping, fuzzy multi-match query with Mongo fallback |
| **Payment Gateway** | Razorpay SDK & Webhook | **Active Integration** | Order creation, HMAC SHA256 signature verification, and raw-body webhook listener (mock mode in dev without keys) |
| **Object Storage** | AWS S3 (`@aws-sdk/client-s3`) | **Active Integration** | Mumbai region S3 client, presigned URL generator, file validator & mock mode in dev |

---

## 4. Multi-Vendor Suborder & Payment Lifecycle Architecture

```
[Customer Checkout]
        |
        v
[createOrder in Session / Transaction]
        |-- Validates and Atomically Decrements Product Stock ($gte)
        |-- Calculates Item Tax per Product GST Rate (0%, 5%, 12%, 18%, 28%)
        |-- Creates Parent Order (paymentStatus: 'pending', paidAt: null)
        |-- Creates Child VendorOrders (paymentStatus: 'pending')
        |-- Creates Commission Records (status: 'pending')
        |
        +-----> [Razorpay Gateway Initiation (Paise conversion)]
                     |
                     v
        +------------+------------+
        |                         |
[verifyPayment Endpoint]  [Razorpay Webhook (payment.captured)]
        |                         |
        +------------+------------+
                     |
                     v
        [Gateway Signature Verified]
                     |
                     v
   [Atomic Idempotent Update]
   - Parent Order: paymentStatus = 'paid', paidAt = now
   - Child VendorOrders: paymentStatus = 'paid'
   - Commission Records: status = 'eligible_for_payout'
```

---

## 5. Security & Authentication Architecture

1. **Role Enforcement:** Authenticated roles (`customer`, `vendor`, `admin`) are strictly verified from the database record during token verification. Client-supplied role claims are never trusted.
2. **Token Strategy:**
   - **Access Token:** Short-lived JWT (15 minutes) signed via `HS256`.
   - **Refresh Token:** Long-lived JWT (7 days) hashed using SHA-256 before storage on backend User document.
   - **HttpOnly Cookies:** Refresh tokens are delivered via `HttpOnly`, `SameSite`, `Secure` cookies with CORS credentials enabled.
   - **Token Rotation & Reuse Detection:** Rotates refresh token upon refresh; if a reused or revoked token is presented, all user sessions are immediately invalidated.
   - **Revocation:** Explicit logout revokes refresh token on backend and clears the browser cookie.
3. **Password Security:** Salt rounds 10+ using `bcryptjs` with pre-save hashing.
4. **Transport Hardening:** `helmet` security headers, CORS origin whitelisting, and parameter validation.

---

## 6. GST Tax Invoicing & Statutory Compliance Notes

The platform architecture implements server-side PDF tax invoice generation via PDFKit (`server/src/services/invoiceService.js`), calculating applicable GST based on stored order snapshots.

### 6.1 Tax Allocation Architecture
- **Intrastate Supply (`seller.address.state === shippingAddress.state`):** Allocated 50% Central GST (CGST) and 50% State GST (SGST).
- **Interstate Supply (`seller.address.state !== shippingAddress.state`):** Allocated 100% Integrated GST (IGST).
- **Snapshot Immutability:** Financial snapshots are captured at the moment of checkout on `VendorOrder` and `Order` documents, ensuring subsequent catalog price or tax slab changes never alter historical invoices.

### 6.2 Known Production Compliance Limitations
For production deployments requiring statutory GST audit compliance in India:
1. **HSN/SAC Classification:** The catalog tracks SKU identifiers. An `hsnCode` field must be added to the product schema to satisfy CGST Rule 46(g) requirements for commercial tax returns.
2. **Sequential Invoice Numbering:** Current invoice identifiers (`INV-${vendorOrderNumber}`) exceed the 16-character statutory ceiling established under CGST Rule 46(b). Commercial operations require a dedicated financial-year sequential numbering ledger.
3. **Unregistered Merchant Document Type:** Invoices for sellers without registered GSTINs currently fall back to `Unregistered / Exempt` under the title "TAX INVOICE". Formal tax compliance requires issuing a "Bill of Supply" or delivery challan when the merchant is exempt or unregistered.
4. **Electronic Generation Status:** Invoices are server-side generated documents; they do not carry an asymmetric cryptographic X.509 PKI digital signature.
