# MarketSphere REST API Specification (India E-Commerce)

## 1. General Standards

- **Base URL:** `http://localhost:5000/api/v1`
- **Currency:** Indian Rupee (`INR` / `₹`)
- **Default Tax:** Product-specific GST slabs (`0%`, `5%`, `12%`, `18%`, `28%`), default 18%
- **Authentication:** `Authorization: Bearer <token>` or `HttpOnly` refresh token cookie
- **Response Format:** Standard JSON envelope:

```json
{
  "success": true,
  "message": "Operation successful",
  "data": {},
  "timestamp": "2026-11-10T12:00:00.000Z"
}
```

---

## 2. API Groups Directory

### 2.1 `/api/v1/auth` (Authentication)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Public | Register customer or vendor account (stores SHA-256 hashed refresh token) |
| `POST` | `/api/v1/auth/login` | Public | Authenticate user, issue access token & HttpOnly refresh token cookie |
| `POST` | `/api/v1/auth/refresh-token` | Public | Rotate refresh token, verify against stored hash, detect reuse |
| `POST` | `/api/v1/auth/logout` | Authenticated | Revoke refresh token and clear session cookie |
| `GET` | `/api/v1/auth/me` | Authenticated | Get currently authenticated profile |
| `PUT` | `/api/v1/auth/profile` | Authenticated | Update name, phone, or avatar |
| `GET` | `/api/v1/auth/wishlist` | Authenticated | Get populated customer wishlist |
| `POST` | `/api/v1/auth/wishlist/:productId` | Authenticated | Add/remove item in customer wishlist |

### 2.2 `/api/v1/users` (Users & Addresses)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/users` | Admin | List all registered users with pagination & search |
| `GET` | `/api/v1/users/:id` | Admin | Get user profile details |
| `PUT` | `/api/v1/users/:id/status`| Admin | Update user role (`customer`, `vendor`, `admin`) or active state |
| `GET` | `/api/v1/users/addresses` | Authenticated | Get customer saved Indian addresses |
| `POST` | `/api/v1/users/addresses` | Authenticated | Add new address with PIN code validation |
| `PUT` | `/api/v1/users/addresses/:id`| Authenticated | Update existing address |
| `DELETE`| `/api/v1/users/addresses/:id`| Authenticated | Delete address |

### 2.3 `/api/v1/vendors` (Vendor Stores)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/vendors` | Public | List verified vendor storefronts |
| `GET` | `/api/v1/vendors/:identifier`| Public | Get vendor store details & product listings |
| `PUT` | `/api/v1/vendors/profile` | Vendor/Admin | Update business details, GSTIN, PAN, bank account |
| `GET` | `/api/v1/vendors/dashboard/metrics` | Vendor/Admin | Get vendor sales, order count, payout balances |

### 2.4 `/api/v1/products` (Catalog & Search)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/products` | Public | Filtered catalog search (ES with Mongo fallback) |
| `GET` | `/api/v1/products/featured`| Public | High-speed cached featured products (Redis) |
| `GET` | `/api/v1/products/:identifier`| Public | Single product details with populated category & reviews |
| `POST` | `/api/v1/products` | Vendor/Admin | Create product listing in INR with stock, SKU, and `gstRate` |
| `PUT` | `/api/v1/products/:id` | Vendor/Admin | Update product details (owner vendor only) |
| `DELETE`| `/api/v1/products/:id` | Vendor/Admin | Delete product listing |

### 2.5 `/api/v1/categories` (Taxonomy)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/categories` | Public | List active categories (Redis cached) |
| `GET` | `/api/v1/categories/:slug`| Public | Get category details |
| `POST` | `/api/v1/categories` | Admin | Create category with display order |

### 2.6 `/api/v1/cart` (Persistent Server-Side Cart)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/cart` | Authenticated | Get persistent cart (Redis with MongoDB fallback, refreshed prices & stock) |
| `POST` | `/api/v1/cart/items` | Authenticated | Add product item to customer cart |
| `PUT` | `/api/v1/cart/items/:id` | Authenticated | Update quantity of a cart item |
| `DELETE`| `/api/v1/cart/items/:id` | Authenticated | Remove product item from cart |
| `DELETE`| `/api/v1/cart` | Authenticated | Clear customer cart |
| `POST` | `/api/v1/cart/validate` | Public | Validate anonymous / guest checkout items against stock and tax |

