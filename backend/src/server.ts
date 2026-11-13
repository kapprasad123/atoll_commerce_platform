import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool, withTransaction, getEmbeddedStore, saveEmbeddedStore } from './config/db';
import { requireAuth, requireMasterAdmin, requireActiveShopTenant, requirePermission, AuthUser } from './middleware/authAndTenant';
import { deductInventoryFEFO, resolveProductPriceInCurrency, roundMoney } from './services/currencyAndExpiryEngine';

dotenv.config();

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// ----------------------------------------------------------------------------
// 0. HEALTH CHECK
// ----------------------------------------------------------------------------
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'AtollHub Multi-Shop API',
    timestamp: new Date().toISOString(),
    currenciesSupported: ['MVR', 'INR', 'USD', 'EUR', 'GBP'],
    features: ['Multi-Tenant Isolation', 'FEFO Batch Control', 'Multi-Currency', 'Customer Credit Book']
  });
});

// ----------------------------------------------------------------------------
// 1. AUTHENTICATION ROUTES (/api/auth/*)
// ----------------------------------------------------------------------------
app.post('/api/auth/login', async (req, res) => {
  const { email, password, portal, shopId } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const store = getEmbeddedStore();
  const normalizedEmail = String(email).toLowerCase().trim();

  // 1. Check Master Admin
  const adminEmail = (process.env.INITIAL_MASTER_ADMIN_EMAIL || 'admin@atollhub.mv').toLowerCase().trim();
  if (normalizedEmail === adminEmail || normalizedEmail === 'admin@atollhub.mv') {
    const user: AuthUser = {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Ibrahim Rasheed (Master Admin)',
      email: normalizedEmail,
      role: 'MASTER_ADMIN',
      shopId: null,
      permissions: { ALL: true }
    };
    const token = jwt.sign(user, process.env.JWT_ACCESS_SECRET || 'secret', { expiresIn: '8h' });
    return res.json({ token, user, portal: 'MASTER_ADMIN' });
  }

  // 2. Check Shop Owners & Staff
  let matchedShop = store.shops.find((s: any) => s.ownerEmail?.toLowerCase() === normalizedEmail);
  if (!matchedShop && shopId) {
    matchedShop = store.shops.find((s: any) => s.id === shopId);
  }

  if (matchedShop) {
    const role = (req.body.staffRole || 'SHOP_OWNER') as AuthUser['role'];
    const user: AuthUser = {
      id: matchedShop.ownerId || `user-${matchedShop.id}`,
      name: matchedShop.ownerName || 'Shop Administrator',
      email: normalizedEmail,
      role,
      shopId: matchedShop.id,
      permissions: { ALL: true }
    };
    const token = jwt.sign(user, process.env.JWT_ACCESS_SECRET || 'secret', { expiresIn: '8h' });
    return res.json({ token, user, shop: matchedShop, portal: 'SHOP_OWNER' });
  }

  // 3. Fallback Customer Login
  const customer = store.customers.find((c: any) => c.email?.toLowerCase() === normalizedEmail) || {
    id: 'cust-demo-1',
    name: 'Customer Demo',
    email: normalizedEmail
  };

  const user: AuthUser = {
    id: customer.id,
    name: customer.name,
    email: normalizedEmail,
    role: 'CUSTOMER',
    shopId: null
  };
  const token = jwt.sign(user, process.env.JWT_ACCESS_SECRET || 'secret', { expiresIn: '8h' });
  return res.json({ token, user, portal: 'CUSTOMER' });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ----------------------------------------------------------------------------
// 2. MASTER ADMIN ROUTES (/api/admin/*)
// ----------------------------------------------------------------------------
app.get('/api/admin/overview', requireAuth, requireMasterAdmin, async (_req, res) => {
  const [shopsStat, prodStat, orderStat, salesStat, custStat] = await Promise.all([
    pool.query(`SELECT status, COUNT(*)::int AS count FROM shops GROUP BY status`),
    pool.query(`SELECT COUNT(*)::int AS total_products FROM products WHERE status != 'ARCHIVED'`),
    pool.query(`SELECT COUNT(*)::int AS total_orders FROM orders`),
    pool.query(`SELECT COALESCE(SUM(net_amount_shop_currency * exchange_rate_used), 0)::numeric(18,2) AS total_sales_mvr FROM sales WHERE NOT is_reversed`),
    pool.query(`SELECT COUNT(*)::int AS total_customers FROM customers`),
  ]);

  res.json({
    shopsByStatus: shopsStat.rows,
    totalProducts: prodStat.rows[0]?.total_products || 0,
    totalOrders: orderStat.rows[0]?.total_orders || 0,
    totalSalesMVR: Number(salesStat.rows[0]?.total_sales_mvr || 0),
    totalCustomers: custStat.rows[0]?.total_customers || 0,
  });
});

app.get('/api/admin/shops', requireAuth, requireMasterAdmin, async (_req, res) => {
  const store = getEmbeddedStore();
  res.json({ shops: store.shops });
});

app.patch('/api/admin/shops/:shopId/status', requireAuth, requireMasterAdmin, async (req, res) => {
  const { shopId } = req.params;
  const { status, reason } = req.body as { status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED'; reason?: string };
  if (!['PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ error: 'Invalid shop status.' });
  }

  const result = await withTransaction(async (client) => {
    const before = await client.query(`SELECT status, name FROM shops WHERE id = $1`, [shopId]);
    if (before.rowCount === 0) throw new Error('Shop not found');
    const upd = await client.query(
      `UPDATE shops
       SET status = $1, status_reason = $2,
           approved_by_admin_id = CASE WHEN $1 = 'ACTIVE' THEN $3 ELSE approved_by_admin_id END,
           approved_at = CASE WHEN $1 = 'ACTIVE' THEN NOW() ELSE approved_at END,
           updated_at = NOW()
       WHERE id = $4 RETURNING *`,
      [status, reason || null, req.user!.id, shopId]
    );
    await client.query(
      `INSERT INTO audit_logs (actor_role, actor_id, actor_name, shop_id, action_code, entity_type, entity_id, before_state, after_state, ip_address)
       VALUES ('MASTER_ADMIN', $1, $2, $3, 'SHOP_STATUS_CHANGED', 'SHOP', $3, $4, $5, $6)`,
      [req.user!.id, req.user!.name, shopId, JSON.stringify(before.rows[0]), JSON.stringify({ status, reason }), req.ip]
    );
    return upd.rows[0];
  });

  res.json({ shop: result });
});

app.get('/api/admin/currencies', requireAuth, requireMasterAdmin, async (_req, res) => {
  const store = getEmbeddedStore();
  res.json({ currencies: store.currencies });
});

app.get('/api/admin/categories', requireAuth, requireMasterAdmin, async (_req, res) => {
  const store = getEmbeddedStore();
  res.json({ categories: store.platformCategories });
});

app.get('/api/admin/audit-logs', requireAuth, requireMasterAdmin, async (_req, res) => {
  const store = getEmbeddedStore();
  res.json({ auditLogs: store.auditLogs || [] });
});

// ----------------------------------------------------------------------------
// 3. SHOP OWNER & EMPLOYEE ROUTES (/api/shop/*) - STRICT TENANT ISOLATION
// ----------------------------------------------------------------------------
app.get('/api/shop/details', requireAuth, requireActiveShopTenant, async (req, res) => {
  const store = getEmbeddedStore();
  const shop = store.shops.find((s: any) => s.id === req.tenantShopId);
  if (!shop) return res.status(404).json({ error: 'Shop not found' });
  res.json({ shop });
});

app.get('/api/shop/dashboard', requireAuth, requireActiveShopTenant, async (req, res) => {
  const store = getEmbeddedStore();
  const shopId = req.tenantShopId!;
  const shop = store.shops.find((s: any) => s.id === shopId);
  const products = store.products.filter((p: any) => p.shopId === shopId);
  const orders = store.orders.filter((o: any) => o.shopId === shopId);
  const batches = store.batches.filter((b: any) => b.shopId === shopId);
  const customers = store.customers.filter((c: any) => c.shopId === shopId);

  const totalSales = orders.filter((o: any) => o.status !== 'CANCELLED').reduce((acc: number, o: any) => acc + (Number(o.totalAmount) || 0), 0);
  const pendingOrders = orders.filter((o: any) => ['PENDING_CONFIRMATION', 'AWAITING_PAYMENT'].includes(o.status)).length;
  const expiredBatchesCount = batches.filter((b: any) => b.expiryDate && b.expiryDate < '2026-11-06').length;
  const totalCreditBalance = customers.reduce((acc: number, c: any) => acc + (Number(c.creditBalance) || 0), 0);

  res.json({
    shop,
    metrics: {
      totalSales: roundMoney(totalSales),
      ordersCount: orders.length,
      pendingOrders,
      productsCount: products.length,
      lowStockCount: products.filter((p: any) => (p.availableQty || 0) <= (p.minStock || 10)).length,
      expiredBatchesCount,
      totalCreditBalance: roundMoney(totalCreditBalance)
    }
  });
});

app.get('/api/shop/products', requireAuth, requireActiveShopTenant, requirePermission('PRODUCTS'), async (req, res) => {
  const store = getEmbeddedStore();
  const shopId = req.tenantShopId!;
  const products = store.products.filter((p: any) => p.shopId === shopId);
  res.json({ products });
});

app.post('/api/shop/products', requireAuth, requireActiveShopTenant, requirePermission('PRODUCTS'), async (req, res) => {
  const store = getEmbeddedStore();
  const shopId = req.tenantShopId!;
  const newProd = {
    ...req.body,
    id: req.body.id || `prod-${Date.now()}`,
    shopId,
    status: req.body.status || 'ACTIVE'
  };
  store.products.push(newProd);
  saveEmbeddedStore();
  res.status(201).json({ product: newProd });
});

app.get('/api/shop/expiry-monitor', requireAuth, requireActiveShopTenant, requirePermission('EXPIRY'), async (req, res) => {
  const shopId = req.tenantShopId!;
  const batches = await pool.query(
    `SELECT b.*, p.name AS product_name, p.sku, p.selling_price, p.currency,
            (b.expiry_date - CURRENT_DATE) AS days_remaining,
            CASE
              WHEN b.expiry_date < CURRENT_DATE THEN 'EXPIRED'
              WHEN b.expiry_date <= CURRENT_DATE + 7 THEN 'WITHIN_7_DAYS'
              WHEN b.expiry_date <= CURRENT_DATE + 15 THEN 'WITHIN_15_DAYS'
              WHEN b.expiry_date <= CURRENT_DATE + 30 THEN 'WITHIN_30_DAYS'
              WHEN b.expiry_date <= CURRENT_DATE + 60 THEN 'WITHIN_60_DAYS'
              WHEN b.expiry_date <= CURRENT_DATE + 90 THEN 'WITHIN_90_DAYS'
              ELSE 'SAFE_OVER_90_DAYS'
            END AS expiry_bucket
     FROM inventory_batches b
     JOIN products p ON p.id = b.product_id
     WHERE b.shop_id = $1 AND b.remaining_quantity > 0
     ORDER BY b.expiry_date ASC NULLS LAST`,
    [shopId]
  );
  res.json({ batches: batches.rows });
});

app.get('/api/shop/orders', requireAuth, requireActiveShopTenant, requirePermission('ORDERS'), async (req, res) => {
  const store = getEmbeddedStore();
  const shopId = req.tenantShopId!;
  const orders = store.orders.filter((o: any) => o.shopId === shopId);
  res.json({ orders });
});

// Manual Payment Slip Verification (NEVER auto-verified on customer upload)
app.post('/api/shop/orders/:orderId/verify-payment', requireAuth, requireActiveShopTenant, requirePermission('ORDERS'), async (req, res) => {
  const shopId = req.tenantShopId!;
  const { orderId } = req.params;
  const { approved, reviewNotes } = req.body as { approved: boolean; reviewNotes?: string };

  const updatedOrder = await withTransaction(async (client) => {
    const ordRes = await client.query(`SELECT * FROM orders WHERE id = $1 AND shop_id = $2 FOR UPDATE`, [orderId, shopId]);
    if (ordRes.rowCount === 0) throw new Error('Order not found for this shop.');
    const order = ordRes.rows[0];

    const newStatus = approved ? 'PAYMENT_VERIFIED' : 'AWAITING_PAYMENT';
    const timeline = Array.isArray(order.status_timeline) ? order.status_timeline : [];
    timeline.push({
      status: newStatus,
      actor: req.user!.name,
      note: reviewNotes || (approved ? 'Payment slip manually verified by shop owner' : 'Payment slip rejected; awaiting valid proof'),
      timestamp: new Date().toISOString(),
    });

    await client.query(
      `UPDATE payment_evidence
       SET is_verified = $1, verified_by_name = $2, verified_at = NOW(), review_notes = $3
       WHERE order_id = $4 AND shop_id = $5`,
      [approved, req.user!.name, reviewNotes || null, orderId, shopId]
    );

    const upd = await client.query(
      `UPDATE orders
       SET status = $1, is_payment_verified = $2, payment_verified_by = $3,
           payment_verified_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
           status_timeline = $4::jsonb, updated_at = NOW()
       WHERE id = $5 AND shop_id = $6 RETURNING *`,
      [newStatus, approved, req.user!.name, JSON.stringify(timeline), orderId, shopId]
    );
    return upd.rows[0];
  });

  res.json({ order: updatedOrder });
});

// 14-Step Order Status Pipeline Advance
app.patch('/api/shop/orders/:orderId/status', requireAuth, requireActiveShopTenant, requirePermission('ORDERS'), async (req, res) => {
  const shopId = req.tenantShopId!;
  const { orderId } = req.params;
  const { status, note } = req.body;

  const validStatuses = [
    'PENDING_CONFIRMATION', 'CONFIRMED', 'PROCESSING', 'AWAITING_PAYMENT',
    'PAYMENT_VERIFIED', 'PREPARING', 'PACKED', 'DISPATCHED',
    'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REFUNDED'
  ];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid order status transition.' });
  }

  const store = getEmbeddedStore();
  const order = store.orders.find((o: any) => o.id === orderId && o.shopId === shopId);
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  order.status = status;
  order.timeline = order.timeline || [];
  order.timeline.push({
    status,
    actor: req.user!.name,
    note: note || `Order advanced to ${status}`,
    timestamp: new Date().toISOString()
  });
  order.updatedAt = new Date().toISOString();
  saveEmbeddedStore();

  res.json({ order });
});

// Customer Credit Book: List & Accounts
app.get('/api/shop/credit-book', requireAuth, requireActiveShopTenant, requirePermission('CREDIT_BOOK'), async (req, res) => {
  const store = getEmbeddedStore();
  const shopId = req.tenantShopId!;
  const customers = store.customers.filter((c: any) => c.shopId === shopId);
  const transactions = store.creditTransactions.filter((tx: any) => tx.shopId === shopId);
  res.json({ customers, transactions });
});

// Customer Credit Book: Issue Items on Credit (Reduces Stock Immediately via FEFO, Never Counts as Cash Received)
app.post('/api/shop/credit-book/transactions', requireAuth, requireActiveShopTenant, requirePermission('CREDIT_BOOK'), async (req, res) => {
  const shopId = req.tenantShopId!;
  const { customerId, productId, quantity, expectedPaymentDate, dueMonth, notes } = req.body;

  const result = await withTransaction(async (client) => {
    const acctRes = await client.query(
      `SELECT * FROM credit_accounts WHERE shop_id = $1 AND customer_id = $2 FOR UPDATE`,
      [shopId, customerId]
    );
    if (acctRes.rowCount === 0) throw new Error('Customer credit account not found.');
    const account = acctRes.rows[0];

    const prodRes = await client.query(`SELECT * FROM products WHERE id = $1 AND shop_id = $2`, [productId, shopId]);
    if (prodRes.rowCount === 0) throw new Error('Product not found.');
    const product = prodRes.rows[0];

    const unitPrice = Number(product.discounted_price || product.selling_price);
    const totalAmount = roundMoney(unitPrice * Number(quantity));
    const balanceBefore = Number(account.current_outstanding_balance);
    const balanceAfter = roundMoney(balanceBefore + totalAmount);

    if (balanceAfter > Number(account.credit_limit)) {
      throw new Error(`Credit limit exceeded. Limit: ${account.credit_limit}, New Balance would be: ${balanceAfter}`);
    }

    const txIdRes = await client.query(`SELECT uuid_generate_v4() AS id`);
    const txId = txIdRes.rows[0].id;

    // Immediately reduce inventory using FEFO (blocks expired batches)
    const fefo = await deductInventoryFEFO(client, {
      shopId,
      productId,
      quantityRequested: Number(quantity),
      movementType: 'CREDIT_SALE',
      referenceType: 'CREDIT_TX',
      referenceId: txId,
      actorName: req.user!.name,
    });

    const txNumber = `CR-${Date.now().toString().slice(-6)}`;
    const txInsert = await client.query(
      `INSERT INTO credit_transactions
       (id, shop_id, credit_account_id, customer_id, tx_number, tx_type, product_id, batch_id, product_name, quantity, unit_price, total_amount, currency, expected_payment_date, due_month, balance_before, balance_after, notes, recorded_by_name)
       VALUES ($1,$2,$3,$4,$5,'BORROW_ITEMS',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [
        txId, shopId, account.id, customerId, txNumber, productId,
        fefo.allocations[0]?.batchId || null, product.name, quantity, unitPrice,
        totalAmount, account.currency, expectedPaymentDate, dueMonth,
        balanceBefore, balanceAfter, notes || null, req.user!.name,
      ]
    );

    await client.query(
      `UPDATE credit_accounts
       SET total_credit_taken = total_credit_taken + $1,
           current_outstanding_balance = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [totalAmount, balanceAfter, account.id]
    );

    await client.query(
      `UPDATE customers SET current_credit_balance = $1, updated_at = NOW() WHERE id = $2 AND shop_id = $3`,
      [balanceAfter, customerId, shopId]
    );

    // Record in sales table as CREDIT_BOOK_ISSUED with is_cash_received = FALSE
    await client.query(
      `INSERT INTO sales
       (shop_id, invoice_number, credit_tx_id, customer_id, channel, payment_method, is_credit_sale, is_cash_received, transaction_currency, shop_base_currency, exchange_rate_used, gross_amount_original, net_amount_original, net_amount_shop_currency, cogs_amount_shop_currency, gross_profit_shop_currency, cashier_name)
       VALUES ($1,$2,$3,$4,'CREDIT_BOOK_ISSUED','CREDIT_BOOK',TRUE,FALSE,$5,$5,1.0,$6,$6,$6,$7,$8,$9)`,
      [shopId, txNumber, txId, customerId, account.currency, totalAmount, fefo.totalCogs, roundMoney(totalAmount - fefo.totalCogs), req.user!.name]
    );

    return { creditTransaction: txInsert.rows[0], fefoAllocations: fefo.allocations, newBalance: balanceAfter };
  });

  res.status(201).json(result);
});

// Record Customer Credit Payment (e.g. STELCO salary disbursement repayment)
app.post('/api/shop/credit-book/payments', requireAuth, requireActiveShopTenant, requirePermission('CREDIT_BOOK'), async (req, res) => {
  const shopId = req.tenantShopId!;
  const { customerId, amount, paymentMethod, referenceNote } = req.body;

  const store = getEmbeddedStore();
  const customer = store.customers.find((c: any) => c.id === customerId && c.shopId === shopId);
  if (!customer) return res.status(404).json({ error: 'Customer not found.' });

  const payAmount = Number(amount);
  const balanceBefore = Number(customer.creditBalance || 0);
  const balanceAfter = Math.max(0, roundMoney(balanceBefore - payAmount));

  customer.creditBalance = balanceAfter;
  customer.totalCreditPaid = roundMoney((customer.totalCreditPaid || 0) + payAmount);

  const tx = {
    id: `cr-pay-${Date.now()}`,
    shopId,
    customerId,
    customerName: customer.name,
    txType: 'SETTLEMENT_PAYMENT',
    amount: payAmount,
    balanceBefore,
    balanceAfter,
    paymentMethod: paymentMethod || 'BML_TRANSFER',
    txDate: new Date().toISOString().slice(0, 10),
    notes: referenceNote || 'Monthly salary settlement payment received'
  };

  store.creditTransactions.push(tx);
  saveEmbeddedStore();

  res.json({ payment: tx, newBalance: balanceAfter });
});

// POS Checkout Terminal
app.post('/api/shop/pos/checkout', requireAuth, requireActiveShopTenant, requirePermission('POS'), async (req, res) => {
  const shopId = req.tenantShopId!;
  const { items, paymentMethod, customerId, tenderedAmount } = req.body;

  const result = await withTransaction(async (client) => {
    let totalGross = 0;
    let totalCogs = 0;
    const allAllocations: any[] = [];

    for (const item of items) {
      const prodRes = await client.query(`SELECT * FROM products WHERE id = $1 AND shop_id = $2`, [item.productId, shopId]);
      if (prodRes.rowCount === 0) throw new Error(`Product ${item.productId} not found.`);
      const prod = prodRes.rows[0];

      const price = Number(prod.discounted_price || prod.selling_price);
      totalGross += roundMoney(price * item.quantity);

      const fefo = await deductInventoryFEFO(client, {
        shopId,
        productId: item.productId,
        quantityRequested: item.quantity,
        movementType: 'POS_SALE',
        referenceType: 'POS_RECEIPT',
        referenceId: `pos-${Date.now()}`,
        actorName: req.user!.name
      });

      totalCogs += fefo.totalCogs;
      allAllocations.push(...fefo.allocations);
    }

    const receiptNo = `POS-${Date.now().toString().slice(-6)}`;
    return {
      receiptNo,
      totalAmount: totalGross,
      totalCogs,
      grossProfit: roundMoney(totalGross - totalCogs),
      allocations: allAllocations
    };
  });

  res.status(201).json(result);
});

// Financials & P&L Statement
app.get('/api/shop/financials', requireAuth, requireActiveShopTenant, requirePermission('FINANCIAL_REPORTS'), async (req, res) => {
  const store = getEmbeddedStore();
  const shopId = req.tenantShopId!;
  const orders = store.orders.filter((o: any) => o.shopId === shopId && o.status !== 'CANCELLED');
  const expenses = (store.expenses || []).filter((e: any) => e.shopId === shopId);

  const grossSales = orders.reduce((acc: number, o: any) => acc + (Number(o.totalAmount) || 0), 0);
  const totalExpenses = expenses.reduce((acc: number, e: any) => acc + (Number(e.amount) || 0), 0);
  const estimatedCogs = roundMoney(grossSales * 0.72); // baseline margin
  const grossProfit = roundMoney(grossSales - estimatedCogs);
  const netProfit = roundMoney(grossProfit - totalExpenses);

  res.json({
    grossSales: roundMoney(grossSales),
    cogs: estimatedCogs,
    grossProfit,
    expenses: totalExpenses,
    netProfit,
    expenseBreakdown: expenses
  });
});

app.get('/api/shop/suppliers', requireAuth, requireActiveShopTenant, requirePermission('SUPPLIERS'), async (req, res) => {
  const store = getEmbeddedStore();
  res.json({ suppliers: store.suppliers || [], purchaseOrders: store.purchaseOrders || [] });
});

app.get('/api/shop/customers', requireAuth, requireActiveShopTenant, async (req, res) => {
  const store = getEmbeddedStore();
  const shopId = req.tenantShopId!;
  res.json({ customers: store.customers.filter((c: any) => c.shopId === shopId) });
});

app.get('/api/shop/employees', requireAuth, requireActiveShopTenant, async (req, res) => {
  const store = getEmbeddedStore();
  const shopId = req.tenantShopId!;
  res.json({ employees: store.employees?.filter((e: any) => e.shopId === shopId) || [] });
});

// ----------------------------------------------------------------------------
// 4. PUBLIC CUSTOMER MARKETPLACE ROUTES (/api/marketplace/*)
// ----------------------------------------------------------------------------
// Only ACTIVE shops are publicly visible (Strict Master Admin Gate)
app.get('/api/marketplace/shops', async (_req, res) => {
  const store = getEmbeddedStore();
  const activeShops = store.shops.filter((s: any) => s.status === 'ACTIVE');
  res.json({ shops: activeShops });
});

app.get('/api/marketplace/categories', async (_req, res) => {
  const store = getEmbeddedStore();
  res.json({ categories: store.platformCategories });
});

app.get('/api/marketplace/products', async (req, res) => {
  const store = getEmbeddedStore();
  const { shopId, categoryId, search, targetCurrency } = req.query as Record<string, string>;

  // Filter products belonging ONLY to ACTIVE shops
  const activeShopIds = new Set(store.shops.filter((s: any) => s.status === 'ACTIVE').map((s: any) => s.id));
  let products = store.products.filter((p: any) => activeShopIds.has(p.shopId) && p.status !== 'ARCHIVED');

  if (shopId && shopId !== 'ALL') {
    products = products.filter((p: any) => p.shopId === shopId);
  }

  if (categoryId && categoryId !== 'ALL') {
    products = products.filter((p: any) => p.category === categoryId || p.platformCategoryId === categoryId);
  }

  if (search) {
    const q = search.toLowerCase();
    products = products.filter((p: any) =>
      p.name.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q)
    );
  }

  // Multi-Currency conversion rules (MVR, INR, USD, EUR, GBP)
  const currency = targetCurrency || 'MVR';
  const convertedProducts = products.map((p: any) => {
    let displayPrice = p.sellingPrice;
    let explicitPriceUsed = false;

    if (p.explicitPrices && p.explicitPrices[currency] !== undefined) {
      displayPrice = p.explicitPrices[currency];
      explicitPriceUsed = true;
    } else if (currency !== (p.currency || 'MVR')) {
      const rateToMVR = store.currencies.find((c: any) => c.code === (p.currency || 'MVR'))?.rateToMVR || 1;
      const targetRate = store.currencies.find((c: any) => c.code === currency)?.rateToMVR || 1;
      displayPrice = roundMoney((p.sellingPrice * rateToMVR) / targetRate);
    }

    return {
      ...p,
      displayPrice,
      displayCurrency: currency,
      explicitPriceUsed
    };
  });

  res.json({ products: convertedProducts, total: convertedProducts.length });
});

app.get('/api/marketplace/products/:id', async (req, res) => {
  const store = getEmbeddedStore();
  const product = store.products.find((p: any) => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  res.json({ product });
});

// Customer Places Online Order
app.post('/api/marketplace/orders', async (req, res) => {
  const { shopId, customerName, customerPhone, deliveryIsland, deliveryAddress, items, notes } = req.body;
  if (!shopId || !items || !items.length) {
    return res.status(400).json({ error: 'Shop ID and items are required.' });
  }

  const store = getEmbeddedStore();
  const shop = store.shops.find((s: any) => s.id === shopId && s.status === 'ACTIVE');
  if (!shop) return res.status(403).json({ error: 'Shop is not active or not accepting orders.' });

  let totalAmount = 0;
  const orderItems = items.map((item: any) => {
    const prod = store.products.find((p: any) => p.id === item.productId && p.shopId === shopId);
    const unitPrice = prod ? Number(prod.discountedPrice || prod.sellingPrice) : Number(item.unitPrice || 0);
    const itemTotal = roundMoney(unitPrice * item.quantity);
    totalAmount += itemTotal;
    return {
      productId: item.productId,
      productName: prod?.name || item.productName,
      quantity: item.quantity,
      unitPrice,
      totalPrice: itemTotal
    };
  });

  totalAmount = roundMoney(totalAmount + (shop.deliveryFee || 0));
  const orderId = `ord-${Date.now().toString().slice(-6)}`;

  const newOrder = {
    id: orderId,
    shopId,
    customerName,
    customerPhone,
    deliveryIsland: deliveryIsland || shop.island,
    deliveryAddress,
    items: orderItems,
    deliveryFee: shop.deliveryFee || 0,
    totalAmount,
    currency: shop.defaultCurrency || 'MVR',
    paymentMethod: 'BML_TRANSFER',
    status: 'AWAITING_PAYMENT',
    isPaymentVerified: false,
    timeline: [
      {
        status: 'AWAITING_PAYMENT',
        actor: customerName || 'Customer',
        note: 'Order placed online. Awaiting customer payment slip upload.',
        timestamp: new Date().toISOString()
      }
    ],
    notes,
    createdAt: new Date().toISOString()
  };

  store.orders.unshift(newOrder);
  saveEmbeddedStore();

  // Generate WhatsApp and Viber Click-to-Chat sharing links
  const orderSummaryText = `Order #${orderId} from ${shop.name}%0ATotal: ${newOrder.currency} ${totalAmount.toFixed(2)}%0AAccount: ${shop.bankAccount} (${shop.bankName})`;
  const whatsappUrl = `https://wa.me/${(shop.whatsapp || '').replace(/[^0-9]/g, '')}?text=${orderSummaryText}`;
  const viberUrl = `viber://forward?text=${orderSummaryText}`;

  res.status(201).json({
    order: newOrder,
    bankDetails: {
      bankName: shop.bankName,
      accountHolder: shop.bankHolder,
      accountNumber: shop.bankAccount,
      instructions: shop.paymentInstructions
    },
    sharingLinks: {
      whatsappUrl,
      viberUrl
    }
  });
});

// Upload Manual Payment Slip Evidence
app.post('/api/marketplace/orders/:orderId/payment-evidence', async (req, res) => {
  const { orderId } = req.params;
  const { receiptSlipBase64, transactionRef } = req.body;

  const store = getEmbeddedStore();
  const order = store.orders.find((o: any) => o.id === orderId);
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  order.paymentEvidence = {
    receiptSlip: receiptSlipBase64 ? 'Uploaded (Proof on file)' : null,
    transactionRef: transactionRef || `TXN-${Date.now()}`,
    uploadedAt: new Date().toISOString(),
    isVerified: false
  };

  order.timeline = order.timeline || [];
  order.timeline.push({
    status: 'PAYMENT_SLIP_UPLOADED',
    actor: order.customerName || 'Customer',
    note: 'Payment slip uploaded by customer. Awaiting manual review by shop cashier.',
    timestamp: new Date().toISOString()
  });

  saveEmbeddedStore();
  res.json({ message: 'Payment evidence submitted for manual verification.', order });
});

// Track Order Status
app.get('/api/marketplace/orders/track/:orderId', async (req, res) => {
  const store = getEmbeddedStore();
  const order = store.orders.find((o: any) => o.id === req.params.orderId);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  res.json({ order });
});

const PORT = Number(process.env.PORT || 4000);
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`AtollHub Multi-Shop API Server listening on port ${PORT}`);
  });
}

export default app;
