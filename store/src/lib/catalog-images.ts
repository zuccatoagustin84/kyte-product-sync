import type { CatalogCategory } from "./catalog";

export type PdfImageData = { data: Buffer; format: "jpg" | "png" };
export type ImageCache = Map<string, PdfImageData | null>;

function mimeToFormat(mime: string | null): "jpg" | "png" | null {
  if (!mime) return null;
  const lower = mime.toLowerCase();
  if (lower.includes("jpeg") || lower.includes("jpg")) return "jpg";
  if (lower.includes("png")) return "png";
  return null;
}

/**
 * Fetches every unique image URL referenced by the catalog and returns a cache
 * mapping URL → { data, format } (or null on failure/unsupported format).
 *
 * We preload instead of letting @react-pdf/renderer fetch on its own because a
 * single broken image aborts the whole document render — this way missing
 * images degrade gracefully to the placeholder.
 */
export async function preloadImages(
  categories: CatalogCategory[],
  concurrency = 12,
): Promise<ImageCache> {
  const urls = new Set<string>();
  for (const cat of categories) {
    for (const p of cat.products) {
      if (p.imageUrl) urls.add(p.imageUrl);
    }
  }

  const list = Array.from(urls);
  const cache: ImageCache = new Map();
  let idx = 0;

  async function worker() {
    while (idx < list.length) {
      const i = idx++;
      const url = list[i];
      try {
        const res = await fetch(url);
        if (!res.ok) {
          cache.set(url, null);
          continue;
        }
        const format = mimeToFormat(res.headers.get("content-type"));
        if (!format) {
          cache.set(url, null);
          continue;
        }
        const buf = Buffer.from(await res.arrayBuffer());
        cache.set(url, { data: buf, format });
      } catch {
        cache.set(url, null);
      }
    }
  }

  const workerCount = Math.min(concurrency, list.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return cache;
}
