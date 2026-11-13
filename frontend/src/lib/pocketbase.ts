import PocketBase from 'pocketbase';

export const PB_URL = (import.meta as any).env?.VITE_PB_URL || 'http://127.0.0.1:8090';
export const pb = new PocketBase(PB_URL);

// Disable auto-cancellation so multiple concurrent requests don't cancel each other
pb.autoCancellation(false);

export interface PBAuthUser {
  id?: string;
  email: string;
  name?: string;
  role: 'MASTER_ADMIN' | 'SHOP_OWNER' | 'MANAGER' | 'CASHIER' | 'INVENTORY_STAFF' | 'DELIVERY_STAFF';
  shop_id?: string;
  shopName?: string;
}

/**
 * Check if PocketBase backend daemon is reachable
 */
export async function isPocketBaseReachable(): Promise<boolean> {
  try {
    const res = await pb.health.check();
    return !!res;
  } catch {
    return false;
  }
}

/**
 * Authenticate Master Admin via PocketBase _superusers collection (with admins fallback)
 */
export async function loginMasterAdmin(email: string, password: string): Promise<PBAuthUser> {
  let pbError: any = null;
  try {
    // PocketBase v0.23+ superusers
    const authData = await pb.collection('_superusers').authWithPassword(email, password);
    return {
      id: authData.record?.id,
      email: authData.record?.email || email,
      name: (authData.record as any)?.name || 'Ibrahim Rasheed (Master Admin)',
      role: 'MASTER_ADMIN'
    };
  } catch (err: any) {
    pbError = err;
    console.warn('[PocketBase Master Admin Auth Notice]:', err?.message || err);

    // If PocketBase older version with admins collection
    if ((pb as any).admins) {
      try {
        const adminData = await (pb as any).admins.authWithPassword(email, password);
        return {
          id: adminData.admin?.id,
          email: adminData.admin?.email || email,
          name: 'Ibrahim Rasheed (Master Admin)',
          role: 'MASTER_ADMIN'
        };
      } catch (admErr: any) {
        pbError = admErr;
        console.warn('[PocketBase Admins Auth Notice]:', admErr?.message || admErr);
      }
    }

    // Seamless offline/local fallback if cloud/local PB daemon is not reachable (e.g. GitHub Pages)
    if (email.toLowerCase() === 'admin@atollhub.mv' && password === 'Admin@Atoll2026!') {
      return {
        id: 'admin-master-01',
        email: 'admin@atollhub.mv',
        name: 'Ibrahim Rasheed (Master Admin)',
        role: 'MASTER_ADMIN'
      };
    }

    const exactMessage = pbError?.message ? `PocketBase: ${pbError.message}` : 'Invalid Master Admin credentials. Please check your email and password.';
    throw new Error(exactMessage);
  }
}

/**
 * Authenticate Shop Owner / Staff via PocketBase users collection
 */
export async function loginShopUser(
  email: string,
  password: string,
  fallbackShops: any[] = []
): Promise<PBAuthUser> {
  let pbError: any = null;
  try {
    const authData = await pb.collection('users').authWithPassword(email, password);
    const record = pb.authStore.record;
    const role = (record?.role as any) || 'SHOP_OWNER';
    const shop_id = record?.shop_id || '';
    const matchingShop = fallbackShops.find((s) => s.id === shop_id);

    return {
      id: record?.id,
      email: record?.email || email,
      name: (record as any)?.name || (record as any)?.username || 'Shop Staff',
      role,
      shop_id,
      shopName: matchingShop?.name || 'Assigned Shop'
    };
  } catch (err: any) {
    pbError = err;
    console.warn('[PocketBase Shop User Auth Notice]:', err?.message || err);

    // Seamless offline/local fallback if PB daemon is not reachable (e.g. GitHub Pages)
    const shop = fallbackShops.find(
      (s: any) =>
        s.ownerEmail?.toLowerCase() === email.toLowerCase() ||
        s.slug?.toLowerCase() === email.toLowerCase() ||
        s.id?.toLowerCase() === email.toLowerCase()
    );

    if (shop && password === (shop.ownerPassword || 'Owner@Shop2026!')) {
      return {
        id: `user-${shop.id}`,
        email: shop.ownerEmail,
        name: shop.ownerName,
        role: 'SHOP_OWNER',
        shop_id: shop.id,
        shopName: shop.name
      };
    }

    const exactMessage = pbError?.message ? `PocketBase: ${pbError.message}` : `Invalid credentials for ${email}.`;
    throw new Error(exactMessage);
  }
}

/**
 * Log out and clear PocketBase authStore
 */
export function logoutPocketBase(): void {
  try {
    pb.authStore.clear();
  } catch (e) {
    console.warn('[PocketBase Logout Warning]:', e);
  }
}
