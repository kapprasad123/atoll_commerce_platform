# AtollHub — Multi-Shop E-Commerce, POS, FEFO Inventory & Customer Credit Book Platform

A production-ready, multi-tenant SaaS e-commerce marketplace, Point of Sale (POS), FEFO Expiry Management, Multi-Currency Accounting, and Monthly Customer Credit Book platform designed for island retail networks, supermarkets, electronics stores, and pharmacies.

---

## 1. Key Capabilities

1. **Three Role Portals with Strict Multi-Tenant Isolation (`shop_id`)**:
   - **Master Admin Panel**: Approve/activate/suspend/reject shops (only Master Admin can activate a shop), create shop owner accounts directly, reset passwords, view platform-wide metrics, manage global categories, configure exchange rates, and inspect audit logs.
   - **Shop Owner & Employee RBAC Dashboard**: Independent per-shop dashboard with KPI cards, custom date-range filters, Recharts/Chart.js analytics, POS terminal, Product & Variant management, Multi-Currency pricing, FEFO Expiry Management, 14-Step Order Management, Manual Payment Slip Verification, Customer Credit Book (Monthly Salary Credit), Supplier & Purchase Order receiving, Expenses & P&L statement, Loyalty & Coupons, and Employee Role Permissions (`SHOP_OWNER`, `MANAGER`, `CASHIER`, `INVENTORY_STAFF`, `DELIVERY_STAFF`).
   - **Public Customer Shopping Marketplace**: Mobile-first responsive storefront with per-shop isolated shopping carts, multi-currency switcher (`MVR`, `INR`, `USD`, `EUR`, `GBP`), expiring-soon clearance offers, guest & registered checkout, payment slip upload, and WhatsApp / Viber Click-to-Chat integration.

2. **Immutable Multi-Currency Financial Engine**:
   - Supports **MVR (Rf)**, **INR (₹)**, **USD ($)**, **EUR (€)**, **GBP (£)**, plus configurable currencies.
   - Supports explicit per-product multi-currency pricing (e.g., *Rice 5kg: MVR 85.00 | INR 450.00 | USD 5.50*) or transparent conversion using configurable exchange rates.
   - Stores `transaction_currency`, `shop_base_currency`, and `exchange_rate_used` on every historical order, sale, credit entry, and payment so historical transactions never mutate when exchange rates update.

3. **FEFO (First Expired, First Out) Batch & Expiry Engine**:
   - Monitors 6 expiry buckets: **Expired**, **≤ 7 days**, **≤ 15 days**, **≤ 30 days**, **≤ 60 days**, and **≤ 90 days** with visual color indicators (**RED**, **ORANGE**, **YELLOW**, **GREEN**).
   - Automatically deducts stock from the earliest valid non-expired batch (`FEFO`) and blocks expired batches from being sold or delivered.

4. **Customer Credit Book / Monthly Salary Payment Module**:
   - Tracks customer profiles, national ID reference, employer/salary date, credit limits, borrowed items, partial/full/monthly salary payments, audit adjustments, and reversal entries.
   - Deducts stock immediately when items are borrowed on credit while keeping credit sales strictly separate from cash received until repayments are recorded.

---

## 2. Project Structure

