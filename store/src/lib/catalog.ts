/**
 * Catalog data builder — groups Supabase `Product` rows into categories ready
 * to be rendered by the PDF generator.
 */
import type { Product } from "./types";

export interface CatalogProduct {
  name: string;
  code: string;
  salePrice: number;
  imageUrl: string | null;
  hasImage: boolean;
}

export interface CatalogCategory {
  name: string;
  products: CatalogProduct[];
}

export function buildCategories(
  products: Product[],
  options: { filterCategory?: string; showPrices?: boolean } = {},
): CatalogCategory[] {
  const { filterCategory } = options;
  const buckets = new Map<string, CatalogProduct[]>();

  for (const p of products) {
    if (!p.active) continue;
    const catName = p.category?.name?.trim() || "Sin categoría";
    if (
      filterCategory &&
      catName.toLowerCase() !== filterCategory.toLowerCase()
    ) {
      continue;
    }

    const imageUrl = p.image_url || null;
    if (!buckets.has(catName)) buckets.set(catName, []);
    buckets.get(catName)!.push({
      name: p.name ?? "",
      code: String(p.code ?? ""),
      salePrice: p.sale_price ?? 0,
      imageUrl,
      hasImage: !!imageUrl,
    });
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, prods]) => ({
      name,
      products: prods.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}
