# MarketSphere

MarketSphere is an enterprise-grade, scalable multi-vendor e-commerce marketplace platform tailored for the Indian retail ecosystem. Built with React 19, Node.js, Express, MongoDB, Redis, and Elasticsearch, the platform enforces strict Role-Based Access Control (RBAC), multi-merchant suborder splitting, Indian GST tax calculations, persistent cart synchronization, stock-safe checkout with idempotency protection, Razorpay payment verification, and server-side PDF tax invoice generation.

---

## 🌟 Major Features

### 1. Multi-Vendor Suborder Splitting & Fulfillment
- **Parent-Order / Child-Suborder Model:** A single customer checkout spanning products from multiple independent merchants is atomically partitioned into individual `VendorOrder` suborders.
- **Independent Merchant Streams:** Each merchant fulfills, ships, and tracks only their own suborder items without cross-vendor visibility.
- **Automated Platform Commission:** Configurable commission rates per vendor with automated deduction and 18% GST calculation on platform service fees.

### 2. Role-Based Portals & Access Control (RBAC)
- **Customer:** Catalog discovery, category filtering, fuzzy search, persistent cart across sessions, saved delivery address book, Razorpay UPI/Card/Netbanking checkout, real-time order tracking, and PDF tax invoice downloads.
- **Vendor:** Dedicated Vendor Portal (`/vendor/dashboard`), GSTIN and PAN profile management, product listing CRUD with configurable GST slabs and SKU validation, order fulfillment state machine (`placed` -> `processing` -> `shipped` -> `delivered`), and suborder invoice downloads.
- **Admin:** Platform Admin Console (`/admin/dashboard`), platform-wide metrics, merchant store verification and approval, user role management (`customer`, `vendor`, `admin`), commission audit logs, and global invoice governance.

### 3. Indian GST Tax Calculation Engine
- **Product-Specific Tax Slabs:** Full support for standard Indian GST slabs: `0%`, `5%`, `12%`, `18%`, and `28%`.
- **Intrastate vs. Interstate Supply:**
  - *Intrastate (`Seller State === Buyer Shipping State`):* Tax amount is bifurcated 50/50 into **Central GST (CGST)** and **State GST (SGST)**.
  - *Interstate (`Seller State !== Buyer Shipping State`):* Tax amount is allocated 100% to **Integrated GST (IGST)**.
- **Stored Financial Snapshots:** All tax calculations, item prices, and commission rates are captured as immutable snapshots on the order record at checkout, safeguarding historical records against catalog price changes.

### 4. Persistent Cart & Stock Protection
- **Dual-Layer Cart Store:** Active carts are stored in Redis for sub-millisecond retrieval and persisted in MongoDB for durable session recovery.
- **Atomic Stock Reservation:** Concurrency-safe stock reservation using conditional `$gte` guards prevents overselling during high-concurrency checkouts.
- **24-Hour Idempotency Guarantee:** Checkout endpoints enforce unique idempotency keys to prevent duplicate payments, duplicate orders, or replay attacks.

### 5. Razorpay Payment Gateway Integration
- **Secure Server-Side Flow:** Orders are initialized with `paymentStatus: 'pending'` and transition to `'paid'` only after cryptographic HMAC SHA-256 signature verification.
- **Strict Gateway Order Pairing:** Blocks confirmation attempts with mismatched gateway orders.
- **Webhook Audit Handler:** Raw-body signature verification handles asynchronous `payment.captured` and `payment.failed` gateway events.

### 6. Server-Side PDF Tax Invoice Generation
- **Native PDFKit Generation:** Generates downloadable, printable tax invoices on-the-fly without headless browsers or external services.
- **Multi-Vendor Invoicing:** Parent order downloads bundle separate, seller-specific invoice pages for each vendor suborder, displaying distinct seller GSTINs, addresses, line items, and tax breakdowns.
- **Direct Downloads:** Integrated across the frontend on the Order Success page, Customer Order History, and the Vendor Dashboard.

---

## 📁 Project Directory Structure

