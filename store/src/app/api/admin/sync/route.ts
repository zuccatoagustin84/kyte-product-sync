import { NextRequest } from "next/server";
import { requireRole } from "@/lib/rbac-server";
import { createServiceClient } from "@/lib/supabase";
import * as XLSX from "xlsx";

// ── Excel parsing ─────────────────────────────────────────────────────────────

type SourceRow = {
  code: string;
  name: string;
  price: number;
};

function parseExcel(buffer: ArrayBuffer): SourceRow[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  let headerRow = -1;
  let codigoCol = -1;
  let articuloCol = -1;
  let precioCol = -1;

  for (let i = 0; i < Math.min(30, raw.length); i++) {
    const row = raw[i];
    let fCodigo = -1, fArticulo = -1, fPrecio = -1;

    for (let j = 0; j < row.length; j++) {
      const val = row[j];
      if (val == null) continue;
      const lower = String(val).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (lower.includes("codigo") || lower.includes("digo")) fCodigo = j;
      else if (lower.includes("articulo")) fArticulo = j;
      if (lower.includes("precio")) fPrecio = j;
    }

    if (fArticulo !== -1 && fPrecio !== -1) {
      headerRow = i;
      codigoCol = fCodigo;
      articuloCol = fArticulo;
      precioCol = fPrecio;
      break;
    }
  }

  if (headerRow === -1) {
    throw new Error("No se encontró encabezado. El archivo debe tener columnas 'Articulo' y 'Precio'.");
  }

  const results: SourceRow[] = [];
  for (let i = headerRow + 1; i < raw.length; i++) {
    const row = raw[i];
    if (!row || row.every((v) => v == null)) continue;

    const name = row[articuloCol] != null ? String(row[articuloCol]).trim() : "";
    const priceRaw = row[precioCol] != null ? parseFloat(String(row[precioCol]).replace(",", ".")) : NaN;

    if (!name || isNaN(priceRaw)) continue;

    // Código: columna Codigo si existe, si no usar Articulo
    let code = "";
    if (codigoCol !== -1 && row[codigoCol] != null) {
      code = String(row[codigoCol]).trim().toLowerCase();
    } else {
      code = name.toLowerCase();
    }

    results.push({ code, name, price: priceRaw });
  }

  return results;
}

// ── Preview item type ─────────────────────────────────────────────────────────

export type SyncPreviewItem = {
  code: string;
  name: string;
  storeName: string;
  currentPrice: number;
  newPrice: number;
  willUpdate: boolean;
  reason?: string;
};

// ── Main route handler ────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ["admin"]);
  if (auth instanceof Response) return auth;

  const apply = request.nextUrl.searchParams.get("apply") === "true";

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Datos de formulario inválidos" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return Response.json({ error: "No se recibió ningún archivo (campo 'file')" }, { status: 400 });
  }

  // Parsear Excel
  let sourceRows: SourceRow[];
  try {
    sourceRows = parseExcel(await (file as File).arrayBuffer());
  } catch (e) {
    return Response.json({ error: `Error leyendo Excel: ${(e as Error).message}` }, { status: 400 });
  }

  if (sourceRows.length === 0) {
    return Response.json({ error: "El archivo no contiene filas válidas" }, { status: 400 });
  }

  // Obtener todos los productos de Supabase
  const supabase = createServiceClient();
  const { data: storeProducts, error: fetchError } = await supabase
    .from("products")
    .select("id, name, code, sale_price")
    .not("code", "is", null);

  if (fetchError) {
    return Response.json({ error: `Error obteniendo productos: ${fetchError.message}` }, { status: 500 });
  }

  // Índice por código (case-insensitive)
  const storeByCode = new Map(
    (storeProducts ?? []).map((p) => [p.code!.trim().toLowerCase(), p])
  );

  // Comparar y armar preview
  const preview: SyncPreviewItem[] = [];
  const updatesToApply: Array<{ id: string; newPrice: number; code: string }> = [];

  for (const src of sourceRows) {
    const match = storeByCode.get(src.code);

    if (!match) {
      preview.push({
        code: src.code,
        name: src.name,
        storeName: "",
        currentPrice: 0,
        newPrice: src.price,
        willUpdate: false,
        reason: "No encontrado en la tienda",
      });
      continue;
    }

    if (src.price <= 0) {
      preview.push({
        code: src.code,
        name: src.name,
        storeName: match.name,
        currentPrice: match.sale_price,
        newPrice: src.price,
        willUpdate: false,
        reason: "Precio cero (ignorado)",
      });
      continue;
    }

    const priceChanged = Math.abs(match.sale_price - src.price) > 0.01;

    preview.push({
      code: src.code,
      name: src.name,
      storeName: match.name,
      currentPrice: match.sale_price,
      newPrice: src.price,
      willUpdate: priceChanged,
      reason: priceChanged ? undefined : "Sin cambio",
    });

    if (priceChanged) {
      updatesToApply.push({ id: match.id, newPrice: src.price, code: src.code });
    }
  }

  const summary = {
    total: sourceRows.length,
    toUpdate: updatesToApply.length,
    noChange: preview.filter((r) => r.reason === "Sin cambio").length,
    notFound: preview.filter((r) => r.reason === "No encontrado en la tienda").length,
    zeroPrice: preview.filter((r) => r.reason === "Precio cero (ignorado)").length,
  };

  if (!apply) {
    return Response.json({ preview, summary });
  }

  // Aplicar cambios en Supabase
  const errors: Array<{ code: string; error: string }> = [];
  let successCount = 0;

  for (const { id, newPrice, code } of updatesToApply) {
    const { error } = await supabase
      .from("products")
      .update({ sale_price: newPrice, cost_price: newPrice, updated_at: new Date().toISOString() })
      .eq("id", id);

    if (error) {
      errors.push({ code, error: error.message });
    } else {
      successCount++;
    }
  }

  return Response.json({
    preview,
    summary,
    applied: { success: successCount, failed: errors.length, errors },
  });
}
