-- Migration: Add product_images table for multiple image support
-- Run this in Supabase SQL Editor

-- 1. Create product_images table
CREATE TABLE IF NOT EXISTS product_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Index for fast lookup by product
CREATE INDEX idx_product_images_product_id ON product_images(product_id);

-- 3. Enable RLS
ALTER TABLE product_images ENABLE ROW LEVEL SECURITY;

-- 4. Public read access (anyone can see product images)
CREATE POLICY "Public read access" ON product_images
  FOR SELECT USING (true);

-- 5. Service role full access (API routes use service key)
CREATE POLICY "Service role full access" ON product_images
  FOR ALL USING (true) WITH CHECK (true);

-- 6. Create storage bucket for product images (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- 7. Storage policy: public read
CREATE POLICY "Public read product images" ON storage.objects
  FOR SELECT USING (bucket_id = 'product-images');

-- 8. Storage policy: authenticated upload/delete (service role handles this)
CREATE POLICY "Service upload product images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "Service delete product images" ON storage.objects
  FOR DELETE USING (bucket_id = 'product-images');

-- 9. Migrate existing image_url data into product_images
INSERT INTO product_images (product_id, url, sort_order, is_primary)
SELECT id, image_url, 0, true
FROM products
WHERE image_url IS NOT NULL AND image_url != '';
