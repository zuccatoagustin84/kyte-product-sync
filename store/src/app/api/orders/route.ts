import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createSupabaseServer } from "@/lib/supabase-server";
import { getAppSettings } from "@/lib/app-settings";
import { getCurrentTenant } from "@/lib/tenant";
import type { OrderPayload } from "@/lib/types";

export async function POST(request: NextRequest) {
  const { id: companyId } = await getCurrentTenant();
  let body: OrderPayload;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo de la solicitud inválido" }, { status: 400 });
  }

  if (!body.customer_name?.trim()) {
    return Response.json(
      { error: "El nombre del cliente es requerido" },
      { status: 400 }
    );
  }

  if (!body.items || body.items.length === 0) {
    return Response.json(
      { error: "El pedido debe tener al menos un producto" },
      { status: 400 }
    );
  }

  let userId: string | null = null;
  try {
    const serverSupabase = await createSupabaseServer();
    const { data: { user } } = await serverSupabase.auth.getUser();
    userId = user?.id ?? null;
  } catch {
    // sin sesión
  }

  const settings = await getAppSettings(companyId);
  if (settings.require_login_for_orders && !userId) {
    return Response.json(
      { error: "Tenés que iniciar sesión para hacer un pedido", code: "LOGIN_REQUIRED" },
      { status: 401 }
    );
  }

  const supabase = createServiceClient();

  // Si hay usuario logueado con customer linkeado de esta company, usamos esa ficha
  let linkedCustomerId: string | null = null;
  if (userId) {
    const { data: linked } = await supabase
      .from("customers")
      .select("id")
      .eq("user_id", userId)
      .eq("company_id", companyId)
      .eq("active", true)
      .maybeSingle();
    linkedCustomerId = linked?.id ?? null;
  }

  // Insert order — company_id es NOT NULL en la tabla post-migración 005.
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      company_id: companyId,
      customer_name: body.customer_name.trim(),
      customer_phone: body.customer_phone?.trim() || null,
      customer_email: body.customer_email?.trim() || null,
      customer_company: body.customer_company?.trim() || null,
      notes: body.notes?.trim() || null,
      total: body.total,
      status: "pending",
      ...(userId ? { user_id: userId } : {}),
      ...(linkedCustomerId ? { customer_id: linkedCustomerId } : {}),
    })
    .select("id")
    .single();

  if (orderError || !order) {
    console.error("Error creating order:", orderError);
    return Response.json(
      { error: "Error al crear el pedido" },
      { status: 500 }
    );
  }

  // Insert order items — heredan company_id del order parent.
  const orderItems = body.items.map((item) => ({
    company_id: companyId,
    order_id: order.id,
    product_id: item.product_id,
    product_name: item.product_name,
    product_code: item.product_code || null,
    unit_price: item.unit_price,
    quantity: item.quantity,
    subtotal: item.subtotal,
  }));

  const { error: itemsError } = await supabase
    .from("order_items")
    .insert(orderItems);

  if (itemsError) {
    console.error("Error creating order items:", itemsError);
    // Order was created but items failed — return partial error
    return Response.json(
      { error: "Error al guardar los productos del pedido" },
      { status: 500 }
    );
  }

  return Response.json({ success: true, orderId: order.id }, { status: 201 });
}
