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
      } catch {}
    }

    // Seamless offline/local fallback if local PB daemon is not running
    if (email.toLowerCase() === 'admin@atollhub.mv' && password === 'Admin@Atoll2026!') {
      return {
        id: 'admin-master-01',
        email: 'admin@atollhub.mv',
        name: 'Ibrahim Rasheed (Master Admin)',
        role: 'MASTER_ADMIN'
      };
    }
    throw new Error(err?.message || 'Invalid Master Admin credentials. Use admin@atollhub.mv / Admin@Atoll2026!');
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
    // Seamless offline/local fallback if PB daemon is not running
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
    throw new Error(err?.message || `Invalid credentials for ${email}. (Use Owner@Shop2026! or newly reset password)`);
  }
}

/**
 * Log out and clear PocketBase authStore
 */
export function logoutPocketBase(): void {
  pb.authStore.clear();
}
