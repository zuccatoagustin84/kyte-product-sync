# Credenciales de prueba

> ⚠️ Estas credenciales son para **desarrollo y staging**, no para producción real.
> Las passwords están en este archivo a propósito porque el producto todavía no
> está en estado final y queremos onboarding rápido para nuevos colaboradores.
> Cuando el producto sea final: rotar todas, sacar de docs, mover a un secret manager.

## Reset masivo

`scripts/reset-all-passwords.mjs` resetea **todos los users** de Supabase Auth a
los valores listados abajo. Lee el provider y el role para decidir qué password
aplica.

```bash
# Dry-run primero (no escribe nada)
NEXT_PUBLIC_SUPABASE_URL="https://<proj>.supabase.co" \
SUPABASE_SERVICE_KEY="<service_role_key>" \
node scripts/reset-all-passwords.mjs --dry-run

# Aplicar
NEXT_PUBLIC_SUPABASE_URL="https://<proj>.supabase.co" \
SUPABASE_SERVICE_KEY="<service_role_key>" \
node scripts/reset-all-passwords.mjs

# Sólo emails específicos
node scripts/reset-all-passwords.mjs --only=admin.test@mptools-mayorista.com,otro@x.com

# Saltar cuentas con login Google (recomendado en prod si hay clientes reales)
node scripts/reset-all-passwords.mjs --skip-google
```

## Passwords por defecto

| Tipo de usuario | Password |
|---|---|
| Default (admin / operador / cliente / etc.) | `MPTools2026!` |
| Superadmin (cross-tenant) | `SuperMPTools2026!` |

El script detecta superadmins leyendo `profiles.role = 'superadmin'`.

## Usuarios de test conocidos

Los E2E de Playwright dependen de estos:

| Rol | Email | Password |
|---|---|---|
| Admin (tenant `mptools`) | `admin.test@mptools-mayorista.com` | `MPTools2026!` |
| Superadmin | `superadmin.test@mptools-mayorista.com` | `SuperMPTools2026!` |
| Cliente (form fill, no login) | `cliente.test@mptools-mayorista.com` | `MPTools2026!` |

Override por env (CI / GitHub Secrets):

```
TEST_ADMIN_EMAIL
TEST_ADMIN_PASSWORD
TEST_SUPERADMIN_EMAIL
TEST_SUPERADMIN_PASSWORD
```

## Entornos Supabase

| Entorno | Project ref | Notas |
|---|---|---|
| Producción | `knxqeebtynqchhwdmxae` | 1221 productos reales del cliente MP Tools |
| Staging | `tlecvwxzkszgjpucpdij` | Creado 2026-04-05, datos de prueba |

## Cuenta del cliente real (Kyte sync, NO la tienda Supabase)

`mptools.mayorista@gmail.com` usa **Google OAuth** — no tiene password. El
script con `--skip-google` no la toca aunque exista en Supabase.

## Checklist para "producto final"

Antes de salir a producción real con clientes:

- [ ] Rotar todas las passwords listadas acá
- [ ] Eliminar este archivo del repo (o dejarlo como template sin valores reales)
- [ ] Mover credenciales a un secret manager (1Password, Vercel envs)
- [ ] Forzar reset en primer login para todos los users existentes
- [ ] Activar 2FA en cuentas admin/superadmin
