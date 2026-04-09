import { NextRequest } from "next/server";
import { requireRole } from "@/lib/rbac-server";
import { createServiceClient } from "@/lib/supabase";
import { buildCategories, generateCatalogHtml } from "@/lib/catalog";
import type { Product } from "@/lib/types";

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ["admin", "operador"]);
  if (auth instanceof Response) return auth;

  let body: { filterCategory?: string; showPrices?: boolean; companyName?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const { filterCategory, showPrices = true, companyName = "MP.TOOLS MAYORISTA" } = body;

  const supabase = createServiceClient();

  // Fetch all active products, paginated to bypass PostgREST's default row limit.
  const PAGE = 1000;
  const all: Product[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select("*, category:categories(id,name,sort_order)")
      .eq("active", true)
      .order("sort_order")
      .range(offset, offset + PAGE - 1);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    if (!data || data.length === 0) break;
    all.push(...(data as Product[]));
    if (data.length < PAGE) break;
    offset += PAGE;
  }

  if (all.length === 0) {
    return Response.json({ error: "Sin productos activos" }, { status: 400 });
  }

  const categories = buildCategories(all, { filterCategory, showPrices });

  if (categories.length === 0) {
    return Response.json(
      { error: "No se encontraron productos para los filtros seleccionados" },
      { status: 400 }
    );
  }

  const html = generateCatalogHtml(categories, {
    companyName,
    showPrices,
    generatedDate: new Date().toLocaleDateString("es-AR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  });

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
