-- Flag per-company para hacer el catálogo totalmente privado.
-- Cuando true, las páginas públicas (/, /p/*) requieren sesión.
-- Idempotente: re-ejecutable.

INSERT INTO app_settings (company_id, key, value, description)
SELECT c.id, 'require_login_for_catalog', 'false'::jsonb,
       'Si true, el catálogo público (/, /p/*) requiere sesión iniciada.'
  FROM companies c
 WHERE NOT EXISTS (
   SELECT 1 FROM app_settings s
    WHERE s.company_id = c.id AND s.key = 'require_login_for_catalog'
 );
