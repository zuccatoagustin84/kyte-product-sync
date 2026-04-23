import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/rbac-server";

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ["admin"]);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const categoryId = url.searchParams.get("category_id");
  const supplierId = url.searchParams.get("supplier_id");
  const status = url.searchParams.get("status");

  const supabase = createServiceClient();
  let query = supabase
    .from("expenses")
    .select("*, supplier:suppliers(id,name), category:expense_categories(id,name,color)")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1000);

  if (from) query = query.gte("due_date", from);
  if (to) query = query.lte("due_date", to);
  if (categoryId) query = query.eq("category_id", categoryId);
  if (supplierId) query = query.eq("supplier_id", supplierId);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Mark overdue in-memory for clients that ask for status filters
  const today = new Date().toISOString().slice(0, 10);
  const expenses = (data ?? []).map((e: Record<string, unknown>) => {
    if (
      e.status === "pending" &&
      typeof e.due_date === "string" &&
      e.due_date < today
    ) {
      return { ...e, status: "overdue" };
    }
    return e;
  });

  return Response.json({ expenses });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ["admin"]);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const amount = Number(body.amount);
  if (!name) return Response.json({ error: "Nombre requerido" }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) {
    return Response.json({ error: "Monto inválido" }, { status: 400 });
  }

  const paidAt =
    body.paid_at != null && String(body.paid_at).length > 0
      ? String(body.paid_at)
      : null;
  const status = paidAt ? "paid" : "pending";

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("expenses")
    .insert({
      name,
      supplier_id: body.supplier_id || null,
      category_id: body.category_id || null,
      amount,
      due_date: body.due_date || null,
      paid_at: paidAt,
      payment_method: body.payment_method || null,
      status,
      notes: body.notes || null,
      attachment_url: body.attachment_url || null,
      is_recurring: Boolean(body.is_recurring),
      recurrence_rule: body.recurrence_rule || null,
      recurrence_until: body.recurrence_until || null,
      created_by: "userId" in auth ? auth.userId : null,
    })
    .select("*, supplier:suppliers(id,name), category:expense_categories(id,name,color)")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ expense: data });
}
