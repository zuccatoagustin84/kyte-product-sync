import { NextRequest } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createSupabaseServer();

  // First get the product's category
  const { data: product } = await supabase
    .from("products")
    .select("category_id")
    .eq("id", id)
    .single();

  if (!product?.category_id) {
    return Response.json({ products: [] });
  }

  const { data } = await supabase
    .from("products")
    .select("*, category:categories(id,name)")
    .eq("category_id", product.category_id)
    .eq("active", true)
    .neq("id", id)
    .limit(4);

  return Response.json({ products: data ?? [] });
}
