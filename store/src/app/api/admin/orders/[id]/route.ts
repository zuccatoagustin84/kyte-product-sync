import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";

type OrderStatus = "pending" | "confirmed" | "cancelled";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let body: { status?: OrderStatus };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const validStatuses: OrderStatus[] = ["pending", "confirmed", "cancelled"];
  if (!body.status || !validStatuses.includes(body.status)) {
    return Response.json(
      { error: "Estado inválido. Debe ser: pending, confirmed o cancelled" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("orders")
    .update({ status: body.status })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return Response.json({ error: "Pedido no encontrado" }, { status: 404 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ order: data });
}
