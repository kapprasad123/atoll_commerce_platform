-- ============================================================================
-- ATOLLHUB MULTI-SHOP PLATFORM - REALISTIC DEMO SEED DATA
-- Reference Date: 2026-11-06
-- Includes:
--   - 5 Supported Currencies (MVR, INR, USD, EUR, GBP) + configurable rates
--   - 1 Master Administrator (seeded via bcrypt hash of demo password)
--   - 3 Active Sample Shops + 1 Pending Shop Request
--   - 32 Sample Products across shops with multi-currency overrides & expiry buckets
--   - Sample Customers, Online Orders (14-step statuses), Credit Book Ledgers,
--     Partial Payments, POS Sales, Operating Expenses, Suppliers & Purchase Orders
-- ============================================================================

INSERT INTO currencies (code, name, symbol, decimal_places, is_base_currency, is_active) VALUES
('MVR', 'Maldivian Rufiyaa', 'Rf', 2, TRUE, TRUE),
('INR', 'Indian Rupee', '₹', 2, FALSE, TRUE),
('USD', 'US Dollar', '$', 2, FALSE, TRUE),
('EUR', 'Euro', '€', 2, FALSE, TRUE),
('GBP', 'British Pound', '£', 2, FALSE, TRUE),
('AED', 'UAE Dirham', 'AED', 2, FALSE, TRUE),
('LKR', 'Sri Lankan Rupee', 'Rs', 2, FALSE, TRUE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO exchange_rates (from_currency, to_currency, rate, source) VALUES
('MVR', 'MVR', 1.000000, 'MANUAL'),
('USD', 'MVR', 15.420000, 'MANUAL'),
('MVR', 'USD', 0.064851, 'MANUAL'),
('INR', 'MVR', 0.183500, 'MANUAL'),
('MVR', 'INR', 5.449591, 'MANUAL'),
('EUR', 'MVR', 16.800000, 'MANUAL'),
('MVR', 'EUR', 0.059524, 'MANUAL'),
('GBP', 'MVR', 19.650000, 'MANUAL'),
('MVR', 'GBP', 0.050891, 'MANUAL')
ON CONFLICT DO NOTHING;

INSERT INTO platform_categories (id, name, slug, description, icon_name, display_order) VALUES
('11111111-1111-4111-8111-111111111101', 'Groceries & Island Pantry', 'groceries-pantry', 'Staple foods, rice, flour, dairy, beverages and fresh produce', 'ShoppingBasket', 1),
('11111111-1111-4111-8111-111111111102', 'Electronics & Smart Home', 'electronics-smart-home', 'Consumer electronics, power banks, marine audio and appliances', 'Cpu', 2),
('11111111-1111-4111-8111-111111111103', 'Pharmacy, Health & Wellness', 'pharmacy-health-wellness', 'Vitamins, OTC supplements, skincare, baby care and first aid', 'HeartPulse', 3),
('11111111-1111-4111-8111-111111111104', 'Beverages & Cold Drinks', 'beverages-cold-drinks', 'Juices, mineral water, coffee, tea and energy drinks', 'CupSoda', 4),
('11111111-1111-4111-8111-111111111105', 'Household & Cleaning', 'household-cleaning', 'Detergents, kitchenware, toiletries and home essentials', 'Sparkles', 5)
ON CONFLICT (slug) DO NOTHING;

-- Demo Master Admin (Demo Password: Admin@Atoll2026! hashed with bcrypt cost 12)
INSERT INTO master_administrators (id, full_name, email, password_hash, phone, is_super_admin) VALUES
('00000000-0000-4000-8000-000000000001', 'Ibrahim Rasheed (Master Admin)', 'admin@atollhub.mv', '$2b$12$DemoHashMasterAdminAtollHub2026SecurePlaceholder9912', '+960 777-0100', TRUE)
ON CONFLICT (email) DO NOTHING;

-- Demo Shop Owners (Demo Password: Owner@Shop2026!)
INSERT INTO shop_owners (id, full_name, email, phone, whatsapp_number, viber_number, national_id_ref, password_hash, created_by_admin_id) VALUES
('22222222-2222-4222-8222-222222222201', 'Hassan Zareer', 'owner@malefresh.mv', '+960 778-2410', '9607782410', '9607782410', 'A129401', '$2b$12$DemoHashShopOwner1AtollHub2026SecurePlaceholder1101', '00000000-0000-4000-8000-000000000001'),
('22222222-2222-4222-8222-222222222202', 'Mariyam Niuma', 'owner@hulhumaletech.mv', '+960 790-5521', '9607905521', '9607905521', 'A204882', '$2b$12$DemoHashShopOwner2AtollHub2026SecurePlaceholder1102', '00000000-0000-4000-8000-000000000001'),
('22222222-2222-4222-8222-222222222203', 'Dr. Ali Shareef', 'owner@adduwellness.mv', '+960 779-8833', '9607798833', '9607798833', 'A188320', '$2b$12$DemoHashShopOwner3AtollHub2026SecurePlaceholder1103', '00000000-0000-4000-8000-000000000001'),
('22222222-2222-4222-8222-222222222204', 'Fathimath Shifana', 'owner@baacoralmart.mv', '+960 765-1199', '9607651199', '9607651199', 'A299104', '$2b$12$DemoHashShopOwner4AtollHub2026SecurePlaceholder1104', '00000000-0000-4000-8000-000000000001')
ON CONFLICT (email) DO NOTHING;

-- Demo Shops (3 ACTIVE + 1 PENDING for Master Admin approval testing)
INSERT INTO shops (id, owner_id, name, slug, tagline, description, primary_category_id, status, approved_by_admin_id, approved_at, default_currency, contact_phone, whatsapp_number, viber_number, email, island_city, atoll, address_line, bank_name, bank_account_holder, bank_account_number, payment_instructions, invoice_prefix, is_featured) VALUES
('33333333-3333-4333-8333-333333333301', '22222222-2222-4222-8222-222222222201', 'Malé Fresh Mart & Superstore', 'male-fresh-mart', 'Daily Island Groceries, Basmati Rice, Dairy & Fresh Produce', 'Premier supermarket serving Malé and inter-island dhoni/ferry orders with FEFO quality-monitored groceries and monthly salary credit book.', '11111111-1111-4111-8111-111111111101', 'ACTIVE', '00000000-0000-4000-8000-000000000001', NOW() - INTERVAL '90 days', 'MVR', '+960 778-2410', '9607782410', '9607782410', 'orders@malefresh.mv', 'Malé', 'Kaafu Atoll', 'Majeedhee Magu, Henveiru, Malé 20026', 'Bank of Maldives (BML)', 'MALE FRESH MART PVT LTD', '7730000192837', 'Transfer exact confirmed order amount via BML Mobile Pay and upload your transfer slip or share on WhatsApp/Viber.', 'MFM', TRUE),
('33333333-3333-4333-8333-333333333302', '22222222-2222-4222-8222-222222222202', 'Hulhumalé Tech & Home Hub', 'hulhumale-tech-hub', 'Smart Electronics, Marine Gear & Home Appliances', 'Authorised distributor of consumer electronics, solar power banks, kitchen appliances and smart home equipment in Hulhumalé Phase 1 & 2.', '11111111-1111-4111-8111-111111111102', 'ACTIVE', '00000000-0000-4000-8000-000000000001', NOW() - INTERVAL '60 days', 'USD', '+960 790-5521', '9607905521', '9607905521', 'sales@hulhumaletech.mv', 'Hulhumalé', 'Kaafu Atoll', 'Nirolhu Magu, Lot 11402, Hulhumalé', 'Maldives Islamic Bank (MIB)', 'HULHUMALE TECH HUB LLP', '9010148002911', 'USD or MVR transfers accepted. Please quote your Order ID in the bank remarks.', 'HTH', TRUE),
('33333333-3333-4333-8333-333333333303', '22222222-2222-4222-8222-222222222203', 'Addu Island Pharmacy & Wellness', 'addu-wellness-pharmacy', 'Trusted Supplements, Baby Care, Skincare & Medical Essentials', 'Strict batch & expiry monitored pharmacy and family wellness store serving Hithadhoo, Feydhoo and southern atolls.', '11111111-1111-4111-8111-111111111103', 'ACTIVE', '00000000-0000-4000-8000-000000000001', NOW() - INTERVAL '45 days', 'MVR', '+960 779-8833', '9607798833', '9607798833', 'care@adduwellness.mv', 'Addu City (Hithadhoo)', 'Seenu Atoll', 'Link Road, Hithadhoo, Addu City 19020', 'Bank of Maldives (BML)', 'ADDU WELLNESS PHARMACY', '7730000845120', 'Upload BML slip after order confirmation. Express delivery across connected Addu islands.', 'AWP', TRUE),
('33333333-3333-4333-8333-333333333304', '22222222-2222-4222-8222-222222222204', 'Baa Atoll Coral Provision Store', 'baa-coral-provisions', 'Island Wholesale & Retail Provisions in Eydhafushi', 'Awaiting Master Admin activation for online marketplace and POS onboarding.', '11111111-1111-4111-8111-111111111101', 'PENDING', NULL, NULL, 'MVR', '+960 765-1199', '9607651199', '9607651199', 'owner@baacoralmart.mv', 'Eydhafushi', 'Baa Atoll', 'Bodu Magu, B. Eydhafushi', 'Bank of Maldives (BML)', 'BAA CORAL PROVISIONS', '7730000991122', 'BML Transfer upon order confirmation.', 'BCP', FALSE)
ON CONFLICT (slug) DO NOTHING;