```text
atoll_commerce_platform/
├── .env.example                      # Environment variable template (no production secrets)
├── .gitignore                        # Git ignore rules
├── docker-compose.yml                # One-command PostgreSQL + Backend + Frontend stack
├── package.json                      # Root workspace scripts
├── database/
│   ├── migrations/
│   │   └── 001_initial_schema.sql    # 34-table relational PostgreSQL schema
│   └── seeds/
│       └── 001_demo_seed.sql         # Realistic demo data (Admin, 3 Active + 1 Pending Shop, 32+ Products)
├── backend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── config/db.ts              # PostgreSQL pool & ACID transaction helper
│       ├── middleware/authAndTenant.ts # JWT auth, RBAC & strict shop_id tenant isolation
│       ├── services/currencyAndExpiryEngine.ts # Multi-currency & FEFO batch engine
│       ├── scripts/
│       │   ├── migrate.ts            # Database migration runner
│       │   ├── seed.ts               # Demo data seeder
│       │   └── setupMasterAdmin.ts   # Secure initial Master Admin bootstrap CLI
│       └── server.ts                 # Express + TypeScript REST API
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── src/                          # React + TypeScript + Tailwind CSS source
├── interactive-preview/
│   └── atoll_commerce_platform.html  # Standalone full-featured browser build
├── tests/
│   └── run_verification_suite.py     # Automated verification & business rule test suite
└── docs/
    ├── API_DOCUMENTATION.md
    ├── DEPLOYMENT_AND_GITHUB_GUIDE.md
    ├── SECURITY_GUIDE.md
    └── TESTING_GUIDE.md
```

---

## 3. Demo Login Credentials (For Testing & Evaluation)

| Role | Name / Shop | Email / Username | Demo Password | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Master Admin** | Ibrahim Rasheed (Platform Admin) | `admin@atollhub.mv` | `Admin@Atoll2026!` | Active Super Admin |
| **Shop Owner 1** | Hassan Zareer — *Malé Fresh Mart* (MVR) | `owner@malefresh.mv` | `Owner@Shop2026!` | **Active** |
| **Shop Owner 2** | Mariyam Niuma — *Hulhumalé Tech Hub* (USD) | `owner@hulhumaletech.mv` | `Owner@Shop2026!` | **Active** |
| **Shop Owner 3** | Dr. Ali Shareef — *Addu Wellness Pharmacy* (MVR) | `owner@adduwellness.mv` | `Owner@Shop2026!` | **Active** |
| **Shop Owner 4** | Fathimath Shifana — *Baa Coral Provisions* (MVR) | `owner@baacoralmart.mv` | `Owner@Shop2026!` | **Pending Approval** |
| **Shop Cashier** | Ahmed Nimal — *Malé Fresh Mart Cashier* | `cashier@malefresh.mv` | `Staff@Shop2026!` | Active (POS/Orders only) |
| **Inventory Staff** | Aminath Leena — *Malé Fresh Mart Inventory* | `inventory@malefresh.mv` | `Staff@Shop2026!` | Active (No P&L access) |
| **Customer** | Ahmed Mausoom (Salary Credit & Online Buyer) | `ahmed.mausoom@example.mv` | `Customer@2026!` | Active |

---

## 4. Quick Start & Local Installation

### Prerequisites
- **Node.js** v18+ and **npm** v9+
- **PostgreSQL** v14+ (or Docker Desktop)

### Step-by-Step Setup
1. **Extract the ZIP and open in VS Code or Google Antigravity**:
   ```bash
   unzip atoll_commerce_platform_source.zip
   cd atoll_commerce_platform
   ```
2. **Configure Environment Variables**:
   ```bash
   cp .env.example .env
   cp .env.example backend/.env
   # Edit backend/.env with your PostgreSQL DATABASE_URL and generated JWT secrets
   ```
3. **Install Dependencies**:
   ```bash
   npm run install:all
   ```
4. **Run Database Migrations & Load Demo Seed Data**:
   ```bash
   npm run db:migrate
   npm run db:seed
   ```
5. **Bootstrap Custom Master Admin (Optional for Production)**:
   ```bash
   INITIAL_MASTER_ADMIN_EMAIL="admin@yourdomain.com" INITIAL_MASTER_ADMIN_PASSWORD="YourStrongPassword123!" npm run setup:admin
   ```
6. **Start Development Servers**:
   ```bash
   npm run dev
   ```
   - Backend API: `http://localhost:4000/api`
   - Frontend Web App: `http://localhost:5173`
   - Instant Standalone App: Open `interactive-preview/atoll_commerce_platform.html` directly in any browser.
