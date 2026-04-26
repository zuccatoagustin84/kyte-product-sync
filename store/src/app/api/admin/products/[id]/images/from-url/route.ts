import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/rbac-server";
import { getCurrentTenant } from "@/lib/tenant";
import { processAndUpload } from "@/lib/image-processing";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST /api/admin/products/[id]/images/from-url
// Body: { url: string, source?: string }
//
// Descarga la URL externa con headers de browser (algunos hosts devuelven 403
// si falta Referer/User-Agent), procesa con sharp y la sube como una imagen
// más del producto.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["admin", "operador", "superadmin"]);
  if (auth instanceof Response) return auth;
  const { id: companyId } = await getCurrentTenant();

  const { id } = await params;

  let body: { url?: string; source?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const sourceUrl = (body.url || "").trim();
  if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
    return Response.json({ error: "URL inválida" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: ownerCheck } = await supabase
    .from("products")
    .select("id")
    .eq("id", id)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!ownerCheck) {
    return Response.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  // Headers tipo browser para sortear filtros simples de hotlinking.
  let originHeader = "";
  try {
    const u = new URL(sourceUrl);
    originHeader = `${u.protocol}//${u.host}`;
  } catch {
    /* ignore */
  }

  async function fetchBuffer(includeReferer: boolean): Promise<Buffer> {
    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
    };
    if (includeReferer && originHeader) headers["Referer"] = originHeader;

    const res = await fetch(sourceUrl, { headers, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arr = new Uint8Array(await res.arrayBuffer());
    return Buffer.from(arr);
  }

  let buffer: Buffer;
  try {
    buffer = await fetchBuffer(true);
  } catch (e) {
    // Algunos hosts devuelven 403 cuando hay Referer cruzado; reintento sin él.
    try {
      buffer = await fetchBuffer(false);
    } catch (e2) {
      return Response.json(
        {
          error: `No se pudo descargar la imagen (${(e as Error).message} / ${(e2 as Error).message})`,
        },
        { status: 502 }
      );
    }
  }

  if (buffer.length > 15 * 1024 * 1024) {
    return Response.json(
      { error: "La imagen pesa más de 15MB, demasiado grande." },
      { status: 413 }
    );
  }

  let urls;
  try {
    urls = await processAndUpload(buffer, id);
  } catch (e) {
    return Response.json(
      { error: `Procesando: ${(e as Error).message}` },
      { status: 500 }
    );
  }

  const { count } = await supabase
    .from("product_images")
    .select("*", { count: "exact", head: true })
    .eq("product_id", id)
    .eq("company_id", companyId);
  const isFirst = (count ?? 0) === 0;

  const { data: imageRow, error: insertError } = await supabase
    .from("product_images")
    .insert({
      company_id: companyId,
      product_id: id,
      url: urls.url,
      medium_url: urls.medium_url,
      thumb_url: urls.thumb_url,
      width: urls.width,
      height: urls.height,
      sort_order: count ?? 0,
      is_primary: isFirst,
      source: body.source || "web-search",
    })
    .select()
    .single();

  if (insertError) {
    return Response.json({ error: insertError.message }, { status: 500 });
  }

  if (isFirst) {
    await supabase
      .from("products")
      .update({
        image_url: urls.url,
        medium_image_url: urls.medium_url,
        thumb_image_url: urls.thumb_url,
      })
      .eq("id", id)
      .eq("company_id", companyId);
  }

  return Response.json({ image: imageRow }, { status: 201 });
}
