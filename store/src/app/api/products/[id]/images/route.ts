import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";

// GET /api/products/[id]/images — public: list images for a product
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("product_images")
    .select("id, url, sort_order, is_primary")
    .eq("product_id", id)
    .order("sort_order");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ images: data ?? [] });
}
