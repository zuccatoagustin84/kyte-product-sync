-- ============================================================================
-- Kyte Parity Migration
-- Adds: customers (CRM+saldo), ledger, sales/payments, expenses, suppliers,
--       user_permissions, customizable order statuses, extended orders/items.
-- Idempotent — safe to re-run.
-- ============================================================================

-- --------------------------------------------------
-- 1) CUSTOMERS (CRM)
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  doc_id TEXT,                      -- DNI/CUIT/RUT
  email TEXT,
  phone TEXT,
  phone_alt TEXT,
  address TEXT,
  address_complement TEXT,
  city TEXT,
  state TEXT,
  notes TEXT,
  tax_condition TEXT,               -- Consumidor Final / Monotributo / Responsable Inscripto
  allow_pay_later BOOLEAN NOT NULL DEFAULT false,
  credit_limit NUMERIC(14,2),       -- null = sin limite si allow_pay_later
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,  -- >0 crédito a favor, <0 deuda
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- cuenta autoservicio opcional
  tags TEXT[],
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_user_id ON customers(user_id);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON customers;
CREATE POLICY "Service role full access" ON customers FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Auth user own record" ON customers;
CREATE POLICY "Auth user own record" ON customers FOR SELECT
  USING (user_id = auth.uid());

-- --------------------------------------------------
-- 2) CUSTOMER LEDGER (movimientos de saldo)
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_ledger (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL,        -- sale | payment | credit_add | credit_sub | refund | adjust
  amount NUMERIC(14,2) NOT NULL,   -- firmado: + suma al saldo (crédito), - resta (deuda o uso)
  balance_after NUMERIC(14,2) NOT NULL,
  reference_type TEXT,              -- order | manual
  reference_id TEXT,
  payment_method TEXT,              -- efectivo | tarjeta | transferencia | mercadopago | otro
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_ledger_customer ON customer_ledger(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_reference ON customer_ledger(reference_type, reference_id);

ALTER TABLE customer_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON customer_ledger;
CREATE POLICY "Service role full access" ON customer_ledger FOR ALL USING (true) WITH CHECK (true);

-- Trigger: recalcular customers.balance al insertar en ledger
CREATE OR REPLACE FUNCTION sync_customer_balance() RETURNS TRIGGER AS $$
BEGIN
  UPDATE customers SET balance = NEW.balance_after, updated_at = now()
  WHERE id = NEW.customer_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_customer_balance ON customer_ledger;
CREATE TRIGGER trg_sync_customer_balance
  AFTER INSERT ON customer_ledger
  FOR EACH ROW EXECUTE FUNCTION sync_customer_balance();

-- --------------------------------------------------
-- 3) ORDER STATUSES (customizables por negocio)
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS order_statuses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#10b981',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_closed BOOLEAN NOT NULL DEFAULT false, -- true => cuenta como venta concluida
  is_cancelled BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE order_statuses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read" ON order_statuses;
CREATE POLICY "Public read" ON order_statuses FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role full access" ON order_statuses;
CREATE POLICY "Service role full access" ON order_statuses FOR ALL USING (true) WITH CHECK (true);

INSERT INTO order_statuses (name, color, sort_order, is_default, is_closed, is_cancelled) VALUES
  ('pending',   '#f59e0b', 10, true,  false, false),
  ('confirmed', '#10b981', 20, false, false, false),
  ('preparing', '#3b82f6', 30, false, false, false),
  ('shipped',   '#8b5cf6', 40, false, false, false),
  ('delivered', '#059669', 50, false, true,  false),
  ('cancelled', '#ef4444', 99, false, false, true)
ON CONFLICT (name) DO NOTHING;

-- --------------------------------------------------
-- 4) ORDERS — extender tabla existente
-- --------------------------------------------------
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS seller_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'catalog', -- pos | catalog | whatsapp | instagram | manual
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS discount_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shipping_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending', -- pending | partial | paid
  ADD COLUMN IF NOT EXISTS notes_internal TEXT,
  ADD COLUMN IF NOT EXISTS order_number SERIAL,
  ADD COLUMN IF NOT EXISTS fulfilled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(seller_user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_channel ON orders(channel);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

-- order_items: agregar cost_snapshot + discount
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS cost_snapshot NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0;

-- --------------------------------------------------
-- 5) ORDER PAYMENTS (múltiples pagos por pedido — mejora sobre Kyte)
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS order_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method TEXT NOT NULL,              -- efectivo | tarjeta | transferencia | mercadopago | credito_cliente | otro
  amount NUMERIC(14,2) NOT NULL,
  reference TEXT,                    -- ej número de transacción
  paid_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_order_payments_order ON order_payments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_paid_at ON order_payments(paid_at DESC);

