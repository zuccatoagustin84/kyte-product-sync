import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/rbac-server";
import { getCurrentTenant } from "@/lib/tenant";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["admin", "superadmin"]);
  if (auth instanceof Response) return auth;
  const { id: companyId } = await getCurrentTenant();
  const { id } = await params;

  const supabase = createServiceClient();

  // Tenant cross-check: verificar que el seller pertenezca a esta company.
  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!targetProfile) {
    return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  // Last 30d orders for this seller (excluding cancelled), filtered by company.
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, total, status, created_at")
    .eq("company_id", companyId)
    .eq("seller_user_id", id)
    .gte("created_at", since)
    .neq("status", "cancelled");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const ordersCount = orders?.length ?? 0;
  const total = (orders ?? []).reduce(
    (s, o) => s + Number(o.total ?? 0),
    0
  );
  const avgTicket = ordersCount > 0 ? total / ordersCount : 0;

  // Fetch commission_rate (user_permissions hereda tenant via profiles —
  // ya validamos arriba que el user es de esta company).
  const { data: perms } = await supabase
    .from("user_permissions")
    .select("commission_rate")
    .eq("user_id", id)
    .maybeSingle();

  const rate = perms?.commission_rate != null ? Number(perms.commission_rate) : 0;
  const commission = total * (rate / 100);

  return Response.json({
    orders: ordersCount,
    total,
    avgTicket,
    commission,
    commission_rate: rate,
    period_days: 30,
  });
}
