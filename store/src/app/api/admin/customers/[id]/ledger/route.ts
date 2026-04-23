import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/rbac-server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["admin", "operador"]);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("customer_ledger")
    .select("*")
    .eq("customer_id", id)
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
  const auth = await requireRole(request, ["admin", "operador"]);
  if (auth instanceof Response) return auth;
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
  const { data, error } = await supabase
    .from("customer_ledger")
    .insert({
      customer_id: id,
      entry_type: body.entry_type,
      amount,
      payment_method: body.payment_method ?? null,
      notes: body.notes ?? null,
      reference_type: body.reference_type ?? null,
      reference_id: body.reference_id ?? null,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ entry: data });
}
