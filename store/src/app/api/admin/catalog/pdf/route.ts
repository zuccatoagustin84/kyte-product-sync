import { NextRequest } from "next/server";
import { requireRole } from "@/lib/rbac-server";
import { createServiceClient } from "@/lib/supabase";
import { getCurrentTenant } from "@/lib/tenant";
import {
  renderCatalogHtml,
  formatGeneratedDate,
  type CatalogCategory,
} from "@/lib/catalog-template";

// POST /api/admin/catalog/pdf
//
// Mismo input que /html, pero devuelve un PDF generado con puppeteer-core +
// @sparticuz/chromium. Tarda más (5-30s en Vercel según el tamaño del catálogo
// y la red descargando imágenes).
//
// IMPORTANTE: necesitamos chromium serverless porque Vercel no tiene Chrome
// instalado. @sparticuz/chromium provee un binario precompilado para AWS Lambda.

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min — generación + descarga de imágenes

type Body = {
  format: "grid" | "list";
  showPrices: boolean;
  categoryOrder: string[];
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

  const byCat = new Map<string, CatalogCategory>();
  for (const id of body.categoryOrder) {
    byCat.set(id, { name: "", products: [] });
  }

  let total = 0;
  for (const p of prods ?? []) {
    const catId = (p.category_id as string | null) ?? "__none";
    const bucket = byCat.get(catId);
    if (!bucket) continue;
    if (!bucket.name) bucket.name = (p as any).category?.name ?? "Sin categoría";
    bucket.products.push({
      name: (p as any).name,
      code: (p as any).code ?? "",
      salePrice: Number((p as any).sale_price ?? 0),
      imageUrl: (p as any).medium_image_url ?? (p as any).image_url ?? null,
      description: (p as any).description ?? null,
    });
    total++;
  }

  for (const [id, bucket] of byCat.entries()) {
    if (!bucket.name) {
      if (id === "__none") bucket.name = "Sin categoría";
      else {
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

  // ── Puppeteer ──────────────────────────────────────────────────────────────
  // En dev local usamos puppeteer normal si está disponible; en Vercel
  // usamos puppeteer-core + @sparticuz/chromium.
  const isDev = process.env.NODE_ENV !== "production" || !!process.env.PUPPETEER_LOCAL;

  let browser: any;
  try {
    if (isDev) {
      // En dev, intentamos resolver Chrome local. Si no hay, fallback a
      // chromium serverless (más lento pero funciona).
      const puppeteerCore = await import("puppeteer-core");
      const localPath = process.env.PUPPETEER_EXECUTABLE_PATH;
      if (localPath) {
        browser = await puppeteerCore.launch({
          executablePath: localPath,
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
      } else {
        browser = await launchServerlessChromium();
      }
    } else {
      browser = await launchServerlessChromium();
    }

    const page = await browser.newPage();
    await page.setViewport({ width: 794, height: 1123 }); // A4 @ 96dpi
    await page.setContent(html, { waitUntil: "networkidle0", timeout: 60000 });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", right: "12mm", bottom: "18mm", left: "12mm" },
    });

    await browser.close();

    return new Response(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="catalogo.pdf"`,
      },
    });
  } catch (err: any) {
    if (browser) {
      try { await browser.close(); } catch {}
    }
    return Response.json(
      { error: `Error generando PDF: ${err?.message ?? String(err)}` },
      { status: 500 }
    );
  }
}

async function launchServerlessChromium() {
  const chromium = (await import("@sparticuz/chromium")).default;
  const puppeteer = await import("puppeteer-core");
  return puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
  });
}
