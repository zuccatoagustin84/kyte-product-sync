import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createSupabaseServer } from "@/lib/supabase-server";
import { ProductDetail } from "@/components/product/ProductDetail";
import type { Product } from "@/lib/types";
import { Header } from "@/components/Header";
import { CartSheet } from "@/components/cart/CartSheet";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: product } = await supabase
    .from("products")
    .select("*, category:categories(id,name)")
    .eq("id", id)
    .eq("active", true)
    .single();

  if (!product) {
    return { title: "Producto no encontrado" };
  }

  const categoryName = (product.category as { id: string; name: string } | null)?.name;
  const description = [
    categoryName ? `Categoría: ${categoryName}` : null,
    `Precio: $${Math.round(product.sale_price).toLocaleString("es-AR")}`,
    product.description ?? null,
  ]
    .filter(Boolean)
    .join(" — ");

  return {
    title: `${product.name} | MP Tools Mayorista`,
    description,
  };
}

export default async function ProductPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createSupabaseServer();
  const { data: product } = await supabase
    .from("products")
    .select("*, category:categories(id,name)")
    .eq("id", id)
    .eq("active", true)
    .single();

  if (!product) {
    notFound();
  }

  return (
    <>
      <Header />
      <ProductDetail product={product as Product} />
      <CartSheet />
    </>
  );
}
