-- Product tags (etiquetas transversales: "Ofertas", "Ingresos", "ConDescuento", etc.)
-- No reemplaza a category_id (esa sigue siendo la taxonomía principal);
-- los tags son marcas libres que pueden cruzar categorías.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS tags TEXT[];

-- Índice GIN para filtros tipo `WHERE tags @> ARRAY['Ofertas']`
CREATE INDEX IF NOT EXISTS idx_products_tags ON products USING GIN (tags);