```
MarketSphere/
├── client/                     # Frontend Application (React 19 + Vite SPA)
│   ├── src/
│   │   ├── components/         # Reusable UI components & navigation
│   │   ├── pages/              # Route view pages (Customer, Vendor, Admin)
│   │   ├── context/            # Global state (AuthContext, CartContext)
│   │   ├── services/           # Modular API clients (api, order, payment, user, vendor)
│   │   └── utils/              # Currency (INR) & date helpers
│   ├── .env.example            # Client environment template
│   └── package.json            # Client dependencies and build scripts
│
├── server/                     # Backend API Server (Node.js + Express)
│   ├── src/
│   │   ├── config/             # DB, Redis, Elasticsearch, Razorpay & Env config
│   │   ├── controllers/        # Request handlers (Auth, Cart, Order, Payment, Upload, Admin)
│   │   ├── models/             # 13 Mongoose schemas + IdempotencyKey model
│   │   ├── routes/             # REST API routers & invoice download routes
│   │   ├── middleware/         # Auth, RBAC, input validation & error handling
│   │   ├── services/           # Invoice PDF generation engine, AWS S3 storage
│   │   └── utils/              # Token generation, seed scripts
│   ├── test_frontend_backend_e2e.mjs  # Automated E2E integration test suite
│   ├── test_pdf_invoice.mjs    # 10-scenario PDF tax invoice test suite
│   ├── test-audit.js           # Backend architecture audit test script
│   ├── .env.example            # Server environment template
│   └── package.json            # Server dependencies and scripts
│
├── docs/                       # Technical Documentation
│   ├── architecture.md         # System architecture & transaction lifecycle
│   ├── database-schema.md      # MongoDB, Redis, & Elasticsearch schemas
│   ├── api-documentation.md    # REST API endpoints, idempotency, & invoice specs
│   └── testing-report.md       # Audit checklist & test verification records
│
├── README.md                   # Project documentation & setup guide
├── .gitignore                  # Git ignore rules
└── docker-compose.yml          # Container orchestration (MongoDB, Redis, Elasticsearch)
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18.x or later; v24.x recommended)
- [npm](https://www.npmjs.com/) (v9.x or later)
- [Docker](https://www.docker.com/) & Docker Compose

---

### 1. Start Infrastructure Services

Spin up MongoDB, Redis, and Elasticsearch using Docker Compose:

```bash
docker-compose up -d
```

To verify the services are running:
```bash
docker-compose ps
```

Services exposed:
- **MongoDB**: `localhost:27017`
- **Redis**: `localhost:6379`
- **Elasticsearch**: `localhost:9200`

---

### 2. Configure Environment Variables

#### Client Configuration:
```bash
cd client
cp .env.example .env
```
Default client configuration (`client/.env`):
```env
VITE_API_BASE_URL=http://localhost:5000/api/v1
VITE_APP_NAME=MarketSphere
VITE_APP_ENV=development
```

#### Server Configuration:
```bash
cd server
cp .env.example .env
```
Key server configuration options (`server/.env`):
```env
PORT=5000
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:5173
MONGO_URI=mongodb://localhost:27017/marketsphere
REDIS_HOST=localhost
REDIS_PORT=6379
JWT_SECRET=your_super_secret_jwt_access_key_min_32_chars
JWT_REFRESH_SECRET=your_super_secret_jwt_refresh_key_min_32_chars
RAZORPAY_KEY_ID=rzp_test_your_key_id_here
RAZORPAY_KEY_SECRET=your_razorpay_secret_here
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret_here
```

---

### 3. Install Dependencies

Install dependencies for both the backend and frontend:

```bash
# Server dependencies
npm install --prefix server

