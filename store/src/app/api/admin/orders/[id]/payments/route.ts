import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/rbac-server";

const VALID_METHODS = [
  "efectivo",
  "tarjeta",
  "transferencia",
  "mercadopago",
  "credito_cliente",
  "otro",
] as const;

type PaymentMethod = (typeof VALID_METHODS)[number];

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["admin", "operador"]);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("order_payments")
    .select("*")
    .eq("order_id", id)
    .order("paid_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ payments: data ?? [] });
}

type PostBody = {
  method: PaymentMethod;
  amount: number;
  reference?: string | null;
  notes?: string | null;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["admin", "operador"]);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  if (!body.method || !VALID_METHODS.includes(body.method)) {
    return Response.json({ error: "Método de pago inválido" }, { status: 400 });
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return Response.json({ error: "Monto inválido" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Ensure order exists and get its total
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, total")
    .eq("id", id)
    .single();

  if (orderErr) {
    if (orderErr.code === "PGRST116") {
      return Response.json({ error: "Pedido no encontrado" }, { status: 404 });
    }
    return Response.json({ error: orderErr.message }, { status: 500 });
  }

  // Insert payment
  const { data: payment, error: payErr } = await supabase
    .from("order_payments")
    .insert({
      order_id: id,
      method: body.method,
      amount,
      reference: body.reference ?? null,
      notes: body.notes ?? null,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (payErr) return Response.json({ error: payErr.message }, { status: 500 });

  // Recompute payment_status
  const { data: allPays } = await supabase
    .from("order_payments")
    .select("amount")
    .eq("order_id", id);

  const totalPaid = (allPays ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const orderTotal = Number(order.total ?? 0);

  let newStatus: "pending" | "partial" | "paid";
  if (totalPaid <= 0) newStatus = "pending";
  else if (totalPaid + 0.009 >= orderTotal) newStatus = "paid";
  else newStatus = "partial";

  const { data: updatedOrder, error: updErr } = await supabase
    .from("orders")
    .update({ payment_status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (updErr) return Response.json({ error: updErr.message }, { status: 500 });

  return Response.json({
    payment,
    order: updatedOrder,
    total_paid: totalPaid,
    payment_status: newStatus,
  });
}
