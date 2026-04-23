import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/rbac-server";
import { normalizeTags } from "@/lib/tags";

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ["admin", "operador"]);
  if (auth instanceof Response) return auth;

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
    "description",
    "tags",
  ];
  const insert: Record<string, unknown> = { id };
  for (const key of allowed) {
    if (key in body) {
      insert[key] = body[key];
    }
  }

  if ("tags" in insert) {
    insert.tags = normalizeTags(insert.tags);
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
