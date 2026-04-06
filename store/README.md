# Tienda Mayorista MP Tools

Catálogo mayorista online para **MP.TOOLS MAYORISTA**.
Stack: Next.js 16 + Supabase + Vercel.

## URLs

| Entorno | URL | Supabase |
|---------|-----|----------|
| **Producción** | https://store-lyart-delta.vercel.app | `knxqeebtynqchhwdmxae` |
| **Staging** | Preview automático por branch (ver CI) | `tlecvwxzkszgjpucpdij` |

## Admin

| Entorno | Email | Password |
|---------|-------|----------|
| Producción | mptools.mayorista@gmail.com | Google OAuth |
| Staging | admin@staging.mptools | Admin1234! |

Acceso al panel: `/admin`

## Desarrollo local

```bash
cd store
npm install
npm run dev
```

Abre http://localhost:3000

### Variables de entorno (`.env.local`)

```env
NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_KEY=...
ADMIN_EMAILS=tu@email.com
```

## Deploy

Automático vía GitHub Actions (`.github/workflows/deploy-store.yml`):

- Push a `main` → producción
- Push a `staging` o `feature/**` → preview con Supabase staging

Manual:
```bash
vercel deploy --cwd store            # preview (staging Supabase)
vercel deploy --prod --cwd store     # producción
```

## Migraciones Supabase

Archivos `.sql` en la raíz de `store/` para ejecutar en el SQL Editor de Supabase.

| Archivo | Descripción |
|---------|-------------|
| `supabase-migration-product-images.sql` | Tabla `product_images` — múltiples imágenes por producto |

## Funcionalidades

- Catálogo con búsqueda y filtro por categoría
- Detalle de producto con galería (múltiples fotos, thumbnails, flechas)
- Carrito → pedido por WhatsApp
- Panel admin `/admin`: productos, categorías, pedidos, imágenes (drag & drop)
- Auth con Supabase (Google OAuth en prod, email/password en staging)
