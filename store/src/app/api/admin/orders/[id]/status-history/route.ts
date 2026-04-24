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

  const { data, error } = await supabase
    .from("order_status_history")
    .select("id, order_id, status, changed_by, changed_at, notes")
    .eq("order_id", id)
    .eq("company_id", companyId)
    .order("changed_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const userIds = Array.from(
    new Set(rows.map((r) => r.changed_by).filter((x): x is string => Boolean(x)))
  );

  const profilesMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    for (const p of profiles ?? []) {
      profilesMap[p.id as string] = (p.full_name as string) ?? "";
    }
  }

  const entries = rows.map((r) => ({
    id: r.id,
    order_id: r.order_id,
    status: r.status,
    changed_by: r.changed_by,
    changed_by_name: r.changed_by ? profilesMap[r.changed_by] ?? null : null,
    changed_at: r.changed_at,
    notes: r.notes,
  }));

  return Response.json({ entries });
}
