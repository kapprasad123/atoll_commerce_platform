import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../config/db';

export interface AuthUser {
  id: string;
  role: 'MASTER_ADMIN' | 'SHOP_OWNER' | 'MANAGER' | 'CASHIER' | 'INVENTORY_STAFF' | 'DELIVERY_STAFF' | 'CUSTOMER';
  shopId?: string | null;
  email: string;
  name: string;
  permissions?: Record<string, boolean>;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      tenantShopId?: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Missing Bearer token.' });
  }
  const token = authHeader.slice(7);
  try {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret) throw new Error('Server JWT secret not configured');
    const decoded = jwt.verify(token, secret) as AuthUser;
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired authentication token.' });
  }
}

export function requireMasterAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'MASTER_ADMIN') {
    return res.status(403).json({ error: 'Forbidden: Only Master Admin can perform this action.' });
  }
  next();
}

/**
 * Enforces strict Multi-Tenant Isolation & Active Shop Verification:
 * 1. Extracts user's assigned shopId from verified JWT.
 * 2. Prevents cross-tenant access if URL/body contains a mismatched shopId.
 * 3. Verifies in PostgreSQL that the shop status is 'ACTIVE' (blocks PENDING, SUSPENDED, REJECTED).
 */
export async function requireActiveShopTenant(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthenticated request.' });
  }

  const requestedShopId = (req.params.shopId || req.body.shopId || req.query.shopId) as string | undefined;

  if (req.user.role === 'MASTER_ADMIN') {
    req.tenantShopId = requestedShopId;
    return next();
  }

  const userShopId = req.user.shopId;
  if (!userShopId) {
    return res.status(403).json({ error: 'No shop tenant associated with this account.' });
  }

  // Strict Tenant Boundary Check: One shop must NEVER access another shop's private data
  if (requestedShopId && requestedShopId !== userShopId) {
    await pool.query(
      `INSERT INTO audit_logs (actor_role, actor_id, actor_name, shop_id, action_code, entity_type, entity_id, after_state, ip_address)
       VALUES ($1, $2, $3, $4, 'CROSS_TENANT_ACCESS_BLOCKED', 'SHOP', $5, $6, $7)`,
      [req.user.role, req.user.id, req.user.name, userShopId, requestedShopId, JSON.stringify({ attemptedShopId: requestedShopId }), req.ip]
    );
    return res.status(403).json({
      error: 'Tenant Isolation Violation: You do not have permission to access another shop\'s data.'
    });
  }

  // Verify shop status is ACTIVE (Only Master Admin can activate a shop; Suspended/Pending cannot manage)
  const shopResult = await pool.query(
    `SELECT id, status, status_reason FROM shops WHERE id = $1`,
    [userShopId]
  );

  if (shopResult.rowCount === 0) {
    return res.status(404).json({ error: 'Shop record not found.' });
  }

  const shop = shopResult.rows[0];
  if (shop.status !== 'ACTIVE') {
    return res.status(403).json({
      error: `Shop access denied. Current shop status is ${shop.status}. Only accounts activated by the Master Admin can access shop management.`,
      shopStatus: shop.status,
      reason: shop.status_reason
    });
  }

  req.tenantShopId = userShopId;
  next();
}

export function requirePermission(moduleName: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (req.user.role === 'MASTER_ADMIN' || req.user.role === 'SHOP_OWNER') {
      return next();
    }
    const roleMatrix: Record<string, string[]> = {
      MANAGER: ['POS', 'PRODUCTS', 'INVENTORY', 'EXPIRY', 'ORDERS', 'CREDIT_BOOK', 'FINANCIAL_REPORTS', 'SUPPLIERS'],
      CASHIER: ['POS', 'ORDERS', 'CREDIT_BOOK'],
      INVENTORY_STAFF: ['PRODUCTS', 'INVENTORY', 'EXPIRY', 'SUPPLIERS'],
      DELIVERY_STAFF: ['ORDERS', 'DELIVERIES'],
    };
    const allowed = roleMatrix[req.user.role] || [];
    if (!allowed.includes(moduleName)) {
      return res.status(403).json({
        error: `Role '${req.user.role}' is not authorised to access module '${moduleName}'.`
      });
    }
    next();
  };
}
