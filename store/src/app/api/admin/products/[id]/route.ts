import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createSupabaseServer } from "@/lib/supabase-server";

async function checkAdmin() {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim());
  if (!user || !adminEmails.includes(user.email ?? "")) {
    return null;
  }
  return user;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await checkAdmin();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  // Only allow updating known fields
  const allowed = [
    "name",
    "code",
    "sale_price",
    "cost_price",
    "stock",
    "min_order",
    "active",
    "category_id",
  ];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) {
      update[key] = body[key];
    }
  }

  if (Object.keys(update).length === 0) {
    return Response.json({ error: "Sin campos para actualizar" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("products")
    .update(update)
    .eq("id", id)
    .select("*, category:categories(id,name)")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return Response.json({ error: "Producto no encontrado" }, { status: 404 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ product: data });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await checkAdmin();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const supabase = createServiceClient();

  const { error } = await supabase.from("products").delete().eq("id", id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true });
}
