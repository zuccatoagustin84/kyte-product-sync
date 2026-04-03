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

export async function POST(request: NextRequest) {
  const user = await checkAdmin();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  if (!body.name || !body.sale_price) {
    return Response.json(
      { error: "Los campos name y sale_price son requeridos" },
      { status: 400 }
    );
  }

  const id =
    (body.id as string | undefined) ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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
  const insert: Record<string, unknown> = { id };
  for (const key of allowed) {
    if (key in body) {
      insert[key] = body[key];
    }
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("products")
    .insert(insert)
    .select("*, category:categories(id,name)")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ product: data }, { status: 201 });
}
