import { NextRequest } from "next/server";
import { createElement } from "react";
import { requireRole } from "@/lib/rbac-server";
import { createServiceClient } from "@/lib/supabase";
import { buildCategories } from "@/lib/catalog";
import { preloadImages } from "@/lib/catalog-images";
import { CatalogDocument, type CatalogMode } from "@/lib/catalog-pdf";
import { renderToBuffer } from "@/lib/react-pdf-compat";
import type { Product } from "@/lib/types";

// @react-pdf/renderer needs the Node runtime (uses Node streams, Buffer, etc.)
export const runtime = "nodejs";
// Leave the function more headroom for large catalogs with many images.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ["admin", "operador"]);
  if (auth instanceof Response) return auth;

  let body: {
    filterCategory?: string;
    showPrices?: boolean;
    companyName?: string;
    mode?: CatalogMode;
  };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const {
    filterCategory,
    showPrices = true,
    companyName = "MP.TOOLS MAYORISTA",
    mode = "grid",
  } = body;

  if (mode !== "grid" && mode !== "list") {
    return Response.json(
      { error: "mode debe ser 'grid' o 'list'" },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();

  // Page through PostgREST's default row limit.
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
      { status: 400 },
    );
  }

  const generatedDate = new Date().toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Preload every referenced image so a single broken URL doesn't abort the
  // whole PDF render — missing images fall back to a placeholder.
  const imageCache = await preloadImages(categories);

  const buffer = await renderToBuffer(
    createElement(CatalogDocument, {
      categories,
      companyName,
      generatedDate,
      showPrices,
      mode,
      imageCache,
    }),
  );

  const catSlug = !filterCategory
    ? "completo"
    : filterCategory
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "");

  const filename = `catalogo_${catSlug}_${mode}_${new Date()
    .toISOString()
    .slice(0, 10)}.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
