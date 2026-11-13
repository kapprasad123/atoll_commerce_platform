-- ============================================================================
-- ATOLLHUB MULTI-SHOP E-COMMERCE, POS & INVENTORY MANAGEMENT PLATFORM
-- Migration 001: Complete Multi-Tenant Relational PostgreSQL Schema
-- Enforces strict tenant isolation (shop_id), historical financial immutability,
-- FEFO batch inventory tracking, and reversal-only accounting ledgers.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. CURRENCIES & EXCHANGE RATES
-- ----------------------------------------------------------------------------
CREATE TABLE currencies (
    code VARCHAR(10) PRIMARY KEY, -- MVR, INR, USD, EUR, GBP, etc.
    name VARCHAR(100) NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    decimal_places SMALLINT NOT NULL DEFAULT 2 CHECK (decimal_places BETWEEN 0 AND 4),
    is_base_currency BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE exchange_rates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_currency VARCHAR(10) NOT NULL REFERENCES currencies(code),
    to_currency VARCHAR(10) NOT NULL REFERENCES currencies(code),
    rate NUMERIC(18, 6) NOT NULL CHECK (rate > 0),
    source VARCHAR(50) NOT NULL DEFAULT 'MANUAL', -- MANUAL | API
    effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by_user_id UUID NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (from_currency, to_currency, effective_from)
);

-- ----------------------------------------------------------------------------
-- 2. PLATFORM SETTINGS & GLOBAL CATEGORIES
-- ----------------------------------------------------------------------------
CREATE TABLE platform_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_by UUID NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE platform_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(120) NOT NULL UNIQUE,
    slug VARCHAR(140) NOT NULL UNIQUE,
    description TEXT,
    icon_name VARCHAR(60) DEFAULT 'Package',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. MASTER ADMINISTRATORS
-- ----------------------------------------------------------------------------
CREATE TABLE master_administrators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    phone VARCHAR(40),
    is_super_admin BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 4. SHOPS & SHOP OWNERS (STRICT MULTI-TENANT ROOT)
-- ----------------------------------------------------------------------------
CREATE TYPE shop_status_enum AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED');

CREATE TABLE shop_owners (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(40) NOT NULL,
    whatsapp_number VARCHAR(40),
    viber_number VARCHAR(40),
    national_id_ref VARCHAR(80),
    password_hash TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    must_reset_password BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at TIMESTAMPTZ,
    created_by_admin_id UUID REFERENCES master_administrators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE shops (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES shop_owners(id) ON DELETE RESTRICT,
    name VARCHAR(180) NOT NULL,
    slug VARCHAR(180) NOT NULL UNIQUE,
    tagline VARCHAR(255),
    description TEXT,
    logo_url TEXT,
    banner_url TEXT,
    primary_category_id UUID REFERENCES platform_categories(id),
    status shop_status_enum NOT NULL DEFAULT 'PENDING',
    status_reason TEXT,
    approved_by_admin_id UUID REFERENCES master_administrators(id),
    approved_at TIMESTAMPTZ,
    default_currency VARCHAR(10) NOT NULL DEFAULT 'MVR' REFERENCES currencies(code),
    allow_negative_stock BOOLEAN NOT NULL DEFAULT FALSE,
    vacation_mode BOOLEAN NOT NULL DEFAULT FALSE,
    vacation_message TEXT,
    opening_hours JSONB NOT NULL DEFAULT '{"mon_thu":"08:00 - 22:00","fri":"14:00 - 23:00","sat_sun":"08:00 - 22:30"}'::jsonb,
    contact_phone VARCHAR(40) NOT NULL,
    whatsapp_number VARCHAR(40) NOT NULL,
    viber_number VARCHAR(40),
    email VARCHAR(255),
    island_city VARCHAR(120) NOT NULL,
    atoll VARCHAR(120),
    address_line TEXT NOT NULL,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    bank_name VARCHAR(120),
    bank_account_holder VARCHAR(150),
    bank_account_number VARCHAR(80),
    payment_instructions TEXT,
    supported_payment_methods JSONB NOT NULL DEFAULT '["BANK_TRANSFER","CASH_ON_DELIVERY","QR_PAY","CUSTOMER_CREDIT"]'::jsonb,
    delivery_zones JSONB NOT NULL DEFAULT '[{"zone":"Local Island Delivery","fee":15.00,"free_above":300.00},{"zone":"Speedboat / Ferry Jetty Drop","fee":25.00,"free_above":500.00},{"zone":"In-Store Pickup","fee":0.00,"free_above":0.00}]'::jsonb,
    invoice_prefix VARCHAR(20) NOT NULL DEFAULT 'INV',
    next_invoice_seq INT NOT NULL DEFAULT 1001,
    qr_code_payload TEXT,
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shops_status ON shops(status);
CREATE INDEX idx_shops_owner ON shops(owner_id);
CREATE INDEX idx_shops_search ON shops USING gin (to_tsvector('english', name || ' ' || island_city || ' ' || COALESCE(atoll, '')));

-- ----------------------------------------------------------------------------
-- 5. ROLES, PERMISSIONS & SHOP EMPLOYEES (RBAC)
-- ----------------------------------------------------------------------------
CREATE TYPE employee_role_enum AS ENUM ('SHOP_OWNER', 'MANAGER', 'CASHIER', 'INVENTORY_STAFF', 'DELIVERY_STAFF');

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    role_code employee_role_enum NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    UNIQUE (shop_id, role_code)
);

CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    module VARCHAR(80) NOT NULL, -- POS, PRODUCTS, INVENTORY, EXPIRY, ORDERS, CREDIT_BOOK, FINANCIAL_REPORTS, SUPPLIERS, EMPLOYEES, SETTINGS
    can_view BOOLEAN NOT NULL DEFAULT FALSE,
    can_create BOOLEAN NOT NULL DEFAULT FALSE,
    can_edit BOOLEAN NOT NULL DEFAULT FALSE,
    can_delete BOOLEAN NOT NULL DEFAULT FALSE,
    can_approve BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (role_id, module)
);

CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    role_code employee_role_enum NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(40) NOT NULL,
    password_hash TEXT NOT NULL,
    pin_code VARCHAR(10),
    permissions_override JSONB,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (shop_id, email)
);

-- ----------------------------------------------------------------------------
-- 6. SUPPLIERS & PURCHASE ORDERS (BATCH RECEIVING)
-- ----------------------------------------------------------------------------
CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    name VARCHAR(180) NOT NULL,
    contact_person VARCHAR(150),
    phone VARCHAR(40) NOT NULL,
    whatsapp_number VARCHAR(40),
    email VARCHAR(255),
    address TEXT,
    country VARCHAR(80) DEFAULT 'Maldives',
    currency VARCHAR(10) NOT NULL DEFAULT 'MVR' REFERENCES currencies(code),
    outstanding_payable NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_suppliers_shop ON suppliers(shop_id);

-- ----------------------------------------------------------------------------
-- 7. PRODUCT CATEGORIES, PRODUCTS, IMAGES, VARIANTS & MULTI-CURRENCY PRICES
-- ----------------------------------------------------------------------------
CREATE TABLE product_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
    name VARCHAR(120) NOT NULL,
    slug VARCHAR(140) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (shop_id, slug)
);

CREATE TYPE product_status_enum AS ENUM ('ACTIVE', 'DRAFT', 'OUT_OF_STOCK', 'ARCHIVED', 'DISCONTINUED');

CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
    subcategory_name VARCHAR(120),
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(220) NOT NULL,
    description TEXT,
    sku VARCHAR(80) NOT NULL,
    barcode VARCHAR(80),
    brand VARCHAR(120),
    unit_of_measurement VARCHAR(40) NOT NULL DEFAULT 'pcs', -- kg, g, L, ml, pcs, pack, box, tin
    purchase_price NUMERIC(18, 2) NOT NULL CHECK (purchase_price >= 0),
    selling_price NUMERIC(18, 2) NOT NULL CHECK (selling_price >= 0),
    discounted_price NUMERIC(18, 2) CHECK (discounted_price IS NULL OR discounted_price >= 0),
    clearance_discount_pct NUMERIC(5, 2) DEFAULT 0.00 CHECK (clearance_discount_pct BETWEEN 0 AND 100),
    is_clearance_offer BOOLEAN NOT NULL DEFAULT FALSE,
    currency VARCHAR(10) NOT NULL DEFAULT 'MVR' REFERENCES currencies(code),
    explicit_currency_prices JSONB NOT NULL DEFAULT '{}'::jsonb, -- e.g. {"MVR": 85.00, "INR": 450.00, "USD": 5.50}
    available_quantity NUMERIC(18, 3) NOT NULL DEFAULT 0,
    reserved_quantity NUMERIC(18, 3) NOT NULL DEFAULT 0,
    minimum_stock_level NUMERIC(18, 3) NOT NULL DEFAULT 10,
    has_expiry BOOLEAN NOT NULL DEFAULT TRUE,
    primary_manufacturing_date DATE,
    primary_expiry_date DATE,
    primary_batch_number VARCHAR(80),
    status product_status_enum NOT NULL DEFAULT 'ACTIVE',
    is_visible_online BOOLEAN NOT NULL DEFAULT TRUE,
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    total_units_sold NUMERIC(18, 3) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (shop_id, sku)
);

CREATE INDEX idx_products_shop ON products(shop_id);
CREATE INDEX idx_products_barcode ON products(shop_id, barcode);
CREATE INDEX idx_products_expiry ON products(shop_id, primary_expiry_date);

CREATE TABLE product_images (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    alt_text VARCHAR(200),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE product_variants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_name VARCHAR(120) NOT NULL, -- e.g. "5kg Bag", "Red / Large", "Pack of 6"
    variant_type VARCHAR(60) NOT NULL DEFAULT 'SIZE', -- SIZE | COLOUR | PACKAGING | QUANTITY
    sku_suffix VARCHAR(60),
    barcode VARCHAR(80),
    purchase_price NUMERIC(18, 2) NOT NULL,
    selling_price NUMERIC(18, 2) NOT NULL,
    discounted_price NUMERIC(18, 2),
    available_quantity NUMERIC(18, 3) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 8. INVENTORY, INVENTORY BATCHES (FEFO) & STOCK MOVEMENTS
-- ----------------------------------------------------------------------------
CREATE TABLE inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    product_id UUID NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
    quantity_on_hand NUMERIC(18, 3) NOT NULL DEFAULT 0,
    quantity_reserved NUMERIC(18, 3) NOT NULL DEFAULT 0,
    quantity_damaged NUMERIC(18, 3) NOT NULL DEFAULT 0,
    quantity_expired_removed NUMERIC(18, 3) NOT NULL DEFAULT 0,
    reorder_level NUMERIC(18, 3) NOT NULL DEFAULT 10,
    last_counted_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TYPE batch_status_enum AS ENUM ('ACTIVE', 'DEPLETED', 'EXPIRED_QUARANTINED', 'DAMAGED_REMOVED');

CREATE TABLE inventory_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    batch_number VARCHAR(80) NOT NULL,
    supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    manufacturing_date DATE,
    expiry_date DATE,
    initial_quantity NUMERIC(18, 3) NOT NULL CHECK (initial_quantity >= 0),
    remaining_quantity NUMERIC(18, 3) NOT NULL CHECK (remaining_quantity >= 0),
    unit_cost NUMERIC(18, 2) NOT NULL CHECK (unit_cost >= 0),
    clearance_discount_pct NUMERIC(5, 2) DEFAULT 0.00,
    status batch_status_enum NOT NULL DEFAULT 'ACTIVE',
    notes TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (shop_id, product_id, batch_number)
);

CREATE INDEX idx_batches_fefo ON inventory_batches(shop_id, product_id, status, expiry_date ASC);

CREATE TYPE stock_movement_type_enum AS ENUM (
    'INITIAL_STOCK',
    'PURCHASE_RECEIVE',
    'POS_SALE',
    'ONLINE_ORDER_RESERVE',
    'ONLINE_ORDER_DEDUCT',
    'ONLINE_ORDER_RELEASE',
    'CREDIT_SALE',
    'SALES_RETURN',
    'DAMAGED_WRITE_OFF',
    'EXPIRED_REMOVAL',
    'MANUAL_ADJUSTMENT'
);

