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
    .from("customers")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .single();

  if (error) {
    if (error.code === "PGRST116")
      return Response.json({ error: "Cliente no encontrado" }, { status: 404 });
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ customer: data });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["admin", "operador", "superadmin"]);
  if (auth instanceof Response) return auth;
  const { id: companyId } = await getCurrentTenant();
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const allowed = [
    "name",
    "doc_id",
    "email",
    "phone",
    "phone_alt",
    "address",
    "address_complement",
    "city",
    "state",
    "notes",
    "tax_condition",
    "allow_pay_later",
    "credit_limit",
    "tags",
    "active",
  ];
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of allowed) if (k in body) update[k] = body[k];

  const supabase = createServiceClient();

  // Verify the customer belongs to this company before updating
  const { data: existing } = await supabase
    .from("customers")
    .select("id")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!existing) {
    return Response.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("customers")
    .update(update)
    .eq("id", id)
    .eq("company_id", companyId)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ customer: data });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["admin", "superadmin"]);
  if (auth instanceof Response) return auth;
  const { id: companyId } = await getCurrentTenant();
  const { id } = await params;

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("customers")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", companyId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
