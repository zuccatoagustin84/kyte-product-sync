import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/rbac-server";

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ["admin"]);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const activeOnly = url.searchParams.get("active") !== "false";

  const supabase = createServiceClient();
  let query = supabase
    .from("suppliers")
    .select("*")
    .order("name", { ascending: true })
    .limit(500);

  if (activeOnly) query = query.eq("active", true);
  if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,doc_id.ilike.%${q}%,email.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Aggregate outstanding balance (sum of unpaid expenses) per supplier
  const { data: pending } = await supabase
    .from("expenses")
    .select("supplier_id, amount")
    .in("status", ["pending", "overdue"])
    .not("supplier_id", "is", null);

  const balances = new Map<string, number>();
  for (const row of pending ?? []) {
    const sid = (row as { supplier_id: string }).supplier_id;
    const amt = Number((row as { amount: number }).amount) || 0;
    balances.set(sid, (balances.get(sid) ?? 0) + amt);
  }

  const suppliers = (data ?? []).map(
    (s: { id: string } & Record<string, unknown>) => ({
      ...s,
      outstanding_balance: balances.get(s.id) ?? 0,
    })
  );

  return Response.json({ suppliers });
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
  if (!name) return Response.json({ error: "Nombre requerido" }, { status: 400 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("suppliers")
    .insert({
      name,
      doc_id: body.doc_id || null,
      email: body.email || null,
      phone: body.phone || null,
      contact_name: body.contact_name || null,
      address: body.address || null,
      notes: body.notes || null,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ supplier: data });
}