ALTER TABLE order_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON order_payments;
CREATE POLICY "Service role full access" ON order_payments FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------
-- 6) ORDER STATUS HISTORY
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS order_status_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON order_status_history(order_id, changed_at DESC);

ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON order_status_history;
CREATE POLICY "Service role full access" ON order_status_history FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------
-- 7) USER PERMISSIONS (7 toggles granulares estilo Kyte)
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS user_permissions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  allow_personal_device BOOLEAN NOT NULL DEFAULT true,
  view_other_users_transactions BOOLEAN NOT NULL DEFAULT false,
  give_discounts BOOLEAN NOT NULL DEFAULT false,
  register_products BOOLEAN NOT NULL DEFAULT false,
  manage_stock BOOLEAN NOT NULL DEFAULT false,
  enable_pay_later BOOLEAN NOT NULL DEFAULT false,
  manage_expenses BOOLEAN NOT NULL DEFAULT false,
  view_analytics BOOLEAN NOT NULL DEFAULT false,
  commission_rate NUMERIC(5,2),       -- % sobre venta total
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON user_permissions;
CREATE POLICY "Service role full access" ON user_permissions FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "User read own" ON user_permissions;
CREATE POLICY "User read own" ON user_permissions FOR SELECT USING (user_id = auth.uid());

-- Profiles: agregar active flag
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- --------------------------------------------------
-- 8) SUPPLIERS
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  doc_id TEXT,
  email TEXT,
  phone TEXT,
  contact_name TEXT,
  address TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(LOWER(name));

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON suppliers;
CREATE POLICY "Service role full access" ON suppliers FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------
-- 9) EXPENSE CATEGORIES
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#64748b',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read" ON expense_categories;
CREATE POLICY "Public read" ON expense_categories FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role full access" ON expense_categories;
CREATE POLICY "Service role full access" ON expense_categories FOR ALL USING (true) WITH CHECK (true);

INSERT INTO expense_categories (name, color, sort_order) VALUES
  ('Proveedores',   '#3b82f6', 10),
  ('Servicios',     '#8b5cf6', 20),
  ('Alquiler',      '#f59e0b', 30),
  ('Impuestos',     '#ef4444', 40),
  ('Sueldos',       '#10b981', 50),
  ('Marketing',     '#ec4899', 60),
  ('Otros',         '#64748b', 99)
ON CONFLICT (name) DO NOTHING;

-- --------------------------------------------------
-- 10) EXPENSES (cuentas por pagar + salidas/gastos)
-- --------------------------------------------------
CREATE TABLE IF NOT EXISTS expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  category_id UUID REFERENCES expense_categories(id) ON DELETE SET NULL,
  amount NUMERIC(14,2) NOT NULL,
  due_date DATE,
  paid_at TIMESTAMPTZ,               -- null = pendiente
  payment_method TEXT,               -- efectivo | tarjeta | transferencia | mercadopago | otro
  status TEXT NOT NULL DEFAULT 'pending', -- pending | paid | overdue | cancelled
  notes TEXT,
  attachment_url TEXT,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurrence_rule TEXT,              -- monthly | weekly | yearly
  recurrence_until DATE,
  parent_expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_due_date ON expenses(due_date);
CREATE INDEX IF NOT EXISTS idx_expenses_supplier ON expenses(supplier_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_paid_at ON expenses(paid_at DESC);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access" ON expenses;
CREATE POLICY "Service role full access" ON expenses FOR ALL USING (true) WITH CHECK (true);

-- --------------------------------------------------
-- 11) VIEWS para Transacciones y Analytics
-- --------------------------------------------------

