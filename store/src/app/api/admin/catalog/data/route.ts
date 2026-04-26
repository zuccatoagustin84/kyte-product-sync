import { NextRequest } from "next/server";
import { requireRole } from "@/lib/rbac-server";
import { createServiceClient } from "@/lib/supabase";
import { getCurrentTenant } from "@/lib/tenant";

// GET /api/admin/catalog/data
//
// Devuelve TODOS los productos activos de la company agrupados por categoría
// para alimentar la pantalla de catálogo. Es un endpoint dedicado (en vez de
// reusar /api/admin/products) porque queremos:
//   - sin paginación
//   - sólo activos
//   - con la URL de imagen "medium" (mejor compromiso peso/calidad)
//   - ordenado por categoría → nombre

export const runtime = "nodejs";

export type CatalogProductRow = {
  id: string;
  code: string | null;
  name: string;
  sale_price: number;
  description: string | null;
  image_url: string | null;
  medium_image_url: string | null;
  thumb_image_url: string | null;
  category_id: string | null;
  category_name: string | null;
};

export type CatalogDataResponse = {
  products: CatalogProductRow[];
  categories: { id: string; name: string }[];
  companyName: string;
};

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ["admin", "operador", "superadmin"]);
  if (auth instanceof Response) return auth;

  const { id: companyId } = await getCurrentTenant();
  const supabase = createServiceClient();

  const { data: company } = await supabase
    .from("companies")
    .select("name")
    .eq("id", companyId)
    .maybeSingle();

  const { data: cats } = await supabase
    .from("categories")
    .select("id, name")
    .eq("company_id", companyId)
    .order("name");

  const { data: prods, error } = await supabase
    .from("products")
    .select(
      "id, code, name, sale_price, description, image_url, medium_image_url, thumb_image_url, category_id, category:categories(id, name)"
    )
    .eq("company_id", companyId)
    .eq("active", true)
    .order("name");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const products: CatalogProductRow[] = (prods ?? []).map((p: any) => ({
    id: p.id,
    code: p.code ?? null,
    name: p.name,
    sale_price: Number(p.sale_price ?? 0),
    description: p.description ?? null,
    image_url: p.image_url ?? null,
    medium_image_url: p.medium_image_url ?? null,
    thumb_image_url: p.thumb_image_url ?? null,
    category_id: p.category_id ?? null,
    category_name: p.category?.name ?? null,
  }));

  const response: CatalogDataResponse = {
    products,
    categories: (cats ?? []).map((c: any) => ({ id: c.id, name: c.name })),
    companyName: company?.name ?? "Catálogo",
  };

  return Response.json(response);
}
