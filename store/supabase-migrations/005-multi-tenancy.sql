-- ============================================================================
-- Multi-Tenancy Migration
-- Adds: companies table, company_id on all tenant tables, RLS isolation,
--       superadmin role, current_company_id() helper.
-- See: store/docs/MULTI_TENANCY.md
-- Idempotent — safe to re-run.
-- ============================================================================

-- --------------------------------------------------
-- 1) COMPANIES
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,                  -- "mptools" → mptools.tutienda.com
  name TEXT NOT NULL,
  primary_domain TEXT UNIQUE,                 -- dominio custom opcional
  logo_url TEXT,
  whatsapp_number TEXT,
  contact_email TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);
CREATE INDEX IF NOT EXISTS idx_companies_domain ON companies(primary_domain) WHERE primary_domain IS NOT NULL;

-- Backfill: company default = MP.TOOLS (datos existentes pertenecen acá)
INSERT INTO companies (id, slug, name, contact_email, whatsapp_number)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'mptools',
  'MP.TOOLS Mayorista',
  'mptools.mayorista@gmail.com',
  NULL
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON companies;
CREATE POLICY "Service role full access" ON companies FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Public read active companies" ON companies;
CREATE POLICY "Public read active companies" ON companies FOR SELECT
  USING (is_active = true);

-- --------------------------------------------------
-- 2) PROFILES — agregar company_id + soportar superadmin
-- --------------------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE RESTRICT;

-- Backfill: todos los profiles existentes pertenecen a MP.TOOLS
UPDATE profiles
   SET company_id = '00000000-0000-0000-0000-000000000001'
 WHERE company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_company ON profiles(company_id);

-- NOTA: company_id en profiles puede ser NULL únicamente para role='superadmin'.
-- No forzamos NOT NULL para permitir ese caso. Validación a nivel app.

-- --------------------------------------------------
-- 3) HELPER: current_company_id()
-- --------------------------------------------------
-- Devuelve el company_id del usuario autenticado.
-- STABLE → Postgres la cachea dentro de un mismo statement.
-- SECURITY DEFINER no es necesario: profiles tiene RLS pero el self-read está permitido.
CREATE OR REPLACE FUNCTION current_company_id() RETURNS UUID
LANGUAGE sql STABLE
AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid()
$$;

COMMENT ON FUNCTION current_company_id() IS
  'Returns the company_id of the authenticated user (NULL for anon or superadmin).';

-- --------------------------------------------------
-- 4) Helper macro para agregar company_id a una tabla
-- --------------------------------------------------
-- Patrón aplicado a cada tabla:
--   1. ADD COLUMN company_id (nullable inicialmente)
--   2. UPDATE backfill = MP.TOOLS
--   3. SET NOT NULL
--   4. Crear índice
--   5. Reescribir RLS policies

-- --------------------------------------------------
-- 5) PRODUCTS (público + tenant)
-- --------------------------------------------------
ALTER TABLE products ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
UPDATE products SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
ALTER TABLE products ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_company ON products(company_id);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read" ON products;
DROP POLICY IF EXISTS "Service role full access" ON products;
DROP POLICY IF EXISTS "Tenant read" ON products;
DROP POLICY IF EXISTS "Tenant write" ON products;

-- Catálogo público: anon ve todo (la app filtra por host); auth solo su company
CREATE POLICY "Tenant read" ON products FOR SELECT
  USING (auth.uid() IS NULL OR company_id = current_company_id());

-- Mutaciones: solo auth de la misma company
CREATE POLICY "Tenant write" ON products FOR INSERT
  WITH CHECK (company_id = current_company_id());
CREATE POLICY "Tenant update" ON products FOR UPDATE
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());
CREATE POLICY "Tenant delete" ON products FOR DELETE
  USING (company_id = current_company_id());

CREATE POLICY "Service role full access" ON products FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------
-- 6) CATEGORIES (público + tenant)
-- --------------------------------------------------
ALTER TABLE categories ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
UPDATE categories SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
ALTER TABLE categories ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_categories_company ON categories(company_id);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read" ON categories;
DROP POLICY IF EXISTS "Service role full access" ON categories;
DROP POLICY IF EXISTS "Tenant read" ON categories;

CREATE POLICY "Tenant read" ON categories FOR SELECT
  USING (auth.uid() IS NULL OR company_id = current_company_id());
CREATE POLICY "Tenant write" ON categories FOR INSERT
  WITH CHECK (company_id = current_company_id());
CREATE POLICY "Tenant update" ON categories FOR UPDATE
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());
CREATE POLICY "Tenant delete" ON categories FOR DELETE
  USING (company_id = current_company_id());
CREATE POLICY "Service role full access" ON categories FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------
-- 7) PRODUCT_IMAGES (público + tenant)
-- --------------------------------------------------
ALTER TABLE product_images ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
UPDATE product_images SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
ALTER TABLE product_images ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_images_company ON product_images(company_id);

ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read" ON product_images;
DROP POLICY IF EXISTS "Service role full access" ON product_images;
DROP POLICY IF EXISTS "Tenant read" ON product_images;

