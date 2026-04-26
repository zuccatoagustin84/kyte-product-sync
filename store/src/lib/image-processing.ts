import sharp from "sharp";
import { createServiceClient } from "@/lib/supabase";

// ── Sizes ────────────────────────────────────────────────────────────────────
//
// Mantenemos un set chico de variantes:
//   - thumb  → 200px (listas / miniaturas en grilla admin)
//   - medium → 600px (catálogos PDF/HTML, cards)
//   - large  → 1200px (vista detalle del producto)
//
// `large` se guarda como la URL principal en `product_images.url` para que
// quede compatible con el código actual que usa `url` directamente.

export const IMAGE_SIZES = {
  thumb: 200,
  medium: 600,
  large: 1200,
} as const;

export type ImageVariant = keyof typeof IMAGE_SIZES;

const BUCKET = "product-images";

// ── Processing ───────────────────────────────────────────────────────────────

export type ProcessedVariants = {
  large: { buffer: Buffer; width: number; height: number };
  medium: { buffer: Buffer; width: number; height: number };
  thumb: { buffer: Buffer; width: number; height: number };
  originalWidth: number;
  originalHeight: number;
};

// Convierte cualquier input (jpg/png/webp/gif) a 3 variantes JPEG con calidad
// optimizada por tamaño. JPEG es universal y comprime bien para fotos de
// producto; WebP da mejor ratio pero algunos clientes (impresión, PDF) tienen
// soporte irregular, así que vamos a JPEG que es el lowest common denominator.
export async function processImage(input: Buffer): Promise<ProcessedVariants> {
  const meta = await sharp(input).metadata();
  const originalWidth = meta.width ?? 0;
  const originalHeight = meta.height ?? 0;

  async function resize(maxWidth: number, quality: number) {
    const pipeline = sharp(input, { failOn: "none" })
      // Aplanamos transparencia contra blanco — los catálogos quedan mejor
      // con fondo blanco que con un canal alpha que no todos los visores
      // respetan.
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .resize({
        width: maxWidth,
        height: maxWidth,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality, progressive: true, mozjpeg: true });

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    return { buffer: data, width: info.width, height: info.height };
  }

  const [large, medium, thumb] = await Promise.all([
    resize(IMAGE_SIZES.large, 82),
    resize(IMAGE_SIZES.medium, 80),
    resize(IMAGE_SIZES.thumb, 75),
  ]);

  return { large, medium, thumb, originalWidth, originalHeight };
}

// ── Upload ───────────────────────────────────────────────────────────────────

export type UploadedImageUrls = {
  url: string;          // large
  medium_url: string;
  thumb_url: string;
  width: number;
  height: number;
};

// Sube las 3 variantes a Storage y devuelve sus URLs públicas.
// `keyPrefix` es algo como `${productId}/${timestamp}-${random}` (sin extensión).
export async function uploadVariants(
  variants: ProcessedVariants,
  keyPrefix: string
): Promise<UploadedImageUrls> {
  const supabase = createServiceClient();

  async function put(name: string, buf: Buffer): Promise<string> {
    const path = `${keyPrefix}-${name}.jpg`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: "image/jpeg", upsert: false });
    if (error) throw new Error(`upload ${name}: ${error.message}`);
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  const [largeUrl, mediumUrl, thumbUrl] = await Promise.all([
    put("large", variants.large.buffer),
    put("medium", variants.medium.buffer),
    put("thumb", variants.thumb.buffer),
  ]);

  return {
    url: largeUrl,
    medium_url: mediumUrl,
    thumb_url: thumbUrl,
    width: variants.large.width,
    height: variants.large.height,
  };
}

// Helper one-shot: procesa + sube + devuelve URLs.
export async function processAndUpload(
  input: Buffer,
  productId: string
): Promise<UploadedImageUrls> {
  const variants = await processImage(input);
  const keyPrefix = `${productId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return uploadVariants(variants, keyPrefix);
}
