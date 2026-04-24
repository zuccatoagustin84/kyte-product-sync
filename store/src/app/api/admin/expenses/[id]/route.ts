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
  const { data, error } = await supabase
    .from("expenses")
    .select("*, supplier:suppliers(id,name), category:expense_categories(id,name,color)")
    .eq("id", id)
    .eq("company_id", companyId)
    .single();

  if (error) {
    if (error.code === "PGRST116")
      return Response.json({ error: "Gasto no encontrado" }, { status: 404 });
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ expense: data });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["admin", "superadmin"]);
  if (auth instanceof Response) return auth;
  const { id: companyId } = await getCurrentTenant();
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Verificar que el gasto pertenezca a esta company antes de mutarlo
  const { data: existing } = await supabase
    .from("expenses")
    .select("id")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!existing) {
    return Response.json({ error: "Gasto no encontrado" }, { status: 404 });
  }

  const allowed = [
    "name",
    "supplier_id",
    "category_id",
    "amount",
    "due_date",
    "paid_at",
    "payment_method",
    "status",
    "notes",
    "attachment_url",
    "is_recurring",
    "recurrence_rule",
    "recurrence_until",
  ];
  const update: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  for (const k of allowed) if (k in body) update[k] = body[k];

  // Auto-derive status when marking paid (client can override with explicit status)
  if ("paid_at" in body && body.paid_at && !("status" in body)) {
    update.status = "paid";
  }
  if ("paid_at" in body && !body.paid_at && !("status" in body)) {
    update.status = "pending";
  }

  const { data, error } = await supabase
    .from("expenses")
    .update(update)
    .eq("id", id)
    .eq("company_id", companyId)
    .select("*, supplier:suppliers(id,name), category:expense_categories(id,name,color)")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ expense: data });
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

  const { data: existing } = await supabase
    .from("expenses")
    .select("id")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!existing) {
    return Response.json({ error: "Gasto no encontrado" }, { status: 404 });
  }

  const { error } = await supabase
    .from("expenses")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", companyId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
