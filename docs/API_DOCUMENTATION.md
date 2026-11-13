# API Documentation — AtollHub Multi-Shop Platform

All protected endpoints require an `Authorization: Bearer <JWT_ACCESS_TOKEN>` header. All `/api/shop/*` endpoints enforce `requireActiveShopTenant`, ensuring that:
1. Only shops with status `ACTIVE` can access management APIs.
2. Every database query is strictly scoped to `req.tenantShopId` (`shop_id`).

## 1. Authentication (`/api/auth`)
- `POST /api/auth/login` — Authenticate as Master Admin, Shop Owner, Employee, or Customer.
- `POST /api/auth/register-shop` — Submit a public shop registration request (creates shop in `PENDING` state awaiting Master Admin activation).
- `POST /api/auth/register-customer` — Register an optional customer account for order tracking and loyalty points.

## 2. Master Admin Endpoints (`/api/admin`)
- `GET /api/admin/overview` — Platform-wide KPIs (total shops by status, total products, orders, sales in MVR, customers).
- `GET /api/admin/shops` — Search and filter shops by name, owner, contact phone, island/city, or status (`PENDING`, `ACTIVE`, `SUSPENDED`, `REJECTED`).
- `POST /api/admin/shops` — Directly create a new Shop Owner and Shop account (optionally pre-activated by Master Admin).
- `PATCH /api/admin/shops/:shopId/status` — Approve (`ACTIVE`), suspend (`SUSPENDED`), or reject (`REJECTED`) a shop account.
- `POST /api/admin/shops/:shopId/reset-password` — Reset a shop owner's password and force rotation on next login.
- `GET /api/admin/currencies` & `PUT /api/admin/currencies/rates` — Manage supported currencies (`MVR`, `INR`, `USD`, `EUR`, `GBP`) and exchange rates.
- `GET /api/admin/audit-logs` — Inspect immutable platform and tenant audit logs.

## 3. Shop Management Endpoints (`/api/shop`)
- `GET /api/shop/dashboard` — Shop KPIs (Today/Week/Month/Year sales, order counts, low-stock, expiring products, out-of-stock, customer credit outstanding, expenses, gross profit, net profit) + custom date range charts.
- `GET /api/shop/products` / `POST /api/shop/products` / `PUT /api/shop/products/:id` — Full product CRUD with variants, multi-currency price map, batch/expiry dates, barcode & SKU.
- `POST /api/shop/products/bulk-csv` — Bulk CSV/Excel product import and export.
- `GET /api/shop/expiry-monitor` — Expiry dashboard grouped into Expired, ≤7d, ≤15d, ≤30d, ≤60d, ≤90d buckets.
- `POST /api/shop/expiry-monitor/:batchId/clearance` — Apply clearance discount percentage or quarantine/write-off expired stock.
- `GET /api/shop/orders` & `PATCH /api/shop/orders/:orderId/status` — Manage 14-step order workflow and pre-confirmation order editing.
- `POST /api/shop/orders/:orderId/verify-payment` — Manually verify or reject customer-uploaded payment slips.
- `GET /api/shop/credit-book` & `POST /api/shop/credit-book/transactions` — Issue products on monthly credit (with immediate FEFO stock deduction).
- `POST /api/shop/credit-book/payments` — Record full, partial, or monthly salary credit repayments and generate printable statements.
- `POST /api/shop/pos/sale` — Record cash, bank transfer, QR pay, or credit sales with printable invoice generation.
- `GET /api/shop/reports/financial` — Detailed P&L (`Gross Profit = Sales Revenue - COGS`, `Net Profit = Gross Profit - Operating Expenses`), separating Cash Received from Credit Given and Credit Collected.
- `GET /api/shop/suppliers` & `POST /api/shop/purchase-orders` — Supplier management and Purchase Order batch receiving.
- `GET /api/shop/employees` & `POST /api/shop/employees` — Role-based employee management (`MANAGER`, `CASHIER`, `INVENTORY_STAFF`, `DELIVERY_STAFF`).

## 4. Public Marketplace & Customer Endpoints (`/api/marketplace`)
- `GET /api/marketplace/shops` — Browse active shops (excludes `PENDING`, `SUSPENDED`, `REJECTED` shops).
- `GET /api/marketplace/products` — Search and filter available, non-expired products across shops with live currency display.
- `POST /api/marketplace/orders` — Submit per-shop orders (never mixes items from different shops into one order).
- `POST /api/marketplace/orders/:orderId/payment-slip` — Upload payment screenshot/PDF receipt (marks order as `PAYMENT_SUBMITTED`, never `PAYMENT_VERIFIED`).