# Client dependencies
npm install --prefix client
```

---

### 4. Seed Development Database

Populate the database with initial categories, products, and development test accounts:

```bash
npm run seed --prefix server
```

The database seeder provisions baseline development accounts for testing:
- **Customer Account:** `alex@example.com` (Orders, cart, address book)
- **Tech Vendor Account:** `vendor@apextech.com` (Apex Electronics Pvt Ltd, Maharashtra)
- **Style Vendor Account:** `vendor@urbanthreads.com` (Urban Threads Studio, Karnataka)
- **Admin Account:** `admin@marketsphere.com` (Platform Admin Console)
- *Note:* The seed script configures local development accounts with a standard local development password (`Password123!`). For production deployments, all passwords must be changed and managed securely.

---

### 5. Run the Application

#### Start Backend API Server:
```bash
# Development mode with auto-reload:
npm run dev --prefix server

# Or standard start:
npm start --prefix server
```
The server will start on `http://localhost:5000` (Health check: `http://localhost:5000/health`).

#### Start Frontend Client:
```bash
npm run dev --prefix client
```
The React + Vite client will start on `http://localhost:5173`.

---

## 🧪 Testing & Verification

MarketSphere includes comprehensive automated test suites covering backend architecture, end-to-end integration, and PDF invoice generation.

### 1. Backend Architecture & Security Audit
Validates 13 Mongoose models, RBAC gates, JWT hashing, Bcrypt cost factor, Razorpay HMAC signatures, and monetary calculations:
```bash
npm test --prefix server
```

### 2. PDF Tax Invoice 10-Scenario Test Suite
Executes end-to-end invoice generation, customer access control (403), vendor access control (403), admin governance, multi-vendor page splitting, and PDF binary validation against an isolated test database:
```bash
node server/test_pdf_invoice.mjs
```

### 3. Frontend-Backend E2E Integration Suite
Validates 9 end-to-end HTTP integration workflows from customer registration, cart sync, checkout, and order history:
```bash
node server/test_frontend_backend_e2e.mjs
```

### 4. Frontend Production Build
Validates Vite production asset bundling, JSX syntax, and CSS bundling:
```bash
npm run build --prefix client
```

---

## ⚖️ GST Statutory & Compliance Notes

The following technical notes document current platform implementation details and statutory considerations for production tax filings under the Indian Goods and Services Tax (CGST/SGST/IGST Act, 2017):

1. **HSN/SAC Code Support:** The catalog currently records product SKU identifiers. Under CGST Rule 46(g), businesses above statutory turnover thresholds must print 4-digit or 6-digit Harmonized System of Nomenclature (HSN) codes on tax invoices. An `hsnCode` field should be added to the product schema prior to commercial tax filing integration.
2. **Invoice Numbering Length:** Current invoice numbers follow the format `INV-${vendorOrderNumber}` (e.g. `INV-MS-121142-597-V1`), which is 20 characters in length. CGST Rule 46(b) specifies that consecutive invoice serial numbers shall not exceed **16 characters** for a financial year. Commercial implementations should utilize a dedicated fiscal invoice sequence ledger.
3. **Unregistered Merchants:** Artisans and unregistered sellers are marked on invoices as `Unregistered / Exempt` without fabricating legal numbers. In a formal GST compliance workflow, unregistered merchants or composition taxpayers issue a "Bill of Supply" or delivery challan rather than a document titled "Tax Invoice".
4. **Electronic Document Status:** Generated PDF invoices are electronically generated documents issued on behalf of the registered merchant seller. They are not cryptographically signed with an X.509 PKI digital signature certificate token.
5. **Place of Supply:** Accurately extracted from the customer's shipping address state and used to determine Intrastate (CGST+SGST) vs. Interstate (IGST) tax allocation in accordance with Sections 7 and 8 of the IGST Act, 2017.

---

## 📖 Technical Documentation

- [System Architecture](docs/architecture.md)
- [Database Schema & Data Models](docs/database-schema.md)
- [REST API Documentation](docs/api-documentation.md)
- [Testing & Verification Report](docs/testing-report.md)

---

## 🔒 Security & Best Practices

- **Strict Secret Isolation:** `.env` files and local database stores are excluded from version control via `.gitignore`.
- **Security Headers:** Configured via `helmet` with strict content-security policies.
- **State Guarding:** Idempotency keys protect against double deductions and race conditions.
- **CORS Policies:** Configured between client origin and Express API server.
