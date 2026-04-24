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
  const { id } = await params;

  const supabase = createServiceClient();

  const { data: order, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return Response.json({ error: "Pedido no encontrado" }, { status: 404 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  const [itemsRes, paymentsRes, historyRes] = await Promise.all([
    supabase
      .from("order_items")
      .select("*")
      .eq("order_id", id)
      .eq("company_id", companyId),
    supabase
      .from("order_payments")
      .select("*")
      .eq("order_id", id)
      .eq("company_id", companyId)
      .order("paid_at", { ascending: false }),
    supabase
      .from("order_status_history")
      .select("*")
      .eq("order_id", id)
      .eq("company_id", companyId)
      .order("changed_at", { ascending: false }),
  ]);

  // Enrich seller and customer details
  let sellerName: string | null = null;
  if (order.seller_user_id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", order.seller_user_id)
      .maybeSingle();
    sellerName = profile?.full_name ?? null;
  }

  let customer = null;
  if (order.customer_id) {
    const { data: c } = await supabase
      .from("customers")
      .select("*")
      .eq("id", order.customer_id)
      .eq("company_id", companyId)
      .maybeSingle();
    customer = c ?? null;
  }

  const payments = paymentsRes.data ?? [];
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount ?? 0), 0);

  return Response.json({
    order: { ...order, seller_name: sellerName },
    items: itemsRes.data ?? [],
    payments,
    status_history: historyRes.data ?? [],
    customer,
    total_paid: totalPaid,
    balance_due: Math.max(0, Number(order.total ?? 0) - totalPaid),
  });
}
