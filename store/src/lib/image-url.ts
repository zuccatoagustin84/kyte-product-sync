import type { ProductImage } from "@/lib/types";

// Devuelve la mejor URL disponible para el variant pedido, con fallback al
// `url` original (que en imágenes nuevas es la "large", y en imágenes legacy
// es la única disponible).
export function imgUrl(
  image: Pick<ProductImage, "url" | "thumb_url" | "medium_url"> | null | undefined,
  variant: "thumb" | "medium" | "large"
): string {
  if (!image) return "";
  if (variant === "thumb") return image.thumb_url || image.medium_url || image.url;
  if (variant === "medium") return image.medium_url || image.url;
  return image.url;
}