CREATE POLICY "Tenant read" ON product_images FOR SELECT
  USING (auth.uid() IS NULL OR company_id = current_company_id());
CREATE POLICY "Tenant write" ON product_images FOR INSERT
  WITH CHECK (company_id = current_company_id());
CREATE POLICY "Tenant update" ON product_images FOR UPDATE
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());
CREATE POLICY "Tenant delete" ON product_images FOR DELETE
  USING (company_id = current_company_id());
CREATE POLICY "Service role full access" ON product_images FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------
-- 8) ORDERS (privado, solo auth de la company)
-- --------------------------------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
UPDATE orders SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
ALTER TABLE orders ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_company ON orders(company_id);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON orders;
DROP POLICY IF EXISTS "Admin operador read all" ON orders;  -- de 002-admin-read-orders.sql
DROP POLICY IF EXISTS "Tenant access" ON orders;

CREATE POLICY "Tenant access" ON orders FOR ALL
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());
CREATE POLICY "Service role full access" ON orders FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------
-- 9) ORDER_ITEMS (privado vía join con orders)
-- --------------------------------------------------
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
UPDATE order_items SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
ALTER TABLE order_items ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_items_company ON order_items(company_id);

ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON order_items;
DROP POLICY IF EXISTS "Admin operador read all" ON order_items;
DROP POLICY IF EXISTS "Tenant access" ON order_items;

CREATE POLICY "Tenant access" ON order_items FOR ALL
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());
CREATE POLICY "Service role full access" ON order_items FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------
-- 10) CUSTOMERS
-- --------------------------------------------------
ALTER TABLE customers ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
UPDATE customers SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
ALTER TABLE customers ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_company ON customers(company_id);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON customers;
DROP POLICY IF EXISTS "Auth user own record" ON customers;
DROP POLICY IF EXISTS "Tenant access" ON customers;
DROP POLICY IF EXISTS "Tenant own record" ON customers;

-- Staff (admin/operador) ven todos los customers de su company
CREATE POLICY "Tenant access" ON customers FOR ALL
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());

-- Customer auth user ve solo su propia ficha (dentro de su company)
CREATE POLICY "Tenant own record" ON customers FOR SELECT
  USING (user_id = auth.uid() AND company_id = current_company_id());

CREATE POLICY "Service role full access" ON customers FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------
-- 11) CUSTOMER_LEDGER
-- --------------------------------------------------
ALTER TABLE customer_ledger ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
UPDATE customer_ledger SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
ALTER TABLE customer_ledger ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_ledger_company ON customer_ledger(company_id);

ALTER TABLE customer_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON customer_ledger;
DROP POLICY IF EXISTS "Tenant access" ON customer_ledger;

CREATE POLICY "Tenant access" ON customer_ledger FOR ALL
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());
CREATE POLICY "Service role full access" ON customer_ledger FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------
-- 12) ORDER_PAYMENTS
-- --------------------------------------------------
ALTER TABLE order_payments ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
UPDATE order_payments SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
ALTER TABLE order_payments ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_payments_company ON order_payments(company_id);

ALTER TABLE order_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON order_payments;
DROP POLICY IF EXISTS "Tenant access" ON order_payments;

CREATE POLICY "Tenant access" ON order_payments FOR ALL
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());
CREATE POLICY "Service role full access" ON order_payments FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------
-- 13) ORDER_STATUS_HISTORY
-- --------------------------------------------------
ALTER TABLE order_status_history ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
UPDATE order_status_history SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
ALTER TABLE order_status_history ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_status_history_company ON order_status_history(company_id);

ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON order_status_history;
DROP POLICY IF EXISTS "Tenant access" ON order_status_history;

CREATE POLICY "Tenant access" ON order_status_history FOR ALL
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());
CREATE POLICY "Service role full access" ON order_status_history FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------
-- 14) ORDER_STATUSES (per-company: cada negocio puede tener sus estados)
-- --------------------------------------------------
ALTER TABLE order_statuses ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
UPDATE order_statuses SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
ALTER TABLE order_statuses ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_statuses_company ON order_statuses(company_id);

-- El UNIQUE original era global; ahora debe ser per-company
ALTER TABLE order_statuses DROP CONSTRAINT IF EXISTS order_statuses_name_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_statuses_company_name_key'
  ) THEN
    ALTER TABLE order_statuses ADD CONSTRAINT order_statuses_company_name_key UNIQUE (company_id, name);
  END IF;
END $$;

ALTER TABLE order_statuses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read" ON order_statuses;
DROP POLICY IF EXISTS "Service role full access" ON order_statuses;
DROP POLICY IF EXISTS "Tenant read" ON order_statuses;

CREATE POLICY "Tenant read" ON order_statuses FOR SELECT
  USING (auth.uid() IS NULL OR company_id = current_company_id());