### 2.7 `/api/v1/orders` (Parent & Suborders)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/orders` | Customer | Atomically create parent order (`pending`) and vendor suborders (`pending`) |
| `GET` | `/api/v1/orders/my` | Customer | Get customer order history |
| `GET` | `/api/v1/orders/vendor` | Vendor/Admin | Get vendor-specific assigned suborders |
| `GET` | `/api/v1/orders/:id` | Authenticated | Get full order details (authorized actors only) |
| `PUT` | `/api/v1/orders/vendor/:id/status` | Vendor/Admin | Update suborder status (shipped, delivered, tracking) |
| `GET` | `/api/v1/orders/:id/invoice` | Customer/Admin | Download parent order GST tax invoice (PDF) or selective suborder |
| `GET` | `/api/v1/orders/vendor-orders/:id/invoice` | Vendor/Admin | Download vendor-specific suborder GST tax invoice (PDF) |

#### 2.7.1 Order Idempotency Specification
- **Idempotency Header:** Clients should supply `Idempotency-Key` (or `x-idempotency-key`) with a unique UUID on `POST /api/v1/orders`.
- **24-Hour Replay Guarantee:** Successful checkouts are cached in MongoDB with a 24-hour TTL. Replays of identical requests within 24 hours return the cached HTTP 201 response with zero additional stock decrements or order creations.
- **Post-Expiration Behavior:** After 24 hours, the idempotency record expires and is evicted via the MongoDB TTL index (`expiresAt: 1`, `expireAfterSeconds: 0`), and mutation markers are pruned by the recurring 6-hour scheduler. Subsequent requests with the same key are treated as fresh checkout requests.
- **HTTP 409 Conflict Responses:**
  - **Payload Mismatch:** Submitting an existing `Idempotency-Key` with a different request payload body returns `HTTP 409 Conflict` (`Conflict: Idempotency-Key has already been used with a different request payload.`).
  - **Active Concurrency Lock:** Concurrent requests with the same key while processing is in-progress return `HTTP 409 Conflict` (`An order with this Idempotency-Key is currently being processed. Please retry shortly.`).
  - **Interrupted / Reconciliation Required:** Transactions interrupted mid-flight on standalone MongoDB return `HTTP 409 Conflict` (`Order execution was interrupted and requires manual reconciliation. Automatic retry is blocked.`). These records are permanently protected from TTL expiration until manual resolution.

#### 2.7.2 PDF Tax Invoice Specification
- **Endpoints & Access Control:**
  - `GET /api/v1/orders/:id/invoice`: Allows the purchasing customer (`order.customerId === req.user._id`) or `admin` to stream the official Tax Invoice PDF. Cross-customer access attempts return `HTTP 403 Forbidden` (`{"success": false, "message": "Not authorized to access invoice for this order"}`).
  - `GET /api/v1/orders/vendor-orders/:id/invoice`: Allows the fulfilling vendor (`vendorOrder.vendorId === req.user._id`) or `admin` to stream the merchant suborder Tax Invoice PDF. Cross-vendor access attempts return `HTTP 403 Forbidden` (`{"success": false, "message": "Not authorized to access invoice for another vendor"}`).
- **Query Parameter (`?suborderId=<id>`):**
  - When accessing `GET /api/v1/orders/:id/invoice`, the caller may optionally supply `?suborderId=<vendorOrderObjectId>` to selectively retrieve an individual vendor suborder invoice instead of the full parent order document.
- **Multi-Vendor Invoice Page Splitting:**
  - When a customer downloads the complete invoice for a multi-vendor order, the backend dynamically queries all associated `VendorOrder` suborders and generates a single multi-page PDF document.
  - Each page represents an independent, legal seller invoice containing that merchant's specific registered legal name, business address, GSTIN, PAN, items sold, and tax breakdown.
- **Response Headers & Binary Format:**
  - `Content-Type: application/pdf`
  - `Content-Disposition: attachment; filename="Invoice-<vendorOrderNumber>.pdf"` (single suborder) or `attachment; filename="Invoices-Order-<orderNumber>.pdf"` (multi-vendor parent order).
  - The streamed binary begins with `%PDF-` magic bytes and concludes with a valid PDF cross-reference table and `%%EOF` marker.

