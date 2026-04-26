import { NextRequest } from "next/server";
import { requireRole } from "@/lib/rbac-server";
import { createServiceClient } from "@/lib/supabase";
import { getCurrentTenant } from "@/lib/tenant";
import {
  renderCatalogHtml,
  formatGeneratedDate,
  type CatalogCategory,
} from "@/lib/catalog-template";

// POST /api/admin/catalog/html
//
// Body: { format, showPrices, categoryOrder: string[], companyName? }
// categoryOrder es una lista de IDs de categoría; el orden se respeta en el
// catálogo. Si una categoría no está en la lista, se omite.
//
// Devuelve el HTML directamente (text/html).

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  format: "grid" | "list";
  showPrices: boolean;
  categoryOrder: string[]; // IDs en el orden deseado
  companyName?: string;
};

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ["admin", "operador", "superadmin"]);
  if (auth instanceof Response) return auth;

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  if (!Array.isArray(body.categoryOrder) || body.categoryOrder.length === 0) {
    return Response.json({ error: "categoryOrder requerido" }, { status: 400 });
  }

  const { id: companyId } = await getCurrentTenant();
  const supabase = createServiceClient();

  const { data: company } = await supabase
    .from("companies")
    .select("name")
    .eq("id", companyId)
    .maybeSingle();

  const { data: prods, error } = await supabase
    .from("products")
    .select(
      "id, code, name, sale_price, description, image_url, medium_image_url, category_id, category:categories(id, name)"
    )
    .eq("company_id", companyId)
    .eq("active", true)
    .order("name");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Agrupar por category_id, respetando el orden recibido.
  const byCat = new Map<string, CatalogCategory>();
  for (const id of body.categoryOrder) {
    byCat.set(id, { name: "", products: [] });
  }

  let total = 0;
  for (const p of prods ?? []) {
    const catId = (p.category_id as string | null) ?? "__none";
    const bucket = byCat.get(catId);
    if (!bucket) continue;
    if (!bucket.name) {
      bucket.name = (p as any).category?.name ?? "Sin categoría";
    }
    bucket.products.push({
      name: (p as any).name,
      code: (p as any).code ?? "",
      salePrice: Number((p as any).sale_price ?? 0),
      imageUrl: (p as any).medium_image_url ?? (p as any).image_url ?? null,
      description: (p as any).description ?? null,
    });
    total++;
  }

  // Si hay un bucket sin nombre (categoría que no tiene productos), lo
  // resolvemos por la tabla categories.
  for (const [id, bucket] of byCat.entries()) {
    if (!bucket.name) {
      if (id === "__none") {
        bucket.name = "Sin categoría";
      } else {
        const { data: cat } = await supabase
          .from("categories")
          .select("name")
          .eq("id", id)
          .maybeSingle();
        bucket.name = cat?.name ?? "Categoría";
      }
    }
  }

  const categories = Array.from(byCat.values()).filter((c) => c.products.length > 0);

  const html = renderCatalogHtml({
    companyName: body.companyName ?? company?.name ?? "Catálogo",
    format: body.format,
    showPrices: body.showPrices,
    generatedDate: formatGeneratedDate(),
    totalProducts: total,
    categories,
  });

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}
