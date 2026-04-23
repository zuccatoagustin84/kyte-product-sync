import { createServiceClient } from "@/lib/supabase";
import { getUser } from "@/lib/supabase-server";

// Devuelve el customer linkeado del usuario logueado + sus últimos movimientos.
// Si no tiene customer, retorna { customer: null, entries: [] }.
export async function GET() {
  const user = await getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServiceClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (!customer) return Response.json({ customer: null, entries: [] });

  const { data: entries } = await supabase
    .from("customer_ledger")
    .select("*")
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false })
    .limit(50);

  return Response.json({ customer, entries: entries ?? [] });
}
