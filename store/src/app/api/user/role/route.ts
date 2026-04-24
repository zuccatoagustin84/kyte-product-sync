import { getUserRole } from "@/lib/rbac-server";
import { tryGetCurrentTenant } from "@/lib/tenant";
import { createServiceClient } from "@/lib/supabase";

export async function GET() {
  const result = await getUserRole();

  if (!result) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Tenant cross-check: si hay tenant resuelto, el user debe pertenecer a esa
  // company (excepto superadmin que cruza tenants). Defense in depth — el
  // proxy ya hace esto para rutas /admin, pero esta route puede llamarse
  // desde cualquier path.
  const tenant = await tryGetCurrentTenant();
  if (tenant && result.role !== "superadmin") {
    const service = createServiceClient();
    const { data: profile } = await service
      .from("profiles")
      .select("company_id")
      .eq("id", result.userId)
      .maybeSingle();
    if (!profile || profile.company_id !== tenant.id) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return Response.json({ role: result.role });
}