CREATE TABLE stock_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES inventory_batches(id) ON DELETE SET NULL,
    movement_type stock_movement_type_enum NOT NULL,
    quantity_change NUMERIC(18, 3) NOT NULL, -- positive for additions, negative for deductions
    quantity_before NUMERIC(18, 3) NOT NULL,
    quantity_after NUMERIC(18, 3) NOT NULL,
    reference_type VARCHAR(60), -- ORDER, SALE, PURCHASE_ORDER, CREDIT_TX, ADJUSTMENT
    reference_id UUID,
    reason TEXT,
    performed_by_user_id UUID,
    performed_by_name VARCHAR(150),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_stock_movements_shop ON stock_movements(shop_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 9. PURCHASE ORDERS & ITEMS
-- ----------------------------------------------------------------------------
CREATE TYPE purchase_order_status_enum AS ENUM ('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

CREATE TABLE purchase_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
    po_number VARCHAR(60) NOT NULL,
    status purchase_order_status_enum NOT NULL DEFAULT 'ORDERED',
    currency VARCHAR(10) NOT NULL REFERENCES currencies(code),
    exchange_rate_to_shop NUMERIC(18, 6) NOT NULL DEFAULT 1.000000,
    subtotal_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    shipping_cost NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    amount_paid NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    expected_delivery_date DATE,
    received_at TIMESTAMPTZ,
    notes TEXT,
    created_by_name VARCHAR(150),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (shop_id, po_number)
);

CREATE TABLE purchase_order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    ordered_quantity NUMERIC(18, 3) NOT NULL CHECK (ordered_quantity > 0),
    received_quantity NUMERIC(18, 3) NOT NULL DEFAULT 0,
    unit_cost NUMERIC(18, 2) NOT NULL CHECK (unit_cost >= 0),
    line_total NUMERIC(18, 2) NOT NULL,
    batch_number VARCHAR(80),
    manufacturing_date DATE,
    expiry_date DATE
);

-- ----------------------------------------------------------------------------
-- 10. CUSTOMERS, LOYALTY & COUPONS
-- ----------------------------------------------------------------------------
CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE, -- NULL for platform-wide account, populated for shop-specific CRM profile
    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(40) NOT NULL,
    whatsapp_number VARCHAR(40),
    viber_number VARCHAR(40),
    email VARCHAR(255),
    password_hash TEXT, -- Nullable for guest checkout or shop-created credit customers
    national_id_ref VARCHAR(80),
    employer_name VARCHAR(150),
    job_title VARCHAR(120),
    salary_payment_day SMALLINT CHECK (salary_payment_day IS NULL OR salary_payment_day BETWEEN 1 AND 31),
    island_city VARCHAR(120),
    delivery_address TEXT,
    address_instructions TEXT,
    loyalty_points INT NOT NULL DEFAULT 0,
    loyalty_tier VARCHAR(40) NOT NULL DEFAULT 'BRONZE', -- BRONZE, SILVER, GOLD, PLATINUM
    repeat_discount_pct NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
    total_purchases_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    credit_limit NUMERIC(18, 2) NOT NULL DEFAULT 5000.00,
    current_credit_balance NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customers_shop ON customers(shop_id);
CREATE INDEX idx_customers_phone ON customers(phone);

CREATE TABLE discount_coupons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    description VARCHAR(200),
    discount_type VARCHAR(20) NOT NULL DEFAULT 'PERCENTAGE', -- PERCENTAGE | FIXED
    discount_value NUMERIC(18, 2) NOT NULL CHECK (discount_value > 0),
    min_order_amount NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    valid_until DATE,
    usage_limit INT,
    times_used INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (shop_id, code)
);

-- ----------------------------------------------------------------------------
-- 11. ORDERS, ORDER ITEMS, PAYMENT EVIDENCE & DELIVERIES (14-STEP WORKFLOW)
-- ----------------------------------------------------------------------------
CREATE TYPE order_status_enum AS ENUM (
    'NEW_ORDER',
    'UNDER_REVIEW',
    'CONFIRMED',
    'AWAITING_PAYMENT',
    'PAYMENT_SUBMITTED',
    'PAYMENT_VERIFIED',
    'PROCESSING',
    'READY_FOR_DELIVERY',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'CANCELLED',
    'REJECTED',
    'REFUNDED'
);

