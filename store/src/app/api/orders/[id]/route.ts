import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return Response.json({ error: "ID de pedido requerido" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Fetch order
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, customer_name, customer_phone, customer_email, customer_company, notes, total, status, created_at, user_id")
    .eq("id", id)
    .single();

  if (orderError || !order) {
    return Response.json({ error: "Pedido no encontrado" }, { status: 404 });
  }

  // Check access: either the order belongs to the logged-in user, or it's a guest order accessed by ID
  let isOwner = false;
  try {
    const serverSupabase = await createSupabaseServer();
    const { data: { user } } = await serverSupabase.auth.getUser();
    if (user && order.user_id === user.id) {
      isOwner = true;
    }
  } catch {
    // Not authenticated
  }

  // Fetch order items
  const { data: items } = await supabase
    .from("order_items")
    .select("id, product_name, product_code, unit_price, quantity, subtotal")
    .eq("order_id", id)
    .order("id", { ascending: true });

  return Response.json({
    order: {
      id: order.id,
      customer_name: order.customer_name,
      customer_company: order.customer_company,
      customer_phone: order.customer_phone,
      customer_email: order.customer_email,
      notes: order.notes,
      total: order.total,
      status: order.status,
      created_at: order.created_at,
      is_owner: isOwner,
    },
    items: items ?? [],
  });
}
