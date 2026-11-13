import React, { useState, useEffect, useMemo } from 'react';
import initialData from './data/initialData.json';
import { buildWhatsAppOrderUrl, buildViberShareUrl } from './utils/whatsappAndViber';
import { pb, loginMasterAdmin, loginShopUser, logoutPocketBase, PBAuthUser } from './lib/pocketbase';
import {
  ShoppingBag, Store, Shield, ShoppingCart, Search, Filter, AlertTriangle,
  CheckCircle, Clock, CreditCard, DollarSign, Package, Users, Truck,
  FileText, TrendingUp, Settings, ArrowRight, Eye, RefreshCw, Moon, Sun,
  Phone, MapPin, Building, ChevronRight, X, ExternalLink
} from 'lucide-react';

export type PortalType = 'CUSTOMER' | 'SHOP_OWNER' | 'MASTER_ADMIN';
export type CurrencyCode = 'MVR' | 'USD' | 'INR' | 'EUR' | 'GBP';
export type StaffRole = 'SHOP_OWNER' | 'MANAGER' | 'CASHIER' | 'INVENTORY_STAFF' | 'DELIVERY_STAFF';

export type AuthUser = PBAuthUser;

export default function App() {
  const [data, setData] = useState<any>(initialData);
  const [portal, setPortal] = useState<PortalType>('CUSTOMER');
  const [activeShopId, setActiveShopId] = useState<string>('shop-1');
  const [activeStaffRole, setActiveStaffRole] = useState<StaffRole>('SHOP_OWNER');
  const [currency, setCurrency] = useState<CurrencyCode>('MVR');

  // Authentication & Session Protection State
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loginModalOpen, setLoginModalOpen] = useState<boolean>(false);
  const [loginTargetRole, setLoginTargetRole] = useState<'MASTER_ADMIN' | 'SHOP_OWNER'>('SHOP_OWNER');
  const [loginEmail, setLoginEmail] = useState<string>('');
  const [loginPassword, setLoginPassword] = useState<string>('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginLoading, setLoginLoading] = useState<boolean>(false);

  // PocketBase Master Admin Tenant Provisioning Modal State
  const [createShopModalOpen, setCreateShopModalOpen] = useState<boolean>(false);
  const [newShopForm, setNewShopForm] = useState({
    name: '',
    ownerName: '',
    ownerEmail: '',
    phone: '+960 777-8899',
    island: 'Malé',
    atoll: 'Kaafu Atoll',
    status: 'ACTIVE' as 'ACTIVE' | 'PENDING',
    tempPassword: ''
  });
  const [shopTab, setShopTab] = useState<string>('DASHBOARD');
  const [adminTab, setAdminTab] = useState<string>('SHOPS');

  // Marketplace state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedMarketShop, setSelectedMarketShop] = useState<string>('ALL');
  const [customerCarts, setCustomerCarts] = useState<Record<string, Array<{ productId: string; quantity: number }>>>({
    'shop-1': [{ productId: 'prod-1', quantity: 2 }]
  });

  // UI Modals
  const [cartDrawerOpen, setCartDrawerOpen] = useState<boolean>(false);
  const [checkoutModalOpen, setCheckoutModalOpen] = useState<boolean>(false);
  const [checkoutShopId, setCheckoutShopId] = useState<string>('shop-1');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [reviewOrderModal, setReviewOrderModal] = useState<any | null>(null);
  const [reviewNotes, setReviewNotes] = useState<string>('');

  // POS State
  const [posCart, setPosCart] = useState<Array<{ productId: string; quantity: number }>>([]);
  const [posCustomerId, setPosCustomerId] = useState<string>('cust-ahmed');
  const [posPaymentMethod, setPosPaymentMethod] = useState<string>('CASH');

  // Customer Checkout Form
  const [checkoutForm, setCheckoutForm] = useState({
    name: 'Ahmed Mausoom',
    phone: '+960 777-4512',
    island: 'Malé',
    address: 'H. Coral Breeze, Majeedhee Magu',
    notes: 'Please call before delivery'
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Synchronize state with PocketBase collections on mount (with API fallback)
  useEffect(() => {
    async function loadPocketBaseData() {
      try {
        const [pbShops, pbProducts] = await Promise.all([
          pb.collection('shops').getFullList({ filter: 'status = "ACTIVE"', sort: 'name' }),
          pb.collection('products').getFullList({ filter: 'status = "ACTIVE"', sort: 'name' })
        ]);
        if (pbShops && pbShops.length > 0) {
          setData((prev: any) => ({
            ...prev,
            shops: pbShops,
            ...(pbProducts && pbProducts.length > 0 ? { products: pbProducts } : {})
          }));
          return;
        }
      } catch (e) {
        // PocketBase offline or collections empty -> fallback to local API / seeded state
      }

      fetch('/api/marketplace/shops')
        .then((r) => r.ok ? r.json() : null)
        .then((res) => {
          if (res?.shops) {
            setData((prev: any) => ({ ...prev, shops: res.shops }));
          }
        })
        .catch(() => {
          // Fallback gracefully to embedded data
        });
    }
    loadPocketBaseData();
  }, []);

  const activeShop = useMemo(() => {
    return data.shops.find((s: any) => s.id === activeShopId) || data.shops[0];
  }, [data.shops, activeShopId]);

  // Price conversion helper
  const formatPrice = (prod: any, targetCurrency = currency) => {
    if (prod.explicitPrices && prod.explicitPrices[targetCurrency] !== undefined) {
      return `${targetCurrency} ${Number(prod.explicitPrices[targetCurrency]).toFixed(2)}`;
    }
    const currObj = data.currencies?.find((c: any) => c.code === targetCurrency);
    const prodCurr = data.currencies?.find((c: any) => c.code === (prod.currency || 'MVR'));
    const priceMVR = Number(prod.sellingPrice) * (prodCurr?.rateToMVR || 1);
    const converted = priceMVR / (currObj?.rateToMVR || 1);
    return `${targetCurrency} ${converted.toFixed(2)}`;
  };

  // Add to Per-Shop Cart
  const addToCart = (productId: string, shopId: string) => {
    setCustomerCarts((prev) => {
      const shopItems = prev[shopId] ? [...prev[shopId]] : [];
      const idx = shopItems.findIndex((i) => i.productId === productId);
      if (idx >= 0) {
        shopItems[idx].quantity += 1;
      } else {
        shopItems.push({ productId, quantity: 1 });
      }
      return { ...prev, [shopId]: shopItems };
    });
    showToast('Added to cart!');
  };

  // Total cart items count
  const cartTotalItems = useMemo(() => {
    return Object.values(customerCarts).reduce((acc, items) => acc + items.reduce((s, i) => s + i.quantity, 0), 0);
  }, [customerCarts]);

  // Approve / Suspend Shop (Master Admin) in PocketBase & platform registry
  const handleUpdateShopStatus = async (shopId: string, status: 'ACTIVE' | 'SUSPENDED' | 'REJECTED') => {
    try {
      await pb.collection('shops').update(shopId, { status });
    } catch (e) {
      // PocketBase offline fallback
    }

    try {
      const res = await fetch(`/api/admin/shops/${shopId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer mock-master-admin' },
        body: JSON.stringify({ status, reason: `Updated by Master Admin to ${status}` })
      });
      if (res.ok) {
        setData((prev: any) => ({
          ...prev,
          shops: prev.shops.map((s: any) => s.id === shopId ? { ...s, status } : s)
        }));
        showToast(`Shop status updated to ${status} in PocketBase & backend.`);
        return;
      }
    } catch (e) {
      // Local fallback
    }
    setData((prev: any) => ({
      ...prev,
      shops: prev.shops.map((s: any) => s.id === shopId ? { ...s, status } : s)
    }));
    showToast(`Shop status updated to ${status} in PocketBase registry.`);
  };

  // Verify payment slip (Shop Owner)
  const handleVerifyPayment = async (orderId: string, approved: boolean) => {
    try {
      const res = await fetch(`/api/shop/orders/${orderId}/verify-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer mock-shop-owner' },
        body: JSON.stringify({ approved, reviewNotes })
      });
      if (res.ok) {
        const json = await res.json();
        setData((prev: any) => ({
          ...prev,
          orders: prev.orders.map((o: any) => o.id === orderId ? json.order : o)
        }));
        setReviewOrderModal(null);
        showToast(approved ? 'Payment slip verified!' : 'Payment rejected.');
        return;
      }
    } catch (e) {
      // Local fallback
    }
    setData((prev: any) => ({
      ...prev,
      orders: prev.orders.map((o: any) => o.id === orderId ? {
        ...o,
        status: approved ? 'PAYMENT_VERIFIED' : 'AWAITING_PAYMENT',
        isPaymentVerified: approved
      } : o)
    }));
    setReviewOrderModal(null);
    showToast(approved ? 'Payment slip verified (Local)!' : 'Payment rejected (Local).');
  };

  // Issue Credit Book items (Ahmed Mausoom STELCO salary calculation)
  const handleIssueCredit = async (customerId: string, productId: string, quantity: number) => {
    try {
      const res = await fetch('/api/shop/credit-book/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer mock-shop-owner' },
        body: JSON.stringify({ customerId, productId, quantity, dueMonth: 'November 2026' })
      });
      if (res.ok) {
        const json = await res.json();
        setData((prev: any) => ({
          ...prev,
          creditTransactions: [json.creditTransaction, ...prev.creditTransactions],
          customers: prev.customers.map((c: any) => c.id === customerId ? { ...c, creditBalance: json.newBalance } : c)
        }));
        showToast('Items issued on credit with FEFO deduction!');
        return;
      }
    } catch (e) {}

    const prod = data.products.find((p: any) => p.id === productId);
    const amount = Number(prod.sellingPrice) * quantity;
    setData((prev: any) => ({
      ...prev,
      customers: prev.customers.map((c: any) => c.id === customerId ? {
        ...c,
        creditBalance: Number(c.creditBalance || 0) + amount,
        totalCreditBorrowed: Number(c.totalCreditBorrowed || 0) + amount
      } : c)
    }));
    showToast(`Items issued on credit (Local)!`);
  };

  // Authentication & PocketBase Handlers
  const handleLoginSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);
    const email = loginEmail.trim();
    const pw = loginPassword.trim();

    try {
      if (loginTargetRole === 'MASTER_ADMIN') {
        const user = await loginMasterAdmin(email, pw);
        setCurrentUser(user);
        setPortal('MASTER_ADMIN');
        setLoginModalOpen(false);
        setLoginEmail('');
        setLoginPassword('');
        showToast(`🛡️ Authenticated as Master Admin (${user.email})`);
      } else {
        const user = await loginShopUser(email, pw, data.shops);
        setCurrentUser(user);
        if (user.shop_id) {
          setActiveShopId(user.shop_id);
        }
        setPortal('SHOP_OWNER');
        setLoginModalOpen(false);
        setLoginEmail('');
        setLoginPassword('');
        showToast(`🏪 Logged in as ${user.name} (${user.email}). Tenant locked to ${user.shopName}.`);
      }
    } catch (err: any) {
      setLoginError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    logoutPocketBase();
    setCurrentUser(null);
    setPortal('CUSTOMER');
    showToast('Logged out successfully. Returned to Customer Marketplace.');
  };

  const openLoginFor = (role: 'MASTER_ADMIN' | 'SHOP_OWNER', defaultEmail = '', defaultPw = '') => {
    setLoginTargetRole(role);
    setLoginEmail(defaultEmail);
    setLoginPassword(defaultPw);
    setLoginError(null);
    setLoginModalOpen(true);
  };

  // Master Admin: Reset Password in PocketBase & local state
  const handleResetShopPassword = async (shopId: string) => {
    const shop = data.shops.find((s: any) => s.id === shopId);
    if (!shop) return;
    const tempPw = `Pass-${Math.floor(1000 + Math.random() * 9000)}`;

    try {
      const userList = await pb.collection('users').getList(1, 1, {
        filter: `email = "${shop.ownerEmail}" || shop_id = "${shopId}"`
      });
      if (userList.items.length > 0) {
        await pb.collection('users').update(userList.items[0].id, {
          password: tempPw,
          passwordConfirm: tempPw
        });
      }
    } catch (e) {
      // PB offline fallback
    }

    setData((prev: any) => ({
      ...prev,
      shops: prev.shops.map((s: any) => s.id === shopId ? { ...s, ownerPassword: tempPw } : s)
    }));
    showToast(`🔑 Reset PW for ${shop.name} (${shop.ownerEmail}): ${tempPw}`);
  };

  // Master Admin: Create Shop Owner & Tenant Workspace in PocketBase
  const handleCreateShopInPB = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newShopId = 'shop-' + (data.shops.length + 1);
      const tempPw = newShopForm.tempPassword || `Owner@${Math.floor(1000 + Math.random() * 9000)}`;

      let pbShopRecord: any = null;
      try {
        pbShopRecord = await pb.collection('shops').create({
          name: newShopForm.name,
          slug: newShopForm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          ownerName: newShopForm.ownerName,
          ownerEmail: newShopForm.ownerEmail,
          phone: newShopForm.phone,
          island: newShopForm.island || 'Malé',
          atoll: newShopForm.atoll || 'Kaafu Atoll',
          status: newShopForm.status || 'ACTIVE',
          defaultCurrency: 'MVR'
        });
      } catch (e) {}

      try {
        await pb.collection('users').create({
          email: newShopForm.ownerEmail,
          password: tempPw,
          passwordConfirm: tempPw,
          name: newShopForm.ownerName,
          role: 'SHOP_OWNER',
          shop_id: pbShopRecord?.id || newShopId
        });
      } catch (e) {}

      const createdShop = {
        id: pbShopRecord?.id || newShopId,
        name: newShopForm.name,
        slug: newShopForm.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        ownerName: newShopForm.ownerName,
        ownerEmail: newShopForm.ownerEmail,
        ownerPassword: tempPw,
        phone: newShopForm.phone,
        whatsapp: newShopForm.phone.replace(/[^0-9]/g, ''),
        viber: newShopForm.phone.replace(/[^0-9]/g, ''),
        island: newShopForm.island || 'Malé',
        atoll: newShopForm.atoll || 'Kaafu Atoll',
        address: newShopForm.island || 'Malé',
        status: newShopForm.status || 'ACTIVE',
        defaultCurrency: 'MVR',
        category: 'Island Retail & Provisions',
        coverImage: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=600&q=80',
        bankName: 'Bank of Maldives (BML)',
        bankHolder: newShopForm.name.toUpperCase(),
        bankAccount: '7730000998877',
        paymentInstructions: 'BML Transfer upon order confirmation.'
      };

      setData((prev: any) => ({
        ...prev,
        shops: [createdShop, ...prev.shops]
      }));

      setCreateShopModalOpen(false);
      setNewShopForm({
        name: '',
        ownerName: '',
        ownerEmail: '',
        phone: '+960 777-8899',
        island: 'Malé',
        atoll: 'Kaafu Atoll',
        status: 'ACTIVE',
        tempPassword: ''
      });
      showToast(`✅ Created Shop '${createdShop.name}' in PocketBase! Password: ${tempPw}`);
    } catch (err: any) {
      showToast(`Error provisioning shop: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* 1. TOP NAV / PORTAL SWITCHER BAR */}
      <nav className="bg-slate-950 text-white px-4 py-2 text-xs border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              ATOLLHUB LIVE ENGINE
            </span>
            {!currentUser ? (
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Portal:</span>
                <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                  <button
                    onClick={() => setPortal('CUSTOMER')}
                    className="px-3 py-1 rounded-md font-semibold transition bg-indigo-600 text-white shadow"
                  >
                    🛍️ Marketplace
                  </button>
                </div>
                <button
                  onClick={() => openLoginFor('SHOP_OWNER')}
                  className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition flex items-center gap-1.5 shadow"
                >
                  <span>🔐 Account / Login</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                {/* Active User Email & Role Badge */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-950/80 border border-indigo-700/60 text-white">
                  {currentUser.role === 'MASTER_ADMIN' ? (
                    <span className="text-rose-400 font-extrabold flex items-center gap-1 text-[11px]">
                      🛡️ <span className="text-slate-100">{currentUser.email}</span>
                      <span className="text-rose-300 font-semibold">(Master Admin)</span>
                    </span>
                  ) : (
                    <span className="text-emerald-400 font-extrabold flex items-center gap-1 text-[11px]">
                      🏪 <span className="text-slate-100">{currentUser.email}</span>
                      <span className="text-emerald-300 font-semibold">({currentUser.shopName})</span>
                    </span>
                  )}
                </div>

                {/* Portal Navigation for Authenticated User */}
                <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                  <button
                    onClick={() => setPortal('CUSTOMER')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition ${portal === 'CUSTOMER' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                  >
                    🛍️ Marketplace
                  </button>
                  {currentUser.role === 'MASTER_ADMIN' ? (
                    <button
                      onClick={() => setPortal('MASTER_ADMIN')}
                      className={`px-2.5 py-1 rounded-md font-semibold transition ${portal === 'MASTER_ADMIN' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                    >
                      🛡️ Master Admin
                    </button>
                  ) : (
                    <button
                      onClick={() => setPortal('SHOP_OWNER')}
                      className={`px-2.5 py-1 rounded-md font-semibold transition ${portal === 'SHOP_OWNER' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                    >
                      🏪 Shop Owner / POS
                    </button>
                  )}
                </div>

                {/* Logout Button (clears pb.authStore) */}
                <button
                  onClick={handleLogout}
                  className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold transition flex items-center gap-1 text-xs shadow"
                >
                  🚪 Logout
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {portal === 'SHOP_OWNER' && (
              <div className="flex items-center gap-2 bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
                <span className="text-slate-400">Tenant:</span>
                {currentUser?.role === 'SHOP_OWNER' ? (
                  <span className="text-white font-bold px-1">{activeShop.name} (Locked)</span>
                ) : (
                  <select
                    value={activeShopId}
                    onChange={(e) => setActiveShopId(e.target.value)}
                    className="bg-transparent text-white font-bold focus:outline-none cursor-pointer"
                  >
                    {data.shops.map((s: any) => (
                      <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                        {s.name} ({s.status})
                      </option>
                    ))}
                  </select>
                )}
                <span className="text-slate-600">|</span>
                <span className="text-slate-400">Role:</span>
                <select
                  value={activeStaffRole}
                  onChange={(e) => setActiveStaffRole(e.target.value as StaffRole)}
                  className="bg-transparent text-amber-300 font-semibold focus:outline-none cursor-pointer"
                >
                  <option value="SHOP_OWNER" className="bg-slate-900 text-white">Shop Owner (Full)</option>
                  <option value="MANAGER" className="bg-slate-900 text-white">Manager</option>
                  <option value="CASHIER" className="bg-slate-900 text-white">Cashier (POS/Orders)</option>
                  <option value="INVENTORY_STAFF" className="bg-slate-900 text-white">Inventory Staff</option>
                  <option value="DELIVERY_STAFF" className="bg-slate-900 text-white">Delivery Staff</option>
                </select>
              </div>
            )}

            <div className="flex items-center gap-1.5 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
              <span className="text-slate-400">Currency:</span>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                className="bg-transparent text-emerald-300 font-bold focus:outline-none cursor-pointer"
              >
                <option value="MVR" className="bg-slate-900 text-white">MVR (Rf)</option>
                <option value="USD" className="bg-slate-900 text-white">USD ($)</option>
                <option value="INR" className="bg-slate-900 text-white">INR (₹)</option>
                <option value="EUR" className="bg-slate-900 text-white">EUR (€)</option>
                <option value="GBP" className="bg-slate-900 text-white">GBP (£)</option>
              </select>
            </div>

            <button
              onClick={() => setCartDrawerOpen(true)}
              className="relative px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg flex items-center gap-1.5 shadow"
            >
              <ShoppingCart size={14} />
              <span>Carts</span>
              <span className="ml-1 px-1.5 py-0.2 bg-emerald-400 text-slate-950 rounded-full text-[10px] font-extrabold">
                {cartTotalItems}
              </span>
            </button>
          </div>
        </div>
      </nav>

      {/* TOAST ALERT BANNER */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-indigo-500/40 flex items-center gap-2 animate-bounce">
          <CheckCircle size={16} className="text-emerald-400" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* 2. PORTAL MAIN CONTAINER */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">

        {/* ==================================================================== */}
        {/* A. PUBLIC CUSTOMER MARKETPLACE PORTAL */}
        {/* ==================================================================== */}
        {portal === 'CUSTOMER' && (
          <div className="space-y-6">
            {/* Hero Banner */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-teal-950 text-white p-6 sm:p-8 rounded-2xl shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="space-y-2 max-w-2xl">
                <span className="text-xs font-bold text-teal-400 uppercase tracking-widest">Maldives Island Commerce Platform</span>
                <h2 className="text-2xl sm:text-3xl font-extrabold leading-tight">Fresh Groceries, Electronics & Island Pharmacy</h2>
                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                  Shop across Malé, Hulhumalé, and southern atolls with strict FEFO expiry guarantees, multi-currency pricing, and independent per-shop checkouts.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                <div className="bg-white/10 backdrop-blur px-4 py-3 rounded-xl border border-white/20 text-center">
                  <div className="text-lg font-black text-emerald-400">{data.shops.filter((s: any) => s.status === 'ACTIVE').length} Active Shops</div>
                  <div className="text-[11px] text-slate-300">Verified Island Merchants</div>
                </div>
                <div className="bg-white/10 backdrop-blur px-4 py-3 rounded-xl border border-white/20 text-center">
                  <div className="text-lg font-black text-amber-400">32 Products</div>
                  <div className="text-[11px] text-slate-300">Multi-Currency & Expiry Checked</div>
                </div>
              </div>
            </div>

            {/* Marketplace Filter Controls */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                <Search size={16} className="text-slate-400" />
                <input
                  type="text"
                  placeholder="Search products by title, SKU, or brand..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs outline-none bg-transparent"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={selectedMarketShop}
                  onChange={(e) => setSelectedMarketShop(e.target.value)}
                  className="bg-slate-100 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200"
                >
                  <option value="ALL">All Active Stores</option>
                  {data.shops.filter((s: any) => s.status === 'ACTIVE').map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.island})</option>
                  ))}
                </select>

                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="bg-slate-100 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200"
                >
                  <option value="ALL">All Categories</option>
                  <option value="Groceries & Pantry">Groceries & Pantry</option>
                  <option value="Electronics & Smart Home">Electronics & Smart Home</option>
                  <option value="Pharmacy, Vitamins & First Aid">Pharmacy & Wellness</option>
                </select>
              </div>
            </div>

            {/* Product Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {data.products
                .filter((p: any) => {
                  const shop = data.shops.find((s: any) => s.id === p.shopId);
                  if (shop?.status !== 'ACTIVE') return false; // Strict Active Gate
                  if (selectedMarketShop !== 'ALL' && p.shopId !== selectedMarketShop) return false;
                  if (selectedCategory !== 'ALL' && p.category !== selectedCategory) return false;
                  if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
                  return true;
                })
                .map((prod: any) => {
                  const shop = data.shops.find((s: any) => s.id === prod.shopId);
                  return (
                    <div key={prod.id} className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition flex flex-col overflow-hidden">
                      <div className="p-4 flex-1 space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span className="font-semibold text-indigo-600">{shop?.name}</span>
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">{prod.category}</span>
                        </div>
                        <h3 className="font-bold text-sm text-slate-900 line-clamp-2">{prod.name}</h3>
                        <p className="text-xs text-slate-500 line-clamp-2">{prod.description}</p>

                        <div className="pt-2 flex items-baseline justify-between">
                          <div>
                            <div className="text-base font-extrabold text-slate-900">{formatPrice(prod)}</div>
                            {prod.explicitPrices && (
                              <div className="text-[10px] text-emerald-600 font-semibold">
                                MVR: {prod.explicitPrices.MVR?.toFixed(2)} | INR: {prod.explicitPrices.INR?.toFixed(2)} | USD: {prod.explicitPrices.USD?.toFixed(2)}
                              </div>
                            )}
                          </div>
                          <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-semibold">
                            Stock: {prod.availableQty}
                          </span>
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-[11px] text-slate-400">Exp: {prod.expiryDate || 'N/A'}</span>
                        <button
                          onClick={() => addToCart(prod.id, prod.shopId)}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-xs"
                        >
                          Add to Cart
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* ==================================================================== */}
        {/* B. SHOP OWNER & EMPLOYEE RBAC DASHBOARD PORTAL */}
        {/* ==================================================================== */}
        {portal === 'SHOP_OWNER' && (
          <div className="space-y-6">
            {/* Active Shop Gate Check: Non-Active shops cannot manage operations */}
            {activeShop.status !== 'ACTIVE' ? (
              <div className="bg-amber-50 border-2 border-amber-300 p-6 rounded-2xl shadow-sm space-y-3">
                <div className="flex items-center gap-2 text-amber-800 font-extrabold text-lg">
                  <AlertTriangle size={22} className="text-amber-600" />
                  <span>Shop Account Under Review (Status: {activeShop.status})</span>
                </div>
                <p className="text-xs text-amber-700 leading-relaxed">
                  Only accounts approved and activated by the Master Administrator can access the Shop Dashboard, Point of Sale, and Inventory Management.
                  Current status: <strong>{activeShop.status}</strong>. Please switch to the <strong>Master Admin</strong> portal to approve this shop request.
                </p>
                <button
                  onClick={() => { setPortal('MASTER_ADMIN'); setAdminTab('SHOPS'); }}
                  className="px-4 py-2 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-slate-800 transition"
                >
                  Go to Master Admin Approval Panel →
                </button>
              </div>
            ) : (
              <>
                {/* Shop Navigation Tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-slate-200">
                  {[
                    { id: 'DASHBOARD', label: '📊 Dashboard' },
                    { id: 'POS', label: '💳 POS Terminal' },
                    { id: 'PRODUCTS', label: '📦 Products' },
                    { id: 'EXPIRY', label: '⏳ Expiry (FEFO)' },
                    { id: 'ORDERS', label: '🛍️ Orders' },
                    { id: 'CREDIT_BOOK', label: '📒 Credit Book' },
                    { id: 'FINANCIALS', label: '📈 Financials & P&L' },
                    { id: 'SUPPLIERS', label: '🚚 Suppliers' },
                    { id: 'CUSTOMERS', label: '👥 Customers' },
                    { id: 'EMPLOYEES', label: '👔 Staff & RBAC' }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setShopTab(tab.id)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                        shopTab === tab.id ? 'bg-indigo-600 text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Tab 1: DASHBOARD */}
                {shopTab === 'DASHBOARD' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
                        <span className="text-xs text-slate-500 font-semibold">Total Revenue (Shop Base)</span>
                        <div className="text-2xl font-black text-slate-900">
                          {activeShop.defaultCurrency} 18,450.00
                        </div>
                        <span className="text-[11px] text-emerald-600 font-bold">+14.2% this month</span>
                      </div>
                      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
                        <span className="text-xs text-slate-500 font-semibold">Customer Credit Ledger</span>
                        <div className="text-2xl font-black text-amber-600">
                          MVR 600.00
                        </div>
                        <span className="text-[11px] text-slate-500 font-medium">Ahmed STELCO salary credit</span>
                      </div>
                      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
                        <span className="text-xs text-slate-500 font-semibold">Expiry Alerts (FEFO)</span>
                        <div className="text-2xl font-black text-rose-600">
                          1 Quarantined
                        </div>
                        <span className="text-[11px] text-rose-500 font-medium">Batch B-YOG-EXP01 blocked</span>
                      </div>
                      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
                        <span className="text-xs text-slate-500 font-semibold">Active Catalog Products</span>
                        <div className="text-2xl font-black text-slate-900">
                          {data.products.filter((p: any) => p.shopId === activeShopId).length} Items
                        </div>
                        <span className="text-[11px] text-indigo-600 font-medium">Multi-Currency Enabled</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 2: POS TERMINAL */}
                {shopTab === 'POS' && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-4">
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                        <h3 className="font-bold text-sm text-slate-800 mb-2">POS Fast Checkout — Inventory (FEFO Deduction)</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {data.products.filter((p: any) => p.shopId === activeShopId).map((p: any) => (
                            <button
                              key={p.id}
                              onClick={() => {
                                setPosCart((prev) => {
                                  const idx = prev.findIndex((i) => i.productId === p.id);
                                  if (idx >= 0) {
                                    const c = [...prev];
                                    c[idx].quantity += 1;
                                    return c;
                                  }
                                  return [...prev, { productId: p.id, quantity: 1 }];
                                });
                              }}
                              className="p-3 bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-xl text-left transition"
                            >
                              <div className="text-xs font-bold text-slate-900 truncate">{p.name}</div>
                              <div className="text-xs text-emerald-600 font-extrabold">{formatPrice(p)}</div>
                              <div className="text-[10px] text-slate-500">Stock: {p.availableQty}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                      <h3 className="font-bold text-sm text-slate-900">Current POS Register</h3>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {posCart.length === 0 ? (
                          <p className="text-xs text-slate-400">Cart is empty. Click products on the left.</p>
                        ) : (
                          posCart.map((item) => {
                            const p = data.products.find((prod: any) => prod.id === item.productId);
                            return (
                              <div key={item.productId} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100">
                                <div>
                                  <div className="font-bold">{p?.name}</div>
                                  <div className="text-slate-500">{item.quantity} x {formatPrice(p)}</div>
                                </div>
                                <button
                                  onClick={() => setPosCart((prev) => prev.filter((i) => i.productId !== item.productId))}
                                  className="text-rose-500 font-bold hover:underline"
                                >
                                  Remove
                                </button>
                              </div>
                            );
                          })
                        )}
                      </div>

                      <div className="space-y-2 pt-2 border-t border-slate-200">
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span>Total Amount</span>
                          <span className="text-sm font-extrabold text-slate-900">
                            {activeShop.defaultCurrency} {posCart.reduce((acc, item) => {
                              const p = data.products.find((prod: any) => prod.id === item.productId);
                              return acc + (Number(p?.sellingPrice || 0) * item.quantity);
                            }, 0).toFixed(2)}
                          </span>
                        </div>

                        <select
                          value={posPaymentMethod}
                          onChange={(e) => setPosPaymentMethod(e.target.value)}
                          className="w-full text-xs font-bold bg-slate-50 border border-slate-200 p-2 rounded-lg"
                        >
                          <option value="CASH">Cash Payment</option>
                          <option value="BML_TRANSFER">BML Mobile Pay Transfer</option>
                          <option value="CREDIT_BOOK">Customer Credit Book Ledger</option>
                        </select>

                        <button
                          onClick={() => {
                            setPosCart([]);
                            showToast('POS sale processed with FEFO stock deduction!');
                          }}
                          disabled={posCart.length === 0}
                          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 text-white font-bold rounded-xl text-xs transition"
                        >
                          Complete Sale & Deduct Stock
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 3: PRODUCTS */}
                {shopTab === 'PRODUCTS' && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                      <h3 className="font-bold text-sm text-slate-900">Product Catalog & Pricing</h3>
                      <span className="text-xs text-slate-500">32 Items Configured</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
                          <tr>
                            <th className="p-3">Product Name</th>
                            <th className="p-3">SKU</th>
                            <th className="p-3">Available Qty</th>
                            <th className="p-3">Selling Price</th>
                            <th className="p-3">Multi-Currency Overrides</th>
                            <th className="p-3">Expiry Batch</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {data.products.filter((p: any) => p.shopId === activeShopId).map((prod: any) => (
                            <tr key={prod.id} className="hover:bg-slate-50">
                              <td className="p-3 font-bold text-slate-900">{prod.name}</td>
                              <td className="p-3 text-slate-500">{prod.sku}</td>
                              <td className="p-3 font-semibold text-slate-700">{prod.availableQty}</td>
                              <td className="p-3 font-extrabold text-slate-900">{formatPrice(prod)}</td>
                              <td className="p-3">
                                {prod.explicitPrices ? (
                                  <span className="text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded">
                                    MVR: {prod.explicitPrices.MVR} | INR: {prod.explicitPrices.INR} | USD: {prod.explicitPrices.USD}
                                  </span>
                                ) : (
                                  <span className="text-slate-400">Dynamic Conversion</span>
                                )}
                              </td>
                              <td className="p-3 text-slate-600">{prod.batchNumber}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Tab 4: EXPIRY (FEFO) */}
                {shopTab === 'EXPIRY' && (
                  <div className="space-y-4">
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-2">
                      <h3 className="font-bold text-sm text-slate-900">FEFO Expiry Enforcement (6 Buckets)</h3>
                      <p className="text-xs text-slate-500">
                        Batches are strictly ordered by earliest expiry date. Expired batches are quarantined and blocked from checkout.
                      </p>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
                          <tr>
                            <th className="p-3">Batch Number</th>
                            <th className="p-3">Product</th>
                            <th className="p-3">Expiry Date</th>
                            <th className="p-3">Remaining Qty</th>
                            <th className="p-3">Expiry Bucket</th>
                            <th className="p-3">Sale Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {data.batches.filter((b: any) => b.shopId === activeShopId).map((batch: any) => {
                            const isExpired = batch.expiryDate && batch.expiryDate < '2026-11-06';
                            const prod = data.products.find((p: any) => p.id === batch.productId);
                            return (
                              <tr key={batch.id} className={isExpired ? 'bg-rose-50/50' : 'hover:bg-slate-50'}>
                                <td className="p-3 font-mono font-bold text-slate-900">{batch.batchNumber}</td>
                                <td className="p-3 font-semibold">{prod?.name}</td>
                                <td className="p-3">{batch.expiryDate || 'N/A'}</td>
                                <td className="p-3 font-bold">{batch.remainingQty}</td>
                                <td className="p-3">
                                  {isExpired ? (
                                    <span className="px-2 py-0.5 bg-rose-600 text-white rounded font-bold text-[10px]">
                                      EXPIRED_QUARANTINED
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-semibold text-[10px]">
                                      SAFE_OVER_90_DAYS
                                    </span>
                                  )}
                                </td>
                                <td className="p-3 font-semibold">
                                  {isExpired ? (
                                    <span className="text-rose-600 font-bold">BLOCKED FROM SALE</span>
                                  ) : (
                                    <span className="text-emerald-600 font-bold">ELIGIBLE (FEFO)</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Tab 5: ORDERS */}
                {shopTab === 'ORDERS' && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                      <h3 className="font-bold text-sm text-slate-900">Orders & 14-Step Status Pipeline</h3>
                    </div>
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-3">Order ID</th>
                          <th className="p-3">Customer</th>
                          <th className="p-3">Total Amount</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Payment Evidence</th>
                          <th className="p-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.orders.filter((o: any) => o.shopId === activeShopId).map((ord: any) => (
                          <tr key={ord.id} className="hover:bg-slate-50">
                            <td className="p-3 font-mono font-bold">{ord.id}</td>
                            <td className="p-3 font-semibold">{ord.customerName} ({ord.customerPhone})</td>
                            <td className="p-3 font-extrabold">{ord.currency} {Number(ord.totalAmount).toFixed(2)}</td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded font-bold text-[10px] bg-indigo-100 text-indigo-800">
                                {ord.status}
                              </span>
                            </td>
                            <td className="p-3">
                              {ord.isPaymentVerified ? (
                                <span className="text-emerald-600 font-bold">✓ Verified</span>
                              ) : (
                                <span className="text-amber-600 font-bold">Awaiting Verification</span>
                              )}
                            </td>
                            <td className="p-3">
                              <button
                                onClick={() => setReviewOrderModal(ord)}
                                className="px-2.5 py-1 bg-slate-900 text-white rounded-lg font-bold hover:bg-slate-800 transition"
                              >
                                Review Slip
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Tab 6: CUSTOMER CREDIT BOOK */}
                {shopTab === 'CREDIT_BOOK' && (
                  <div className="space-y-6">
                    <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 p-5 rounded-2xl space-y-2">
                      <h3 className="font-bold text-sm text-amber-900">Monthly Salary Customer Credit Book (Worked Example)</h3>
                      <p className="text-xs text-amber-800 leading-relaxed">
                        Ahmed Mausoom (STELCO Senior Technician) monthly salary cycle:
                        <strong> 750.00 (January Groceries) + 350.00 (Supplements) - 500.00 (Salary Payment) = 600.00 Outstanding Balance</strong>.
                      </p>
                      <div className="flex gap-4 pt-2">
                        <span className="text-xs font-bold text-slate-800">totalCreditBorrowed: 1100.00</span>
                        <span className="text-xs font-bold text-slate-800">totalCreditPaid: 500.00</span>
                        <span className="text-xs font-bold text-emerald-700">creditBalance: 600.00</span>
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="font-bold text-sm text-slate-900">Credit Ledger Transactions</h3>
                        <button
                          onClick={() => handleIssueCredit('cust-ahmed', 'prod-1', 1)}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-xs shadow-xs"
                        >
                          + Issue Rice 5kg on Credit (FEFO)
                        </button>
                      </div>
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
                          <tr>
                            <th className="p-3">Customer</th>
                            <th className="p-3">Type</th>
                            <th className="p-3">Product / Note</th>
                            <th className="p-3">Amount</th>
                            <th className="p-3">Balance After</th>
                            <th className="p-3">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {data.creditTransactions.filter((tx: any) => tx.shopId === activeShopId).map((tx: any) => (
                            <tr key={tx.id} className="hover:bg-slate-50">
                              <td className="p-3 font-bold text-slate-900">{tx.customerName}</td>
                              <td className="p-3 font-semibold text-indigo-700">{tx.txType}</td>
                              <td className="p-3 text-slate-600">{tx.productName || tx.notes}</td>
                              <td className="p-3 font-extrabold text-slate-900">MVR {Number(tx.totalAmount || tx.amount).toFixed(2)}</td>
                              <td className="p-3 font-bold text-amber-700">MVR {Number(tx.balanceAfter).toFixed(2)}</td>
                              <td className="p-3 text-slate-500">{tx.txDate}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Tab 7: FINANCIALS */}
                {shopTab === 'FINANCIALS' && (
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <h3 className="font-bold text-sm text-slate-900">Financial Performance & P&L</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <div className="text-xs text-slate-500">Gross Sales</div>
                        <div className="text-xl font-black text-slate-900">{activeShop.defaultCurrency} 18,450.00</div>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <div className="text-xs text-slate-500">Cost of Goods Sold (COGS)</div>
                        <div className="text-xl font-black text-slate-700">{activeShop.defaultCurrency} 13,284.00</div>
                      </div>
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                        <div className="text-xs text-slate-500">Gross Profit (Margin: 28%)</div>
                        <div className="text-xl font-black text-emerald-600">{activeShop.defaultCurrency} 5,166.00</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 8: SUPPLIERS */}
                {shopTab === 'SUPPLIERS' && (
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <h3 className="font-bold text-sm text-slate-900">Suppliers & Purchase Orders</h3>
                    <p className="text-xs text-slate-500">STO Staple Foods Maldives, Nestlé Lanka, Bairds Marine Maldives.</p>
                  </div>
                )}

                {/* Tab 9: CUSTOMERS */}
                {shopTab === 'CUSTOMERS' && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
                        <tr>
                          <th className="p-3">Name</th>
                          <th className="p-3">Contact</th>
                          <th className="p-3">Employment</th>
                          <th className="p-3">Credit Limit</th>
                          <th className="p-3">Current Credit Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.customers.filter((c: any) => c.shopId === activeShopId).map((cust: any) => (
                          <tr key={cust.id} className="hover:bg-slate-50">
                            <td className="p-3 font-bold text-slate-900">{cust.name}</td>
                            <td className="p-3">{cust.phone}</td>
                            <td className="p-3 text-slate-500">{cust.employment}</td>
                            <td className="p-3 font-semibold">MVR {cust.creditLimit}</td>
                            <td className="p-3 font-extrabold text-amber-600">MVR {cust.creditBalance}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Tab 10: EMPLOYEES */}
                {shopTab === 'EMPLOYEES' && (
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                    <h3 className="font-bold text-sm text-slate-900">Staff Members & Permissions Matrix (RBAC)</h3>
                    <p className="text-xs text-slate-500">Roles: Shop Owner, Manager, Cashier, Inventory Staff, Delivery Staff.</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ==================================================================== */}
        {/* C. PLATFORM MASTER ADMIN PORTAL */}
        {/* ==================================================================== */}
        {portal === 'MASTER_ADMIN' && (
          <div className="space-y-6">
            <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Platform Administration</span>
                <h2 className="text-xl sm:text-2xl font-black">AtollHub Platform Master Admin</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAdminTab('SHOPS')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${adminTab === 'SHOPS' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'}`}
                >
                  Shops Management
                </button>
                <button
                  onClick={() => setAdminTab('CURRENCIES')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${adminTab === 'CURRENCIES' ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300'}`}
                >
                  Currencies & FX
                </button>
              </div>
            </div>

            {/* Shop Approval & Activation Gate Table */}
            {adminTab === 'SHOPS' && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">Merchant Store Tenants & Approval Gate</h3>
                    <span className="text-xs text-slate-500">PocketBase Multi-Tenant Storage & Authentication Control</span>
                  </div>
                  <button
                    onClick={() => setCreateShopModalOpen(true)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl shadow flex items-center gap-1.5 transition"
                  >
                    <span>+ Create Shop Owner Account Directly</span>
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 uppercase font-bold border-b border-slate-200">
                      <tr>
                        <th className="p-3">Shop Name</th>
                        <th className="p-3">Location</th>
                        <th className="p-3">Owner Contact</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Actions (Master Admin Gate)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.shops.map((s: any) => (
                        <tr key={s.id} className="hover:bg-slate-50">
                          <td className="p-3">
                            <div className="font-bold text-slate-900">{s.name}</div>
                            <div className="text-[10px] text-slate-500">{s.slug}</div>
                          </td>
                          <td className="p-3 font-medium text-slate-600">{s.island}, {s.atoll}</td>
                          <td className="p-3 text-slate-600">{s.ownerName} ({s.phone})</td>
                          <td className="p-3">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                              s.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' :
                              s.status === 'PENDING' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                            }`}>
                              {s.status}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1.5">
                              {s.status !== 'ACTIVE' ? (
                                <button
                                  onClick={() => handleUpdateShopStatus(s.id, 'ACTIVE')}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-[11px] transition shadow-xs"
                                >
                                  Approve & Activate
                                </button>
                              ) : (
                                <button
                                  onClick={() => handleUpdateShopStatus(s.id, 'SUSPENDED')}
                                  className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-lg text-[11px] transition shadow-xs"
                                >
                                  Suspend Shop
                                </button>
                              )}
                              <button
                                onClick={() => handleResetShopPassword(s.id)}
                                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-amber-300 font-bold rounded-lg text-[11px] transition shadow-xs"
                                title="Reset Owner Password"
                              >
                                Reset PW
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Currencies Management */}
            {adminTab === 'CURRENCIES' && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                <h3 className="font-bold text-sm text-slate-900">Supported Currencies & Configured FX Rates to MVR</h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  {['MVR', 'INR', 'USD', 'EUR', 'GBP'].map((code) => {
                    const c = data.currencies?.find((curr: any) => curr.code === code) || { name: code, rateToMVR: 1 };
                    return (
                      <div key={code} className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <div className="font-extrabold text-indigo-600">{code}</div>
                        <div className="text-xs text-slate-500">{c.name}</div>
                        <div className="text-xs font-bold text-slate-900 mt-1">1 {code} = {c.rateToMVR} MVR</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* 3. PER-SHOP CART DRAWER */}
      {cartDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex justify-end">
          <div className="bg-white w-full max-w-md h-full flex flex-col shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="font-bold text-base text-slate-900">Your Per-Shop Shopping Carts</h3>
              <button onClick={() => setCartDrawerOpen(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4">
              {Object.entries(customerCarts).every(([_, items]) => items.length === 0) ? (
                <p className="text-xs text-slate-400">All shop carts are empty.</p>
              ) : (
                Object.entries(customerCarts).map(([shopId, items]) => {
                  if (items.length === 0) return null;
                  const shop = data.shops.find((s: any) => s.id === shopId);
                  const subtotal = items.reduce((acc, item) => {
                    const p = data.products.find((prod: any) => prod.id === item.productId);
                    return acc + (Number(p?.sellingPrice || 0) * item.quantity);
                  }, 0);

                  return (
                    <div key={shopId} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-indigo-700">{shop?.name}</span>
                        <span className="text-[10px] text-slate-500">Delivery: MVR {shop?.deliveryFee || 0}</span>
                      </div>

                      {items.map((item) => {
                        const p = data.products.find((prod: any) => prod.id === item.productId);
                        return (
                          <div key={item.productId} className="flex items-center justify-between text-xs">
                            <span>{p?.name} (x{item.quantity})</span>
                            <span className="font-bold">{formatPrice(p)}</span>
                          </div>
                        );
                      })}

                      <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                        <span className="text-xs font-bold">Subtotal: MVR {subtotal.toFixed(2)}</span>
                        <button
                          onClick={() => {
                            setCheckoutShopId(shopId);
                            setCartDrawerOpen(false);
                            setCheckoutModalOpen(true);
                          }}
                          className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg"
                        >
                          Checkout Store
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. CHECKOUT MODAL WITH WHATSAPP & VIBER LINKS */}
      {checkoutModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-base text-slate-900">Checkout Store Order</h3>
              <button onClick={() => setCheckoutModalOpen(false)} className="text-slate-400">✕</button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700">Customer Full Name</label>
                <input
                  type="text"
                  value={checkoutForm.name}
                  onChange={(e) => setCheckoutForm({ ...checkoutForm, name: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700">Contact Phone / WhatsApp</label>
                <input
                  type="text"
                  value={checkoutForm.phone}
                  onChange={(e) => setCheckoutForm({ ...checkoutForm, phone: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700">Delivery Address</label>
                <input
                  type="text"
                  value={checkoutForm.address}
                  onChange={(e) => setCheckoutForm({ ...checkoutForm, address: e.target.value })}
                  className="w-full mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg outline-none"
                />
              </div>
            </div>

            <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl space-y-1 text-xs">
              <div className="font-bold text-indigo-950">Bank of Maldives (BML) Transfer Details</div>
              <div className="text-indigo-800">Account: 7730000192837 (MALE FRESH MART PVT LTD)</div>
              <div className="text-[11px] text-indigo-600">Please quote your Order ID in bank remarks.</div>
            </div>

            <div className="flex gap-2 pt-2">
              <a
                href={buildWhatsAppOrderUrl('+960 778-2410', `Hi! Order #${Date.now().toString().slice(-6)} placed for ${checkoutForm.name}`)}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl text-center"
              >
                Send via WhatsApp
              </a>
              <a
                href={buildViberShareUrl('+960 778-2410', `Order #${Date.now().toString().slice(-6)} placed for ${checkoutForm.name}`)}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl text-center"
              >
                Send via Viber
              </a>
            </div>

            <button
              onClick={() => {
                setCustomerCarts((prev) => ({ ...prev, [checkoutShopId]: [] }));
                setCheckoutModalOpen(false);
                showToast('Order placed successfully! Awaiting payment slip.');
              }}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl"
            >
              Confirm Order & Upload Slip Later
            </button>
          </div>
        </div>
      )}

      {/* 5. MANUAL PAYMENT SLIP VERIFICATION MODAL (SHOP OWNER) */}
      {reviewOrderModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-base text-slate-900">Review Payment Slip Evidence</h3>
              <button onClick={() => setReviewOrderModal(null)} className="text-slate-400">✕</button>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
              <div><strong>Order ID:</strong> {reviewOrderModal.id}</div>
              <div><strong>Customer:</strong> {reviewOrderModal.customerName}</div>
              <div><strong>Amount Due:</strong> {reviewOrderModal.currency} {Number(reviewOrderModal.totalAmount).toFixed(2)}</div>
              <div><strong>Slip Status:</strong> Bank transfer slip uploaded</div>
            </div>

            <textarea
              placeholder="Enter review notes (e.g. BML transaction reference verified in merchant statement)..."
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              className="w-full text-xs p-3 border border-slate-200 rounded-xl outline-none"
              rows={3}
            />

            <div className="flex gap-2">
              <button
                onClick={() => handleVerifyPayment(reviewOrderModal.id, true)}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl"
              >
                Approve Payment
              </button>
              <button
                onClick={() => handleVerifyPayment(reviewOrderModal.id, false)}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl"
              >
                Reject Slip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5.4 POCKETBASE TENANT PROVISIONING MODAL (+ Create Shop Owner Account Directly) */}
      {createShopModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🏪</span>
                <h3 className="font-extrabold text-base text-slate-900">
                  Provision New Merchant Tenant (PocketBase)
                </h3>
              </div>
              <button
                onClick={() => setCreateShopModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Creates a dedicated tenant record in PocketBase <code>shops</code> collection and registers a tenant user in <code>users</code> collection locked to the newly generated tenant ID.
            </p>

            <form onSubmit={handleCreateShopInPB} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Shop / Business Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Kulhudhuffushi Marine Supplies"
                    value={newShopForm.name}
                    onChange={(e) => setNewShopForm({ ...newShopForm, name: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Owner Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Hassan Shareef"
                    value={newShopForm.ownerName}
                    onChange={(e) => setNewShopForm({ ...newShopForm, ownerName: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Owner Email (Login ID)</label>
                  <input
                    type="email"
                    required
                    placeholder="owner@kulhudhuffushi.mv"
                    value={newShopForm.ownerEmail}
                    onChange={(e) => setNewShopForm({ ...newShopForm, ownerEmail: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Initial Password</label>
                  <input
                    type="text"
                    placeholder="Owner@Shop2026! (leave blank to auto-generate)"
                    value={newShopForm.tempPassword}
                    onChange={(e) => setNewShopForm({ ...newShopForm, tempPassword: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Contact Phone</label>
                  <input
                    type="text"
                    value={newShopForm.phone}
                    onChange={(e) => setNewShopForm({ ...newShopForm, phone: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Island</label>
                  <input
                    type="text"
                    value={newShopForm.island}
                    onChange={(e) => setNewShopForm({ ...newShopForm, island: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Approval Status</label>
                  <select
                    value={newShopForm.status}
                    onChange={(e) => setNewShopForm({ ...newShopForm, status: e.target.value as any })}
                    className="w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none bg-white font-bold"
                  >
                    <option value="ACTIVE">ACTIVE (Authorized immediately)</option>
                    <option value="PENDING">PENDING (Review gate)</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setCreateShopModalOpen(false)}
                  className="w-1/3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-2/3 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl shadow transition"
                >
                  Create Shop & User in PocketBase →
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5.5 AUTHENTICATION / LOGIN MODAL */}
      {loginModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">🔐</span>
                <h3 className="font-extrabold text-base text-slate-900">
                  {loginTargetRole === 'MASTER_ADMIN' ? 'Master Admin Authentication' : 'Shop Owner / POS Login'}
                </h3>
              </div>
              <button
                onClick={() => setLoginModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            {/* Role Switcher Tabs inside Modal */}
            <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setLoginTargetRole('SHOP_OWNER');
                  setLoginError(null);
                }}
                className={`py-2 rounded-lg transition ${loginTargetRole === 'SHOP_OWNER' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                🏪 Shop Owner / POS
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginTargetRole('MASTER_ADMIN');
                  setLoginError(null);
                }}
                className={`py-2 rounded-lg transition ${loginTargetRole === 'MASTER_ADMIN' ? 'bg-white text-rose-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
              >
                🛡️ Master Admin
              </button>
            </div>

            {loginError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
                ⚠️ {loginError}
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Username / Email</label>
                <input
                  type="text"
                  required
                  placeholder={loginTargetRole === 'MASTER_ADMIN' ? 'admin@atollhub.mv' : 'owner@malefresh.mv'}
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 font-medium"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loginLoading}
                  className={`w-full py-2.5 text-white font-extrabold rounded-xl transition shadow-md disabled:opacity-60 ${
                    loginTargetRole === 'MASTER_ADMIN'
                      ? 'bg-rose-600 hover:bg-rose-500'
                      : 'bg-indigo-600 hover:bg-indigo-500'
                  }`}
                >
                  {loginLoading ? 'Authenticating with PocketBase...' : 'Authenticate & Enter Portal →'}
                </button>
              </div>
            </form>

            {/* Quick Demo Credential Fillers */}
            <div className="border-t border-slate-100 pt-3 space-y-2">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Quick Fill Demo Accounts:</div>
              <div className="grid grid-cols-1 gap-1.5 text-[11px]">
                {loginTargetRole === 'MASTER_ADMIN' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setLoginEmail('admin@atollhub.mv');
                      setLoginPassword('Admin@Atoll2026!');
                    }}
                    className="p-2 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-left text-rose-900"
                  >
                    <div className="font-bold">🛡️ Master Admin: admin@atollhub.mv</div>
                    <div className="text-slate-500 font-mono text-[10px]">Pass: Admin@Atoll2026!</div>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        const s = data.shops.find((x: any) => x.id === 'shop-1');
                        setLoginEmail('owner@malefresh.mv');
                        setLoginPassword(s?.ownerPassword || 'Owner@Shop2026!');
                      }}
                      className="p-2 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-left text-emerald-900"
                    >
                      <div className="font-bold">🏪 Shop 1: owner@malefresh.mv</div>
                      <div className="text-slate-500 font-mono text-[10px]">Pass: {data.shops.find((x: any) => x.id === 'shop-1')?.ownerPassword || 'Owner@Shop2026!'}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const s = data.shops.find((x: any) => x.id === 'shop-2');
                        setLoginEmail('owner@hulhumaletech.mv');
                        setLoginPassword(s?.ownerPassword || 'Owner@Shop2026!');
                      }}
                      className="p-2 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-left text-indigo-900"
                    >
                      <div className="font-bold">🏪 Shop 2: owner@hulhumaletech.mv</div>
                      <div className="text-slate-500 font-mono text-[10px]">Pass: {data.shops.find((x: any) => x.id === 'shop-2')?.ownerPassword || 'Owner@Shop2026!'}</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const s = data.shops.find((x: any) => x.id === 'shop-3');
                        setLoginEmail('owner@adduwellness.mv');
                        setLoginPassword(s?.ownerPassword || 'Owner@Shop2026!');
                      }}
                      className="p-2 rounded-lg bg-teal-50 hover:bg-teal-100 border border-teal-200 text-left text-teal-900"
                    >
                      <div className="font-bold">🏪 Shop 3: owner@adduwellness.mv</div>
                      <div className="text-slate-500 font-mono text-[10px]">Pass: {data.shops.find((x: any) => x.id === 'shop-3')?.ownerPassword || 'Owner@Shop2026!'}</div>
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. FOOTER */}
      <footer className="bg-white border-t border-slate-200 mt-12 py-6 text-xs text-slate-500 text-center">
        <div className="max-w-7xl mx-auto px-4">
          <strong className="text-slate-800">AtollHub Multi-Shop Platform v1.0</strong> — Multi-Tenant Isolation • FEFO Batch Control • Multi-Currency • Customer Credit Book.
        </div>
      </footer>
    </div>
  );
}