-- Vista unificada: ventas concluidas + pagos clientes + salidas
CREATE OR REPLACE VIEW transactions_view AS
  SELECT
    'sale'::TEXT AS kind,
    o.id::TEXT AS id,
    o.created_at,
    o.total AS amount,
    COALESCE((SELECT string_agg(DISTINCT method, ', ') FROM order_payments WHERE order_id = o.id), 'pendiente') AS payment_method,
    o.seller_user_id,
    o.customer_id,
    o.channel,
    (SELECT name FROM customers WHERE id = o.customer_id) AS customer_name,
    (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS items_count,
    o.status,
    o.payment_status
  FROM orders o
  WHERE o.status NOT IN ('cancelled')
UNION ALL
  SELECT
    'customer_payment'::TEXT,
    cl.id::TEXT,
    cl.created_at,
    cl.amount,
    COALESCE(cl.payment_method, 'otro'),
    cl.created_by,
    cl.customer_id,
    'manual'::TEXT AS channel,
    (SELECT name FROM customers WHERE id = cl.customer_id) AS customer_name,
    0::BIGINT AS items_count,
    'paid'::TEXT AS status,
    'paid'::TEXT AS payment_status
  FROM customer_ledger cl
  WHERE cl.entry_type = 'payment'
UNION ALL
  SELECT
    'expense'::TEXT,
    e.id::TEXT,
    COALESCE(e.paid_at, e.created_at),
    -e.amount,
    COALESCE(e.payment_method, 'otro'),
    e.created_by,
    NULL::UUID,
    'manual'::TEXT,
    (SELECT name FROM suppliers WHERE id = e.supplier_id),
    0::BIGINT,
    e.status,
    CASE WHEN e.paid_at IS NOT NULL THEN 'paid' ELSE 'pending' END
  FROM expenses e
  WHERE e.paid_at IS NOT NULL;

-- Cash flow diario
CREATE OR REPLACE VIEW cash_flow_daily AS
  SELECT
    DATE(COALESCE(paid_at, created_at)) AS day,
    SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) AS inflow,
    SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) AS outflow,
    SUM(amount) AS net
  FROM (
    SELECT o.created_at AS paid_at, o.created_at, o.total AS amount
    FROM orders o WHERE o.payment_status = 'paid' AND o.status != 'cancelled'
    UNION ALL
    SELECT cl.created_at, cl.created_at, cl.amount
    FROM customer_ledger cl WHERE cl.entry_type = 'payment'
    UNION ALL
    SELECT e.paid_at, e.created_at, -e.amount
    FROM expenses e WHERE e.paid_at IS NOT NULL
  ) t
  WHERE COALESCE(paid_at, created_at) IS NOT NULL
  GROUP BY DATE(COALESCE(paid_at, created_at))
  ORDER BY day DESC;

-- Ventas por usuario últimos 30 días (para comisiones)
CREATE OR REPLACE VIEW sales_by_user_30d AS
  SELECT
    o.seller_user_id AS user_id,
    COUNT(*) AS sales_count,
    SUM(o.total) AS revenue,
    SUM(o.total - COALESCE((SELECT SUM(oi.cost_snapshot * oi.quantity) FROM order_items oi WHERE oi.order_id = o.id), 0)) AS profit,
    AVG(o.total) AS avg_ticket
  FROM orders o
  WHERE o.status != 'cancelled'
    AND o.created_at > NOW() - INTERVAL '30 days'
    AND o.seller_user_id IS NOT NULL
  GROUP BY o.seller_user_id;

-- --------------------------------------------------
-- 12) BALANCE-UPDATING HELPER FUNCTIONS
-- --------------------------------------------------

-- Registrar pago de cliente (reduce deuda o agrega crédito)
CREATE OR REPLACE FUNCTION register_customer_payment(
  p_customer_id UUID,
  p_amount NUMERIC,
  p_payment_method TEXT DEFAULT 'efectivo',
  p_notes TEXT DEFAULT NULL,
  p_created_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_current NUMERIC;
  v_new NUMERIC;
  v_id UUID;
BEGIN
  SELECT balance INTO v_current FROM customers WHERE id = p_customer_id FOR UPDATE;
  v_new := v_current + p_amount;
  INSERT INTO customer_ledger (customer_id, entry_type, amount, balance_after,
                               reference_type, payment_method, notes, created_by)
  VALUES (p_customer_id, 'payment', p_amount, v_new, 'manual', p_payment_method, p_notes, p_created_by)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Aplicar venta a crédito al cliente (crea ledger entry negativa)
CREATE OR REPLACE FUNCTION apply_sale_on_credit(
  p_customer_id UUID,
  p_order_id UUID,
  p_amount NUMERIC,
  p_created_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_current NUMERIC;
  v_new NUMERIC;
  v_id UUID;
BEGIN
  SELECT balance INTO v_current FROM customers WHERE id = p_customer_id FOR UPDATE;
  v_new := v_current - p_amount;
  INSERT INTO customer_ledger (customer_id, entry_type, amount, balance_after,
                               reference_type, reference_id, created_by)
  VALUES (p_customer_id, 'sale', -p_amount, v_new, 'order', p_order_id::TEXT, p_created_by)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------
-- 13) SEED: permisos default para usuarios existentes
-- --------------------------------------------------
INSERT INTO user_permissions (user_id, is_admin, allow_personal_device)
SELECT p.id, (p.role = 'admin'), true
FROM profiles p
WHERE NOT EXISTS (SELECT 1 FROM user_permissions up WHERE up.user_id = p.id);

-- --------------------------------------------------
-- done
-- --------------------------------------------------
