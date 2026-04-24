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
    .from("expense_categories")
    .select("*")
    .eq("company_id", companyId)
    .order("sort_order", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ categories: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ["admin", "superadmin"]);
  if (auth instanceof Response) return auth;
  const { id: companyId } = await getCurrentTenant();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  if (!name) return Response.json({ error: "Nombre requerido" }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("expense_categories")
    .insert({
      company_id: companyId,
      name,
      color: body.color || "#64748b",
      sort_order: Number(body.sort_order ?? 50),
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ category: data });
}
