# Testing & Quality Assurance Guide

Run the automated business-rule and architectural verification suite:

```bash
python3 tests/run_verification_suite.py
```

## Verified Test Cases (27 Core Checks)
1. **Master Admin Governance**: Verifies only Master Admin can activate shop accounts and `PENDING`/`SUSPENDED` shops are blocked from shop management.
2. **Strict Multi-Tenant Data Isolation (`shop_id`)**: Verifies all shop tables enforce `shop_id` foreign keys and cross-tenant requests are rejected and logged.
3. **32 Sample Products & 3 Active + 1 Pending Shop**: Verifies seed dataset completeness across MVR, INR, USD, EUR, GBP.
4. **Multi-Currency Explicit & Converted Pricing**: Verifies Rice 5kg explicit pricing (`MVR 85.00`, `INR 450.00`, `USD 5.50`) and immutable exchange rate snapshots.
5. **FEFO Batch Deduction & Expired Quarantine**: Verifies earliest valid batch is deducted first and expired batch `B-YOG-EXP01` (`2026-10-29`) is blocked from sale.
6. **14-Step Order Workflow & Manual Payment Slip Verification**: Verifies uploading a payment slip transitions status to `PAYMENT_SUBMITTED` and never auto-verifies payment.
7. **Customer Credit Book Mathematical Integrity**: Verifies Ahmed's ledger (`Jan: MVR 750 + Feb: MVR 350 = MVR 1,100 borrowed; Feb salary payment: MVR 500 -> MVR 600 remaining balance`) and separation of credit sales from cash received.
8. **Profit & Loss Formula**: Verifies `Gross Profit = Sales Revenue - COGS` and `Net Profit = Gross Profit - Operating Expenses`.
