# Security & Multi-Tenant Compliance Guide

## 1. Strict Tenant Isolation (`shop_id`)
- Every shop-owned table in PostgreSQL (`products`, `inventory_batches`, `orders`, `credit_accounts`, `credit_transactions`, `sales`, `expenses`, `suppliers`, `employees`) includes a mandatory `shop_id UUID NOT NULL REFERENCES shops(id)`.
- The `requireActiveShopTenant` middleware extracts the authenticated user's `shopId` from the signed JWT payload and rejects any request attempting to pass a different `shopId` in route parameters, query strings, or JSON bodies, logging a `CROSS_TENANT_ACCESS_BLOCKED` event to `audit_logs`.

## 2. Master Admin Authorisation Gate
- Public shop registrations default to `status = 'PENDING'`.
- Only a user with `role = 'MASTER_ADMIN'` can transition a shop to `ACTIVE`.
- If a shop is `PENDING`, `SUSPENDED`, or `REJECTED`, both login token refresh and API middleware immediately block access to shop management endpoints.

## 3. Financial & Inventory Integrity
- **Immutable Exchange Rates**: Every transaction records `transaction_currency`, `shop_base_currency`, and `exchange_rate_used` at the moment of creation. Updating `exchange_rates` only affects future conversions.
- **Reversal-Only Deletion Policy**: Financial records (`sales`, `credit_transactions`, `credit_payments`, `expenses`) cannot be hard-deleted via the API; cancellations generate explicit reversal ledger entries (`REVERSAL_CANCELLATION`) preserving full auditability.
- **Concurrency-Safe FEFO Deduction**: Stock deductions execute inside PostgreSQL `BEGIN ... COMMIT` transactions using `SELECT ... FOR UPDATE` row locks on `products` and `inventory_batches`.