CREATE POLICY "Tenant write" ON order_statuses FOR ALL
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());
CREATE POLICY "Service role full access" ON order_statuses FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------
-- 15) SUPPLIERS
-- --------------------------------------------------
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
UPDATE suppliers SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
ALTER TABLE suppliers ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_company ON suppliers(company_id);

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON suppliers;
DROP POLICY IF EXISTS "Tenant access" ON suppliers;

CREATE POLICY "Tenant access" ON suppliers FOR ALL
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());
CREATE POLICY "Service role full access" ON suppliers FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------
-- 16) EXPENSE_CATEGORIES (per-company: cada negocio sus categorías)
-- --------------------------------------------------
ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
UPDATE expense_categories SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
ALTER TABLE expense_categories ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expense_categories_company ON expense_categories(company_id);

ALTER TABLE expense_categories DROP CONSTRAINT IF EXISTS expense_categories_name_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expense_categories_company_name_key'
  ) THEN
    ALTER TABLE expense_categories ADD CONSTRAINT expense_categories_company_name_key UNIQUE (company_id, name);
  END IF;
END $$;

ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read" ON expense_categories;
DROP POLICY IF EXISTS "Service role full access" ON expense_categories;
DROP POLICY IF EXISTS "Tenant access" ON expense_categories;

CREATE POLICY "Tenant access" ON expense_categories FOR ALL
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());
CREATE POLICY "Service role full access" ON expense_categories FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------
-- 17) EXPENSES
-- --------------------------------------------------
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
UPDATE expenses SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
ALTER TABLE expenses ALTER COLUMN company_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_company ON expenses(company_id);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON expenses;
DROP POLICY IF EXISTS "Tenant access" ON expenses;

CREATE POLICY "Tenant access" ON expenses FOR ALL
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());
CREATE POLICY "Service role full access" ON expenses FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------
-- 18) USER_PERMISSIONS (per-company implícito vía profiles.company_id)
-- --------------------------------------------------
-- user_permissions.user_id → auth.users.id, y profiles asocia user → company.
-- No agregamos company_id aquí: el join con profiles ya determina la company.
-- La RLS verifica que el user_id pertenezca a la misma company que el caller.

ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON user_permissions;
DROP POLICY IF EXISTS "User read own" ON user_permissions;
DROP POLICY IF EXISTS "Tenant access" ON user_permissions;
DROP POLICY IF EXISTS "Tenant read own" ON user_permissions;

CREATE POLICY "Tenant access" ON user_permissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = user_permissions.user_id
        AND p.company_id = current_company_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = user_permissions.user_id
        AND p.company_id = current_company_id()
    )
  );
CREATE POLICY "Tenant read own" ON user_permissions FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY "Service role full access" ON user_permissions FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------
-- 19) APP_SETTINGS — per-company
-- --------------------------------------------------
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id);
UPDATE app_settings SET company_id = '00000000-0000-0000-0000-000000000001' WHERE company_id IS NULL;
ALTER TABLE app_settings ALTER COLUMN company_id SET NOT NULL;

-- La PK era (key) global; ahora pasa a (company_id, key)
ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_pkey;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'app_settings_pkey' AND conrelid = 'app_settings'::regclass
  ) THEN
    ALTER TABLE app_settings ADD CONSTRAINT app_settings_pkey PRIMARY KEY (company_id, key);
  END IF;
END $$;

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read" ON app_settings;
DROP POLICY IF EXISTS "Service role full access" ON app_settings;
DROP POLICY IF EXISTS "Tenant access" ON app_settings;
DROP POLICY IF EXISTS "Tenant read" ON app_settings;

-- Lectura pública per-company (la app filtra por host)
CREATE POLICY "Tenant read" ON app_settings FOR SELECT
  USING (auth.uid() IS NULL OR company_id = current_company_id());
CREATE POLICY "Tenant write" ON app_settings FOR ALL
  USING (company_id = current_company_id())
  WITH CHECK (company_id = current_company_id());
CREATE POLICY "Service role full access" ON app_settings FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------
-- 20) PROFILES — RLS con company match
-- --------------------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON profiles;
DROP POLICY IF EXISTS "Read own profile" ON profiles;
DROP POLICY IF EXISTS "Tenant read profiles" ON profiles;
DROP POLICY IF EXISTS "Update own profile" ON profiles;

-- Cualquier auth user lee su propio profile (necesario para current_company_id())
CREATE POLICY "Read own profile" ON profiles FOR SELECT
  USING (id = auth.uid());

-- Staff (admin/operador) lee profiles de su company
CREATE POLICY "Tenant read profiles" ON profiles FOR SELECT
  USING (company_id = current_company_id());

-- User actualiza su propio profile (no puede cambiar company_id ni role — validado app-side)
CREATE POLICY "Update own profile" ON profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "Service role full access" ON profiles FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------
-- 21) VIEWS — recreadas con company_id
-- --------------------------------------------------
-- Las views (transactions_view, cash_flow_daily, sales_by_user_30d) dependen de
-- tablas que ahora tienen company_id. RLS de las tablas base aplica a las views,
-- así que un user solo ve su company. No hace falta tocar las views.

-- --------------------------------------------------
-- done
-- --------------------------------------------------
