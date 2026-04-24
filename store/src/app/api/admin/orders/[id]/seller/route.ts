import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/rbac-server";
import { getCurrentTenant } from "@/lib/tenant";

type UpdateSellerPayload = {
  seller_user_id?: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["admin", "superadmin"]);
  if (auth instanceof Response) return auth;
  const { id: companyId } = await getCurrentTenant();

  const { id } = await params;

  let body: UpdateSellerPayload;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  if (!("seller_user_id" in body)) {
    return Response.json(
      { error: "seller_user_id es requerido" },
      { status: 400 }
    );
  }

  const sellerId = body.seller_user_id;

  if (sellerId !== null) {
    if (typeof sellerId !== "string" || !UUID_RE.test(sellerId)) {
      return Response.json(
        { error: "seller_user_id inválido" },
        { status: 400 }
      );
    }
  }

  const supabase = createServiceClient();

  if (sellerId !== null) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, role, company_id")
      .eq("id", sellerId)
      .single();

    if (profileError || !profile) {
      return Response.json(
        { error: "Vendedor no encontrado" },
        { status: 404 }
      );
    }

    // Ensure the seller belongs to the same company
    if (profile.company_id !== companyId) {
      return Response.json(
        { error: "El vendedor no pertenece a esta empresa" },
        { status: 400 }
      );
    }

    const role = (profile.role as string) ?? "";
    if (role !== "admin" && role !== "operador") {
      return Response.json(
        { error: "El usuario debe ser admin u operador" },
        { status: 400 }
      );
    }
  }

  const { data, error } = await supabase
    .from("orders")
    .update({
      seller_user_id: sellerId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("company_id", companyId)
    .select()
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return Response.json({ error: "Pedido no encontrado" }, { status: 404 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ order: data });
}
