# Kyte Product Price Sync - Project Context

## What is this
Tool to sync product prices from a distributor Excel file to [Kyte POS](https://web.kyteapp.com/products) via their undocumented API.
Built for client **MP.TOOLS MAYORISTA** (mptools.mayorista@gmail.com).

## Architecture

### API (discovered by reverse engineering Kyte Web)
- **Base**: `https://kyte-api-gateway.azure-api.net/api/kyte-web`
- **Auth**: Header `Ocp-Apim-Subscription-Key: 62dafa86be9543879a9b32d347c40ab9` (static, embedded in Kyte's frontend JS) + Header `uid` (per-user)
- **GET products**: `/products/{aid}?limit=500&skip=0&sort=PIN_FIRST&isWeb=1` (paginated with skip/limit)
- **PUT product**: `/product` (full object replacement - must send ALL fields)
- **GET categories**: `/products/categories/{aid}`

### Critical: Image handling on PUT
Kyte adds `uid/` prefix and `?alt=media` suffix to image paths automatically on PUT.
The `_strip_image_field()` in `kyte_api.py` strips these before sending to prevent duplication.
**NEVER use `unquote()` on image paths** - it decodes `%2B` to `+` and `%3D` to `=` which Kyte doesn't re-encode, breaking image URLs.

### Authentication
- Client account uses **Google OAuth only** (no email/password in Firebase)
- `kyte_token` stored in browser localStorage, expires in ~1 year
- Token format: `base64("kyte_{aid}.{jwt}")` where JWT payload has `uid` and `exp`
- Firebase API key: `AIzaSyCCxxnrPYhtA-RG-9BsdF9lMMLcEIMJOTk`
- Token can be extracted with `extract_token.py` (Playwright) or `get_token.js` (browser console)

### Client credentials
- **UID**: `cPQI0AQmnlMpcifNbrfqzGZmTNz1`
- **AID**: `cPQI0AQmnlMpci`
- **Email**: mptools.mayorista@gmail.com
- **Google OAuth** (password `yapeyu1820-` is for Gmail, NOT for Firebase)

## Files

| File | Purpose |
|------|---------|
| `app.py` | Streamlit web UI (deployed to Streamlit Cloud) |
| `app_desktop.py` | Desktop GUI (tkinter, build con PyInstaller) |
| `kyte_api.py` | API client (pagination, image cleaning, bulk updates) |
| `sync_prices_api.py` | CLI script (dry-run, report, update) |
| `sync_prices.py` | Legacy Excel-based sync (not used) |
| `extract_token.py` | Playwright token extractor |
| `get_token.js` | Browser console token extractor |
| `sync_descriptions.py` | Sync product descriptions to Supabase |
| `build_desktop.bat` | Build script → `dist/KytePriceSync.exe` |

## Matching logic
- **Code only** (name matching was removed - caused issues)
- Case-insensitive code comparison
- Skips products with price <= 0 in source
- Source Excel auto-detects header row (looks for 'Articulo' + 'Precio')

## Deployments
- **Streamlit Cloud**: https://kyte-appu-5lomurjh9bjmhhkkptqrh4.streamlit.app
- **Vercel — Price Sync** (`web/`): https://web-six-rouge-86.vercel.app
- **Vercel — Tienda Mayorista** (`store/`): https://store-lyart-delta.vercel.app
- **GitHub**: https://github.com/zuccatoagustin84/kyte-product-sync (public)

## Known issues / history
1. First run (79 products) corrupted image URLs by double-encoding uid prefix - FIXED
2. Image repair with `unquote()` broke `%2B`/`%3D` encoding - FIXED with raw string strip
3. All 77 affected images were repaired on 2026-04-01
4. Source Excel has some products with price $0.00 or $0.10 - now filtered out
5. 8 duplicate product codes exist in Kyte (pre-existing, not caused by us)

## IMPORTANT RULES
- **NEVER use `unquote()` on image paths**
- **Always `--dry-run` first** before applying
- **Match by code only** - no name matching
- Test account (Agustin Zuccato) uid/aid: `2Bj9r4qNoYRd5JdTXX0rHMI9hjg2` / `2Bj9r4qNoYRd5J`

## Crear productos (Streamlit)
La app permite crear productos en Kyte (POST `/product`) desde la pestaña
**"En Excel, no en Kyte"**. Solo se ofrecen los marcados como **SIN MATCH** con
código no vacío y precio > 0. La selección por defecto es vacía y requiere
elegir categoría destino y confirmar antes del POST.

El payload se arma en `KyteClient.build_product_payload()` clonando un producto
existente como plantilla, eliminando `_id`/timestamps y vaciando imágenes.

## Las 5 opciones de uso
1. **CLI** — `python sync_prices_api.py --dry-run`
2. **Streamlit local** — `streamlit run app.py`
3. **Streamlit Cloud** — https://kyte-appu-5lomurjh9bjmhhkkptqrh4.streamlit.app
4. **Desktop .exe** — `dist/KytePriceSync.exe` (doble clic, build con `build_desktop.bat`)
5. **Vercel/Next.js** — https://web-six-rouge-86.vercel.app (`web/`)

## Tienda Mayorista (proyecto aparte)
- **Stack**: Next.js + Supabase + Vercel
- **URL**: https://store-lyart-delta.vercel.app (`store/`)
- **Supabase**: proyecto `knxqeebtynqchhwdmxae` (org: MP Tools, región: sa-east-1)
- 1221 productos y 16 categorías migrados desde Kyte
- Funcionalidades: catálogo, búsqueda, carrito, pedidos → Supabase + WhatsApp
- **Credenciales de test / staging**: ver [`store/docs/CREDENTIALS.md`](store/docs/CREDENTIALS.md)
  - Default: `MPTools2026!` · Superadmin: `SuperMPTools2026!`
  - Reset masivo: `node scripts/reset-all-passwords.mjs` (en `store/`)

### Múltiples imágenes por producto
- **Tabla**: `product_images` (id, product_id, url, sort_order, is_primary, created_at)
- **Storage**: Supabase Storage bucket `product-images` (público)
- **Migración**: `store/supabase-migration-product-images.sql` (migra `image_url` existentes)
- **Admin UI**: `ImageManager` component en el sheet de editar producto — drag & drop, reordenar, marcar principal, eliminar
- **Detalle público**: galería con thumbnails y flechas de navegación
- **Backwards compat**: `products.image_url` se mantiene sincronizado con la imagen principal
- **API routes**:
  - `GET/POST/PUT/DELETE /api/admin/products/[id]/images` — gestión admin (requiere auth)
  - `GET /api/products/[id]/images` — lectura pública
- **Límites**: máx 5MB por imagen, formatos JPG/PNG/WebP/GIF

## Proceso de trabajo — Tienda Mayorista

**Por defecto: commitear y pushear directo a `main`.**

Solo crear rama + PR + preview de Vercel cuando el usuario lo pida explícitamente.
Cuando el usuario pida PR/preview, seguir este flujo:

1. Crear rama: `git checkout -b feature/nombre-feature`
2. Desarrollar y commitear en la rama
3. Push: `git push origin feature/nombre-feature`
   → Vercel deployea automáticamente una **preview URL**
4. Crear PR: `feature/nombre-feature` → `main`
5. El usuario revisa la preview y mergea el PR
   → Vercel deployea automáticamente a **producción**

## Next steps
- Firmar el .exe con un certificado (opcional, evita warnings de Windows Defender)
- Dominio custom para la tienda mayorista
- Crear usuario admin en staging via `/setup` para validar el RBAC
