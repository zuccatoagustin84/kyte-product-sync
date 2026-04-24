import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/rbac-server";
import { getCurrentTenant } from "@/lib/tenant";

type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "shipped"
  | "delivered"
  | "cancelled";

type PaymentStatus = "pending" | "partial" | "paid";

type UpdatePayload = {
  status?: OrderStatus;
  payment_status?: PaymentStatus;
  notes_internal?: string | null;
  shipping_total?: number;
  discount_total?: number;
  fulfilled_at?: string | null;
};

const VALID_STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
];

const VALID_PAYMENT_STATUSES: PaymentStatus[] = ["pending", "partial", "paid"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["admin", "operador", "superadmin"]);
  if (auth instanceof Response) return auth;
  const { id: companyId } = await getCurrentTenant();

  const { id } = await params;

  let body: UpdatePayload;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return Response.json(
        { error: `Estado inválido. Debe ser uno de: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }
    update.status = body.status;
  }

  if (body.payment_status !== undefined) {
    if (!VALID_PAYMENT_STATUSES.includes(body.payment_status)) {
      return Response.json(
        { error: "Estado de pago inválido" },
        { status: 400 }
      );
    }
    update.payment_status = body.payment_status;
  }

  if (body.notes_internal !== undefined) update.notes_internal = body.notes_internal;

  if (body.shipping_total !== undefined) {
    if (typeof body.shipping_total !== "number" || body.shipping_total < 0) {
      return Response.json({ error: "shipping_total inválido" }, { status: 400 });
    }
    update.shipping_total = body.shipping_total;
  }

  if (body.discount_total !== undefined) {
    if (typeof body.discount_total !== "number" || body.discount_total < 0) {
      return Response.json({ error: "discount_total inválido" }, { status: 400 });
    }
    update.discount_total = body.discount_total;
  }

  if (body.fulfilled_at !== undefined) update.fulfilled_at = body.fulfilled_at;

  if (Object.keys(update).length === 0) {
    return Response.json({ error: "Sin cambios" }, { status: 400 });
  }

  update.updated_at = new Date().toISOString();

  const supabase = createServiceClient();

  // If transitioning to delivered and fulfilled_at not explicitly provided, set it
  if (body.status === "delivered" && body.fulfilled_at === undefined) {
    update.fulfilled_at = new Date().toISOString();
  }

  // Grab previous status to track history
  const { data: prevOrder, error: prevError } = await supabase
    .from("orders")
    .select("status")
    .eq("id", id)
    .eq("company_id", companyId)
    .single();

  if (prevError) {
    if (prevError.code === "PGRST116") {
      return Response.json({ error: "Pedido no encontrado" }, { status: 404 });
    }
    return Response.json({ error: prevError.message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("orders")
    .update(update)
    .eq("id", id)
    .eq("company_id", companyId)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return Response.json({ error: "Pedido no encontrado" }, { status: 404 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Insert status history entry if status changed
  if (body.status !== undefined && body.status !== prevOrder?.status) {
    await supabase.from("order_status_history").insert({
      company_id: companyId,
      order_id: id,
      status: body.status,
      changed_by: auth.userId,
      notes: `${prevOrder?.status ?? "?"} → ${body.status}`,
    });
  }

  return Response.json({ order: data });
}
