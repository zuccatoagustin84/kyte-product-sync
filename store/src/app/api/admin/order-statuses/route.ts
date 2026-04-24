import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/rbac-server";
import { getCurrentTenant } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ["admin", "operador", "superadmin"]);
  if (auth instanceof Response) return auth;
  const { id: companyId } = await getCurrentTenant();

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("order_statuses")
    .select("id, name, color, sort_order, is_default, is_closed, is_cancelled, is_active")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ statuses: data ?? [] });
}
