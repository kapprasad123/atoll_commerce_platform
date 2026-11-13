# PocketBase Backend Architecture & Setup Guide

The AtollHub Multi-Shop E-Commerce, POS & FEFO Inventory platform connects seamlessly to PocketBase via the official `pocketbase` JavaScript SDK.

## 1. Client Configuration
- **Default Endpoint:** `http://127.0.0.1:8090` (configured via `VITE_PB_URL` environment variable).
- **Client Instantiation:**
  ```typescript
  import PocketBase from 'pocketbase';
  export const pb = new PocketBase(import.meta.env.VITE_PB_URL || 'http://127.0.0.1:8090');
  ```

## 2. Role-Based Access Control (RBAC) & Authentication

### A. Master Administrator
- **Collection:** `_superusers` (with `admins` fallback on legacy PocketBase versions).
- **Method:** `pb.collection('_superusers').authWithPassword(email, password)`
- **Access Level:** Unlocks Master Administrator Control Panel, cross-tenant merchant provisioning, platform category management, and currency exchange rates.
- **Default Master Admin Credentials:**
  - **Email:** `admin@atollhub.mv`
  - **Password:** `Admin@Atoll2026!`

### B. Shop Owners & Staff
- **Collection:** `users`
- **Method:** `pb.collection('users').authWithPassword(email, password)`
- **Tenant Lock:** Upon authentication, the frontend reads `pb.authStore.record.role` and `pb.authStore.record.shop_id`. The user session is strictly locked to that shop tenant. Cross-tenant access is blocked.
- **Configured Shop Accounts:**
  - `owner@malefresh.mv` / `Owner@Shop2026!` (Shop 1: Malé Fresh Mart)
  - `owner@hulhumaletech.mv` / `Owner@Shop2026!` (Shop 2: Hulhumalé Tech Hub)
  - `owner@adduwellness.mv` / `Owner@Shop2026!` (Shop 3: Addu Wellness Pharmacy)

## 3. Public Customer Marketplace
- Any unauthenticated visitor directly enters the Customer Marketplace view.
- Open role-switching buttons (`Master Admin`, `Shop Owner / POS`) and the `Reset Demo` button are hidden from unauthenticated visitors.
- Visitors can freely browse products, search, filter by atoll/island, change currencies (MVR, USD, INR, EUR, GBP), add to per-shop carts, and submit customer orders.

## 4. Master Admin Tenant Provisioning
- **Create Shop Directly:** The `+ Create Shop Owner Account Directly` modal creates both:
  1. A tenant record in `pb.collection('shops')`.
  2. A merchant user record in `pb.collection('users')` with `role: 'SHOP_OWNER'` and `shop_id` mapped to the shop.
- **Approve / Suspend:** Updates `status` in `pb.collection('shops')`.
- **Reset PW:** Updates password credentials in `pb.collection('users')`.

## 5. Session & Logout
- When logged in, the user's email, assigned shop badge, and portal buttons are displayed in the header.
- Clicking **`Logout`** executes `pb.authStore.clear()`, removes all tokens, and returns the session immediately to the Customer Marketplace.

