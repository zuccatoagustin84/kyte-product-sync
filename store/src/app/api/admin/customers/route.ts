import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/rbac-server";
import { getCurrentTenant } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ["admin", "operador", "superadmin"]);
  if (auth instanceof Response) return auth;
  const { id: companyId } = await getCurrentTenant();

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const activeOnly = url.searchParams.get("active") !== "false";

  const supabase = createServiceClient();
  let query = supabase
    .from("customers")
    .select("*")
    .eq("company_id", companyId)
    .order("name", { ascending: true })
    .limit(500);

  if (activeOnly) query = query.eq("active", true);
  if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,doc_id.ilike.%${q}%,email.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ customers: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ["admin", "operador", "superadmin"]);
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
    .from("customers")
    .insert({
      company_id: companyId,
      name,
      doc_id: body.doc_id || null,
      email: body.email || null,
      phone: body.phone || null,
      phone_alt: body.phone_alt || null,
      address: body.address || null,
      address_complement: body.address_complement || null,
      city: body.city || null,
      state: body.state || null,
      notes: body.notes || null,
      tax_condition: body.tax_condition || null,
      allow_pay_later: Boolean(body.allow_pay_later),
      credit_limit: body.credit_limit ?? null,
      tags: body.tags ?? null,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ customer: data });
}
