# Multi-Tenancy (Companies)

Diseño y guía de implementación para soportar múltiples negocios (companies) sobre el mismo deployment de la tienda.

## Decisiones de diseño

| Aspecto | Decisión | Por qué |
|---|---|---|
| Modelo de aislamiento | **Single database, shared schema** con columna `company_id` | Económico, fácil de operar, suficiente para B2B de baja escala. RLS lo hace seguro. |
| Resolución de tenant | **Subdominio** (`mptools.tutienda.com`) + **dominio custom opcional** | Cada cliente percibe que es su tienda; no hay paths feos. Vercel soporta wildcard nativo. |
| Membership | **Un usuario pertenece a una sola company** (`profiles.company_id`) | El usuario lo confirmó. Simplifica auth, permisos, queries. |
| Datos compartidos entre tenants | **Ninguno** | Confirmado. Cada company es una isla. |
| Enforcement de aislamiento | **RLS en Postgres** (defensa primaria) + **filtros app-layer** (defensa secundaria) | Aunque la app olvide filtrar, RLS impide cross-tenant. |
| Resolución a anon | **Header propagado por `proxy.ts`** desde el host → app filtra por `company_id` | Para anon no hay JWT con claim de company; el host es la única señal. |
| Resolución a auth | **Función SQL `current_company_id()`** que lee de `profiles.company_id` | No requiere hook de JWT custom. STABLE → cacheada por query. |
| Tenant superadmin (vos) | `profiles.company_id IS NULL` + `profiles.role = 'superadmin'` | Puede crear/listar companies vía service role. |

## Modelo

```
companies
  id              uuid pk
  slug            text unique          -- "mptools" → mptools.tutienda.com
  name            text
  primary_domain  text unique nullable -- "tienda.mptools.com.ar" (opcional)
  logo_url        text nullable
  whatsapp_number text nullable
  contact_email   text nullable
  is_active       bool
  settings        jsonb                -- per-company app settings (allow_public_signup, etc.)
  created_at, updated_at

profiles
  id          uuid pk (= auth.users.id)
  company_id  uuid fk → companies(id) nullable -- NULL solo para superadmin
  role        text  -- superadmin | admin | operador | user
  ...

products, categories, orders, order_items, customers, customer_ledger,
order_payments, order_status_history, suppliers, expenses,
expense_categories, order_statuses, product_images, user_permissions,
app_settings
  + company_id uuid not null fk → companies(id)
```

## Resolución de tenant (request lifecycle)

```
1. Browser hits  mptools.lvh.me:3000/productos
2. proxy.ts:
   - parsea host → "mptools"
   - SELECT id FROM companies WHERE slug='mptools' OR primary_domain='mptools.lvh.me'
   - Si no existe: 404 → /tenant-not-found
   - Si existe: setea request headers
       x-tenant-id: <uuid>
       x-tenant-slug: mptools
3. Server Components / Route Handlers:
   - Leen company desde headers via getCurrentCompany() en lib/tenant.ts
   - Pasan company_id a queries (.eq("company_id", ...))
4. Supabase + RLS:
   - Si auth: RLS valida que company_id de la fila == current_company_id() (= profiles.company_id del user)
   - Si anon (catálogo público): RLS allow-read si la tabla es pública; el filtro app-layer determina qué company se ve
```

## Estrategia de RLS

Tablas se clasifican en dos:

**Públicas (anon + auth pueden leer):** `products`, `categories`, `product_images`, `companies`, `order_statuses`

```sql
-- SELECT abierto a anon (la app filtra por company_id desde el host)
-- SELECT a auth: solo su company
-- INSERT/UPDATE/DELETE: solo si company_id = current_company_id()
```

**Privadas (solo auth de la misma company):** `orders`, `order_items`, `customers`, `customer_ledger`, `order_payments`, `order_status_history`, `suppliers`, `expenses`, `expense_categories`, `user_permissions`, `app_settings`

```sql
-- SELECT/INSERT/UPDATE/DELETE: company_id = current_company_id()
-- Service role siempre bypassa
```

`current_company_id()` es una función `STABLE` que retorna `profiles.company_id` del `auth.uid()`, o `NULL` para anon. Las policies privadas con `NULL` no matchean → 0 filas.

## Patrón en código

### Server Components / Route Handlers

```ts
// lib/tenant.ts
import { headers } from "next/headers";

export async function getCurrentCompany() {
  const h = await headers();
  const id = h.get("x-tenant-id");
  const slug = h.get("x-tenant-slug");
  if (!id) throw new Error("Tenant not resolved");
  return { id, slug: slug! };
}

// app/productos/page.tsx
const { id: companyId } = await getCurrentCompany();
const { data } = await supabase
  .from("products")
  .select("*")
  .eq("company_id", companyId);  // app-layer filter (defense in depth)
```

### Auth + RBAC

```ts
// rbac-server.ts ya verifica role.
// Agregamos: profile.company_id debe == tenant resuelto desde host.
const { id: tenantId } = await getCurrentCompany();
if (profile.company_id !== tenantId) return forbidden(); // user de otra company hitando este host
```

## Setup local con lvh.me

`lvh.me` y todos sus subdominios resuelven a `127.0.0.1`. **No requiere editar `/etc/hosts` ni Traefik.**

```bash
# .env.local
NEXT_PUBLIC_TENANT_DEV_HOST=lvh.me

# Correr
pnpm dev  # o npm run dev

# Probar en el browser
http://mptools.lvh.me:3000        # tenant MP.TOOLS
http://otra.lvh.me:3000           # otra company
http://localhost:3000             # sin subdominio → fallback (ver más abajo)
```

**Fallback sin subdominio:** si el host es `localhost` puro (sin slug), `proxy.ts` puede:
- Redirigir al slug por defecto (configurable via env `NEXT_PUBLIC_DEFAULT_TENANT_SLUG=mptools`)
- O mostrar una landing pública con lista de tiendas

## Setup en producción (Vercel)

1. Configurar **wildcard domain** `*.tutienda.com` en el proyecto de Vercel
2. Apuntar el DNS de `tutienda.com` a Vercel (CNAME `*.tutienda.com → cname.vercel-dns.com`)
3. Por cada company nueva: insert en `companies` con su `slug`. Funciona inmediatamente.
4. Para dominio custom de un cliente:
   - Agregar el dominio al proyecto de Vercel
   - Setear `companies.primary_domain` con ese dominio
   - `proxy.ts` resuelve por `primary_domain` antes que por slug

## Migración de datos existentes

La migración `005-multi-tenancy.sql`:

1. Crea tabla `companies`
2. Inserta company default `mptools` (id `00000000-0000-0000-0000-000000000001`) con todos los datos actuales
3. Agrega `company_id` a cada tabla con default = mptools, backfill, luego `NOT NULL`
4. Reemplaza policies viejas por nuevas con filtro de company
5. Crea función `current_company_id()`

**La migración es idempotente y backwards-compatible** — el deploy actual sigue funcionando porque el host de prod resuelve al slug `mptools`.

## Roadmap de implementación

- [x] Diseño documentado (este archivo)
- [ ] Migración SQL `005-multi-tenancy.sql`
- [ ] `proxy.ts` con resolución de tenant
- [ ] `lib/tenant.ts` con helpers server-side
- [ ] `lib/app-settings.ts` per-company
- [ ] `lib/rbac-server.ts` valida tenant match
- [ ] Adaptar API routes (42) para usar `getCurrentCompany()` y filtrar — tarea incremental
- [ ] UI superadmin para crear companies (`/superadmin/companies`)
- [ ] Wildcard domain en Vercel + verificar staging primero
