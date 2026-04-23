-- Tabla key-value para flags/config de la app editables desde /admin/configuracion
-- (signup invite-only, checkout con login requerido, etc.)

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON app_settings;
CREATE POLICY "Service role full access" ON app_settings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read settings" ON app_settings;
CREATE POLICY "Public read settings" ON app_settings FOR SELECT USING (true);

INSERT INTO app_settings (key, value, description) VALUES
  ('allow_public_signup', 'true'::jsonb,
   'Si false, la página /registro queda bloqueada y solo se puede crear usuarios desde el admin.'),
  ('require_login_for_orders', 'false'::jsonb,
   'Si true, /api/orders exige sesión — el checkout redirige a /login.')
ON CONFLICT (key) DO NOTHING;
