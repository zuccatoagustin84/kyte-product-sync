import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/rbac-server";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: Params) {
  const auth = await requireRole(request, ["superadmin"]);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;

  const service = createServiceClient();
  const [company, products, orders, profiles] = await Promise.all([
    service.from("companies").select("*").eq("id", id).single(),
    service
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("company_id", id),
    service
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("company_id", id),
    service
      .from("profiles")
      .select("id, full_name, role")
      .eq("company_id", id)
      .in("role", ["admin", "operador"]),
  ]);

  if (company.error || !company.data) {
    return Response.json({ error: "Company no encontrada" }, { status: 404 });
  }

  return Response.json({
    company: company.data,
    stats: {
      products: products.count ?? 0,
      orders: orders.count ?? 0,
    },
    staff: profiles.data ?? [],
  });
}

export async function PATCH(request: NextRequest, ctx: Params) {
  const auth = await requireRole(request, ["superadmin"]);
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  for (const key of [
    "name",
    "primary_domain",
    "logo_url",
    "whatsapp_number",
    "contact_email",
    "settings",
    "is_active",
  ]) {
    if (key in body) {
      update[key] = body[key] === "" ? null : body[key];
    }
  }
  if (Object.keys(update).length === 0) {
    return Response.json({ error: "Nada para actualizar" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("companies")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return Response.json(
        { error: "Dominio ya en uso por otra company" },
        { status: 409 }
      );
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ company: data });
}
