-- Migration: Add thumbnail and medium image variants to product_images.
--
-- Strategy:
--   - `url`        → "large"  (max 1200px width, mantendrá el original si ya está abajo de eso)
--   - `medium_url` → 600px width (catálogos)
--   - `thumb_url`  → 200px width (listas, miniaturas)
--
-- Filas existentes quedan con NULL en medium/thumb hasta que el script de backfill
-- las regenere; el frontend hace fallback a `url` cuando un variant no está disponible.

ALTER TABLE product_images
  ADD COLUMN IF NOT EXISTS thumb_url TEXT,
  ADD COLUMN IF NOT EXISTS medium_url TEXT,
  ADD COLUMN IF NOT EXISTS width INTEGER,
  ADD COLUMN IF NOT EXISTS height INTEGER;

-- Tag para saber qué imagen vino de búsqueda web vs upload directo.
ALTER TABLE product_images
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'upload';
-- valores esperados: 'upload' | 'web-search' | 'kyte-import'

-- Denormalizamos thumb/medium en `products` también, para que listings
-- (catálogo público, tabla admin) puedan elegir la mejor URL sin tener que
-- joinear con product_images. Se mantienen sincronizados cuando se cambia la
-- imagen primaria.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS thumb_image_url TEXT,
  ADD COLUMN IF NOT EXISTS medium_image_url TEXT;