CREATE TABLE orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    order_number VARCHAR(60) NOT NULL UNIQUE,
    status order_status_enum NOT NULL DEFAULT 'NEW_ORDER',
    customer_full_name VARCHAR(150) NOT NULL,
    customer_mobile VARCHAR(40) NOT NULL,
    customer_whatsapp VARCHAR(40) NOT NULL,
    customer_viber VARCHAR(40),
    delivery_address TEXT NOT NULL,
    island_city VARCHAR(120) NOT NULL,
    address_instructions TEXT,
    preferred_delivery_time VARCHAR(120),
    delivery_method VARCHAR(80) NOT NULL DEFAULT 'Local Island Delivery',
    order_notes TEXT,
    -- Immutable Financial Snapshot at Transaction Time
    transaction_currency VARCHAR(10) NOT NULL REFERENCES currencies(code),
    shop_base_currency VARCHAR(10) NOT NULL REFERENCES currencies(code),
    exchange_rate_used NUMERIC(18, 6) NOT NULL DEFAULT 1.000000,
    subtotal_original NUMERIC(18, 2) NOT NULL,
    discount_original NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    delivery_fee_original NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    total_original NUMERIC(18, 2) NOT NULL,
    total_in_shop_currency NUMERIC(18, 2) NOT NULL,
    estimated_cogs_shop_currency NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    -- Payment & Confirmation State
    payment_method VARCHAR(60) NOT NULL DEFAULT 'BANK_TRANSFER',
    is_payment_verified BOOLEAN NOT NULL DEFAULT FALSE,
    payment_verified_by VARCHAR(150),
    payment_verified_at TIMESTAMPTZ,
    status_timeline JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_shop_status ON orders(shop_id, status, created_at DESC);

CREATE TABLE order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
    batch_id UUID REFERENCES inventory_batches(id) ON DELETE SET NULL,
    product_name_snapshot VARCHAR(200) NOT NULL,
    sku_snapshot VARCHAR(80) NOT NULL,
    batch_number_snapshot VARCHAR(80),
    expiry_date_snapshot DATE,
    quantity NUMERIC(18, 3) NOT NULL CHECK (quantity > 0),
    unit_price_original NUMERIC(18, 2) NOT NULL,
    unit_cost_shop_currency NUMERIC(18, 2) NOT NULL,
    line_total_original NUMERIC(18, 2) NOT NULL,
    line_total_shop_currency NUMERIC(18, 2) NOT NULL
);

CREATE TABLE payment_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    payment_method VARCHAR(60) NOT NULL, -- BANK_TRANSFER, CASH, QR_PAY, CARD, CREDIT_BOOK
    currency VARCHAR(10) NOT NULL REFERENCES currencies(code),
    exchange_rate_used NUMERIC(18, 6) NOT NULL DEFAULT 1.000000,
    amount_original NUMERIC(18, 2) NOT NULL,
    amount_shop_currency NUMERIC(18, 2) NOT NULL,
    reference_number VARCHAR(120),
    verification_status VARCHAR(40) NOT NULL DEFAULT 'PENDING_MANUAL_REVIEW', -- PENDING_MANUAL_REVIEW | VERIFIED | REJECTED
    verified_by_user_id UUID,
    verified_by_name VARCHAR(150),
    verified_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payment_evidence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    payment_record_id UUID REFERENCES payment_records(id) ON DELETE SET NULL,
    submitted_by_customer_name VARCHAR(150) NOT NULL,
    submitted_via VARCHAR(40) NOT NULL DEFAULT 'WEB_UPLOAD', -- WEB_UPLOAD | WHATSAPP | VIBER
    file_url TEXT NOT NULL,
    file_mime_type VARCHAR(80) NOT NULL DEFAULT 'image/jpeg',
    bank_reference_note VARCHAR(180),
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verified_by_name VARCHAR(150),
    verified_at TIMESTAMPTZ,
    review_notes TEXT,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    order_id UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    assigned_staff_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    assigned_staff_name VARCHAR(150),
    delivery_method VARCHAR(80) NOT NULL,
    delivery_zone VARCHAR(120),
    delivery_fee NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    tracking_code VARCHAR(80),
    recipient_name VARCHAR(150) NOT NULL,
    recipient_phone VARCHAR(40) NOT NULL,
    destination_island VARCHAR(120) NOT NULL,
    destination_address TEXT NOT NULL,
    boat_or_ferry_details VARCHAR(180),
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, READY, OUT_FOR_DELIVERY, DELIVERED, FAILED
    dispatched_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    proof_of_delivery_note TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 12. CUSTOMER CREDIT BOOK / MONTHLY SALARY PAYMENT MANAGEMENT