### 2.8 `/api/v1/payments` (Razorpay Transactions & Webhook)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/payments/create-order` | Customer | Generate Razorpay order ID in paise |
| `POST` | `/api/v1/payments/verify` | Customer | Verify HMAC SHA256 payment signature and transition order to `paid` |
| `GET` | `/api/v1/payments/order/:orderId` | Authenticated | Retrieve transaction receipt & status |
| `POST` | `/api/v1/payments/webhook` | Webhook (Public) | Verify raw-body HMAC signature, handle `payment.captured` & `payment.failed` |

#### 2.8.1 Payment Authorization & Gateway Pairing Security
- **Tenant Ownership Enforcement:**
  - `POST /api/v1/payments/create-order`, `POST /api/v1/payments/verify`, and `GET /api/v1/payments/order/:orderId` strictly enforce customer ownership (`order.customerId === req.user._id` or `req.user.role === 'admin'`). Cross-customer operations return `HTTP 403 Forbidden`.
- **Server-Side Amount Calculation:**
  - Client-supplied `amount` and `currency` are completely ignored. Payment amounts are derived directly from the database order record (`Math.round(order.totalPrice * 100)` in paise, INR).
  - Payment initiation is blocked on already paid (`HTTP 400`) or cancelled (`HTTP 400`) orders.
- **Strict Gateway Order Pairing:**
  - `POST /api/v1/payments/verify` enforces exact byte-level matching between the submitted `razorpayOrderId` and `storedPayment.razorpayOrderId`. Attempts to confirm an order using a gateway receipt from a different order are rejected with `HTTP 400 Bad Request` (`Payment gateway order pairing mismatch...`).
- **Idempotency & Safe State Consistency:**
  - On replica sets, transitions for parent `Order`, child `VendorOrder` records, and platform `Commission` records are executed inside an atomic MongoDB transaction.
  - On standalone MongoDB, a safe, self-healing sequence is enforced. Interrupted transitions are automatically detected and completed on subsequent verify calls or webhooks. Duplicate calls return cached captured state without repeating financial transitions.
  - Platform commissions are never marked `eligible_for_payout` until parent order payment is confirmed.

### 2.9 `/api/v1/upload` (Product Media & AWS S3)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/upload/image` | Vendor/Admin | Upload image (max 5MB, JPEG/PNG/WEBP/GIF) to S3 (or mock in dev) |
| `POST` | `/api/v1/upload/presign` | Vendor/Admin | Generate presigned upload URL for direct browser-to-S3 upload |
| `DELETE`| `/api/v1/upload/image` | Vendor/Admin | Safely delete image by key or URL from S3 |

### 2.10 `/api/v1/reviews` (Ratings)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/reviews/product/:productId` | Public | List reviews for product |
| `POST` | `/api/v1/reviews/product/:productId` | Customer | Post customer review (1 per customer per product) |
| `DELETE`| `/api/v1/reviews/:id` | Customer/Admin| Delete review and update average rating |

### 2.11 `/api/v1/coupons` (Discounts)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/coupons` | Public | List currently active promo coupons |
| `POST` | `/api/v1/coupons/validate` | Public | Validate coupon code against subtotal |
| `POST` | `/api/v1/coupons` | Vendor/Admin | Create new discount coupon |

### 2.12 `/api/v1/admin` (Platform Moderation & Console)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/dashboard` | Admin | Total GMV, platform commission, user & order metrics |
| `GET` | `/api/v1/admin/commissions`| Admin | Breakdown of vendor commission earnings |
| `GET` | `/api/v1/admin/orders` | Admin | Comprehensive list of platform parent orders & fulfillment state |
| `PUT` | `/api/v1/admin/vendors/:id/status` | Admin | Approve, verify or suspend vendor |

### 2.13 `/api/v1/notifications` (In-App Messaging)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/notifications` | Authenticated | Get unread and recent in-app notifications |
| `PUT` | `/api/v1/notifications/:id/read` | Authenticated | Mark notification as read |
| `PUT` | `/api/v1/notifications/read-all` | Authenticated | Mark all notifications as read |
