import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/rbac-server";
import { getCurrentTenant } from "@/lib/tenant";
import { log } from "@/lib/log";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["admin", "operador", "superadmin"]);
  if (auth instanceof Response) return auth;
  const { id: companyId } = await getCurrentTenant();
  const { id } = await params;

  const supabase = createServiceClient();

  // Verify the customer belongs to this company
  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!customer) {
    return Response.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("customer_ledger")
    .select("*")
    .eq("customer_id", id)
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ entries: data ?? [] });
}

type PostBody = {
  entry_type: "payment" | "credit_add" | "credit_sub" | "adjust";
  amount: number;
  payment_method?: string;
  notes?: string;
  reference_type?: string;
  reference_id?: string;
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["admin", "operador", "superadmin"]);
  if (auth instanceof Response) return auth;
  const { id: companyId } = await getCurrentTenant();
  const { id } = await params;

  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const valid = ["payment", "credit_add", "credit_sub", "adjust"];
  if (!valid.includes(body.entry_type)) {
    return Response.json({ error: "entry_type inválido" }, { status: 400 });
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount === 0) {
    return Response.json({ error: "Monto inválido" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Leemos balance + verificamos tenant en una sola query
  const { data: customer } = await supabase
    .from("customers")
    .select("id, balance")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!customer) {
    return Response.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  // amount en customer_ledger es signed: + suma al saldo, - resta. El UI manda
  // siempre positivo y delega el signo al entry_type.
  const signedAmount =
    body.entry_type === "credit_sub" ? -Math.abs(amount) : amount;
  const currentBalance = Number(customer.balance ?? 0);
  const balanceAfter = Math.round((currentBalance + signedAmount) * 100) / 100;

  const { data, error } = await supabase
    .from("customer_ledger")
    .insert({
      company_id: companyId,
      customer_id: id,
      entry_type: body.entry_type,
      amount: signedAmount,
      balance_after: balanceAfter,
      payment_method: body.payment_method ?? null,
      notes: body.notes ?? null,
      reference_type: body.reference_type ?? null,
      reference_id: body.reference_id ?? null,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (error) {
    log.error("ledger_insert_failed", {
      company_id: companyId,
      customer_id: id,
      entry_type: body.entry_type,
      amount: signedAmount,
      db_error: error.message,
    });
    return Response.json({ error: error.message }, { status: 500 });
  }

  log.info("ledger_entry_recorded", {
    company_id: companyId,
    customer_id: id,
    user_id: auth.userId,
    entry_type: body.entry_type,
    amount: signedAmount,
    balance_after: balanceAfter,
  });

  return Response.json({ entry: data });
}