-- ----------------------------------------------------------------------------
CREATE TABLE credit_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    account_code VARCHAR(60) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'MVR' REFERENCES currencies(code),
    credit_limit NUMERIC(18, 2) NOT NULL DEFAULT 5000.00,
    total_credit_taken NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    total_credit_repaid NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    current_outstanding_balance NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    salary_payment_day SMALLINT DEFAULT 1,
    next_due_date DATE,
    status VARCHAR(40) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, OVERDUE, FROZEN, SETTLED
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (shop_id, customer_id)
);

CREATE TYPE credit_tx_type_enum AS ENUM ('BORROW_ITEMS', 'ADJUSTMENT_DEBIT', 'ADJUSTMENT_CREDIT', 'REVERSAL_CANCELLATION');

CREATE TABLE credit_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    credit_account_id UUID NOT NULL REFERENCES credit_accounts(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    tx_number VARCHAR(60) NOT NULL,
    tx_type credit_tx_type_enum NOT NULL DEFAULT 'BORROW_ITEMS',
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    batch_id UUID REFERENCES inventory_batches(id) ON DELETE SET NULL,
    product_name VARCHAR(200) NOT NULL,
    quantity NUMERIC(18, 3) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(18, 2) NOT NULL,
    total_amount NUMERIC(18, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL REFERENCES currencies(code),
    exchange_rate_used NUMERIC(18, 6) NOT NULL DEFAULT 1.000000,
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_payment_date DATE NOT NULL,
    due_month VARCHAR(20) NOT NULL, -- e.g. '2026-11'
    balance_before NUMERIC(18, 2) NOT NULL,
    balance_after NUMERIC(18, 2) NOT NULL,
    is_cancelled BOOLEAN NOT NULL DEFAULT FALSE,
    reversal_of_tx_id UUID REFERENCES credit_transactions(id),
    notes TEXT,
    recorded_by_name VARCHAR(150) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_credit_tx_shop_month ON credit_transactions(shop_id, due_month, transaction_date DESC);

CREATE TABLE credit_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    credit_account_id UUID NOT NULL REFERENCES credit_accounts(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
    receipt_number VARCHAR(60) NOT NULL,
    payment_type VARCHAR(40) NOT NULL DEFAULT 'PARTIAL', -- FULL | PARTIAL | MONTHLY_SALARY | ADJUSTMENT
    payment_method VARCHAR(50) NOT NULL DEFAULT 'CASH', -- CASH | BANK_TRANSFER | QR_PAY
    amount_paid NUMERIC(18, 2) NOT NULL CHECK (amount_paid > 0),
    currency VARCHAR(10) NOT NULL REFERENCES currencies(code),
    exchange_rate_used NUMERIC(18, 6) NOT NULL DEFAULT 1.000000,
    balance_before NUMERIC(18, 2) NOT NULL,
    balance_after NUMERIC(18, 2) NOT NULL,
    applied_to_month VARCHAR(20),
    reference_note TEXT,
    received_by_name VARCHAR(150) NOT NULL,
    payment_date TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 13. SALES, REFUNDS & OPERATING EXPENSES (FINANCIAL ENGINE)
-- ----------------------------------------------------------------------------
CREATE TYPE sale_channel_enum AS ENUM ('POS_CASH', 'POS_BANK_TRANSFER', 'ONLINE_ORDER', 'CREDIT_BOOK_ISSUED', 'MANUAL_SALE');

CREATE TABLE sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(60) NOT NULL,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    credit_tx_id UUID REFERENCES credit_transactions(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_name VARCHAR(150),
    channel sale_channel_enum NOT NULL,
    payment_method VARCHAR(50) NOT NULL, -- CASH, BANK_TRANSFER, CREDIT_BOOK, QR_PAY
    is_credit_sale BOOLEAN NOT NULL DEFAULT FALSE,
    is_cash_received BOOLEAN NOT NULL DEFAULT TRUE,
    -- Immutable Financial Snapshot
    transaction_currency VARCHAR(10) NOT NULL REFERENCES currencies(code),
    shop_base_currency VARCHAR(10) NOT NULL REFERENCES currencies(code),
    exchange_rate_used NUMERIC(18, 6) NOT NULL DEFAULT 1.000000,
    gross_amount_original NUMERIC(18, 2) NOT NULL,
    discount_amount_original NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    net_amount_original NUMERIC(18, 2) NOT NULL,
    net_amount_shop_currency NUMERIC(18, 2) NOT NULL,
    cogs_amount_shop_currency NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    gross_profit_shop_currency NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    items_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_reversed BOOLEAN NOT NULL DEFAULT FALSE,
    cashier_name VARCHAR(150),
    sale_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (shop_id, invoice_number)
);

CREATE INDEX idx_sales_shop_date ON sales(shop_id, sale_date DESC);

CREATE TABLE refunds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
    sale_id UUID REFERENCES sales(id) ON DELETE RESTRICT,
    order_id UUID REFERENCES orders(id) ON DELETE RESTRICT,
    refund_number VARCHAR(60) NOT NULL,
    amount_refunded_shop_currency NUMERIC(18, 2) NOT NULL CHECK (amount_refunded_shop_currency > 0),
    currency VARCHAR(10) NOT NULL REFERENCES currencies(code),
    restock_items BOOLEAN NOT NULL DEFAULT FALSE,
    reason TEXT NOT NULL,
    processed_by_name VARCHAR(150) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TYPE expense_category_enum AS ENUM ('RENT', 'ELECTRICITY', 'TRANSPORT', 'SALARIES', 'PURCHASES', 'DELIVERY_EXPENSES', 'MAINTENANCE', 'OTHER');

CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    expense_number VARCHAR(60) NOT NULL,
    category expense_category_enum NOT NULL,
    title VARCHAR(180) NOT NULL,
    amount_original NUMERIC(18, 2) NOT NULL CHECK (amount_original > 0),
    currency VARCHAR(10) NOT NULL REFERENCES currencies(code),
    exchange_rate_used NUMERIC(18, 6) NOT NULL DEFAULT 1.000000,
    amount_shop_currency NUMERIC(18, 2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'CASH',
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    vendor_or_payee VARCHAR(150),
    notes TEXT,
    is_reversed BOOLEAN NOT NULL DEFAULT FALSE,
    recorded_by_name VARCHAR(150) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_expenses_shop_date ON expenses(shop_id, expense_date DESC);

-- ----------------------------------------------------------------------------
-- 14. NOTIFICATIONS & AUDIT LOGS
-- ----------------------------------------------------------------------------
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipient_role VARCHAR(40) NOT NULL, -- MASTER_ADMIN | SHOP_OWNER | CUSTOMER
    shop_id UUID REFERENCES shops(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    event_type VARCHAR(80) NOT NULL, -- NEW_ORDER, PAYMENT_UPLOADED, LOW_STOCK, EXPIRY_ALERT, CREDIT_OVERDUE, ORDER_CONFIRMED, etc.
    severity VARCHAR(20) NOT NULL DEFAULT 'INFO', -- INFO | WARNING | DANGER | SUCCESS
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    channels_dispatched JSONB NOT NULL DEFAULT '["IN_APP"]'::jsonb,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_role VARCHAR(40) NOT NULL, -- MASTER_ADMIN | SHOP_OWNER | MANAGER | CASHIER | INVENTORY_STAFF | DELIVERY_STAFF | SYSTEM
    actor_id UUID,
    actor_name VARCHAR(150) NOT NULL,
    shop_id UUID REFERENCES shops(id) ON DELETE SET NULL,
    action_code VARCHAR(100) NOT NULL,
    entity_type VARCHAR(80) NOT NULL,
    entity_id VARCHAR(100),
    before_state JSONB,
    after_state JSONB,
    ip_address VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_shop ON audit_logs(shop_id, created_at DESC);
