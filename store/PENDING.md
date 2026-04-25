# Pendientes — sesión del 2026-04-25

Bundle de admin features mergeado a `main` en commit `f355a04` (merge `a638c0a`).
Vercel debería estar deployando. Ver listado abajo.

## 1. Migración pendiente en Supabase prod

**Archivo**: `store/supabase-migrations/006-private-catalog.sql`

Sembrar el flag `require_login_for_catalog` en `app_settings` para cada company.
Idempotente, sin riesgo, y no bloqueante (el toggle funciona igual sin esta
fila — recién aparece en DB cuando alguien lo cambia por primera vez).

```sql
INSERT INTO app_settings (company_id, key, value, description)
SELECT c.id, 'require_login_for_catalog', 'false'::jsonb,
       'Si true, el catálogo público (/, /p/*) requiere sesión iniciada.'
  FROM companies c
 WHERE NOT EXISTS (
   SELECT 1 FROM app_settings s
    WHERE s.company_id = c.id AND s.key = 'require_login_for_catalog'
 );
```

Correr desde Supabase SQL Editor del proyecto `knxqeebtynqchhwdmxae` o vía
conector configurado en la próxima sesión.

## 2. Smoke test del bundle (validar en prod después del deploy)

| Feature | Dónde | Qué probar |
|---------|-------|------------|
| Alta de usuario operario | `/admin/usuarios` → botón "Nuevo usuario" | Crear con password, verificar que loguea. Crear por invitación, verificar email. |
| Catálogo privado | `/admin/configuracion` → toggle "Catálogo privado" | Activar, abrir `/` en incógnito → debe redirigir a `/login`. |
| Auto-link customer↔user | `/perfil` de un user con `customers.user_id IS NULL` y email matchado | Tiene que aparecer la sección "Mi cuenta" con saldo y ledger. |
| Form de perfil completo | `/perfil` → "Editar datos" | Editar CUIT, dirección, ciudad, provincia, condición fiscal — guardar y refrescar. |
| Branding | `/admin/configuracion/branding` | Cambiar paleta, recargar (los CSS vars se inyectan en SSR — hace falta refresh). |
| Logo upload | `/admin/configuracion/branding` | Subir un PNG/SVG, verificar que aparece en Header y Sidebar. |
| Imputación de pagos | `/admin/clientes` → click en cliente con deuda | Componente "Registrar pago e imputar" muestra órdenes pendientes, FIFO funciona. |
| Remito PDF | `/admin/pedidos` → seleccionar pedido → "Remito (sin precios)" | PDF descarga con espacio para firma, sin precios. |

## 3. Bugs preexistentes que pueden molestar

**`POST /api/admin/customers/[id]/ledger`** (no fue tocado en este bundle):
no setea `customer_ledger.balance_after` aunque la columna es NOT NULL. Si
alguien usa el form viejo de "Cobrar pago / Agregar crédito" en el sheet de
saldo de cliente (no el `PaymentAllocator` nuevo), va a fallar. El nuevo flujo
de `PaymentAllocator` SÍ setea balance_after correctamente.

Solución sugerida cuando haya tiempo: en `store/src/app/api/admin/customers/[id]/ledger/route.ts:91`
calcular `balance_after = currentBalance + amount` antes del insert (mismo
patrón que `payment/route.ts`). O agregar un BEFORE INSERT trigger en SQL que
lo calcule.

## 4. Fuera de scope

- **Factura AFIP**: requiere certificado WSAA + integración con webservice
  fiscal. Decidir librería (typescript-afip o similar) y CUIT antes. **No
  hacer ahora.**

## 5. Mejoras menores (opcionales)

- **Cambio de branding sin reload**: actualmente al guardar el branding hay
  que refrescar para ver los cambios completos (los CSS vars vienen del SSR).
  Mejorable con un hot-reload del lado cliente.

## 6. Resumen del último commit

`f355a04 feat(store): admin features bundle — usuarios, branding, cuenta corriente, remito`

27 archivos cambiados, +2767 / -100. Cubre Fases A (alta usuarios + catálogo
privado + auto-link + perfil completo), B (branding completo) y C (imputación
de pagos + remito PDF).

Typecheck (`tsc --noEmit`) pasa limpio. Lint solo reporta errores
preexistentes en archivos que no se tocaron.
