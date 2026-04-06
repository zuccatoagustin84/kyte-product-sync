import { NextRequest, NextResponse } from "next/server";
import { buildCategories, generateCatalogHtml } from "@/lib/catalog";
import type { KyteProduct } from "@/lib/kyte";

export async function POST(req: NextRequest) {
  try {
    const { products, filterCategory, showPrices, companyName } = await req.json() as {
      products: KyteProduct[];
      filterCategory?: string;
      showPrices?: boolean;
      companyName?: string;
    };

    if (!products?.length)
      return NextResponse.json({ error: "Sin productos" }, { status: 400 });

    const categories = buildCategories(products, { filterCategory, showPrices });
    const html = generateCatalogHtml(categories, {
      companyName,
      showPrices,
      generatedDate: new Date().toLocaleDateString("es-AR", {
        day: "numeric", month: "long", year: "numeric",
      }),
    });

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
