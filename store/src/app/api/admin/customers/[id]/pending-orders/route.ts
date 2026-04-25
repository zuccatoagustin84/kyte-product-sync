// GET /api/admin/customers/[id]/pending-orders
// Lista las órdenes del cliente con saldo pendiente (payment_status != paid).
// Devuelve total, pagado a la fecha y pendiente — listas para imputar pagos.

import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/rbac-server";
import { getCurrentTenant } from "@/lib/tenant";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["admin", "operador", "superadmin"]);
  if (auth instanceof Response) return auth;

  const { id: companyId } = await getCurrentTenant();
  const { id: customerId } = await params;

  const supabase = createServiceClient();

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, order_number, created_at, total, payment_status, status")
    .eq("company_id", companyId)
    .eq("customer_id", customerId)
    .neq("payment_status", "paid")
    .neq("status", "cancelled")
    .order("created_at", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Cargar pagos en una sola query
  const ids = (orders ?? []).map((o) => o.id);
  const paidByOrder: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: pays } = await supabase
      .from("order_payments")
      .select("order_id, amount")
      .in("order_id", ids)
      .eq("company_id", companyId);
    for (const p of pays ?? []) {
      paidByOrder[p.order_id as string] =
        (paidByOrder[p.order_id as string] ?? 0) + Number(p.amount ?? 0);
    }
  }

  const enriched = (orders ?? []).map((o) => {
    const total = Number(o.total ?? 0);
    const paid = paidByOrder[o.id as string] ?? 0;
    return {
      id: o.id,
      order_number: o.order_number,
      created_at: o.created_at,
      total,
      paid,
      pending: Math.max(0, total - paid),
      payment_status: o.payment_status,
      status: o.status,
    };
  });

  return Response.json({ orders: enriched });
}
