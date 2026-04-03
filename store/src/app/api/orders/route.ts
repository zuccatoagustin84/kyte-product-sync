import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import type { OrderPayload } from "@/lib/types";

export async function POST(request: NextRequest) {
  let body: OrderPayload;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo de la solicitud inválido" }, { status: 400 });
  }

  // Validate required fields
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

  const supabase = createServiceClient();

  // Insert order
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      customer_name: body.customer_name.trim(),
      customer_phone: body.customer_phone?.trim() || null,
      customer_email: body.customer_email?.trim() || null,
      customer_company: body.customer_company?.trim() || null,
      notes: body.notes?.trim() || null,
      total: body.total,
      status: "pending",
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

  // Insert order items
  const orderItems = body.items.map((item) => ({
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
