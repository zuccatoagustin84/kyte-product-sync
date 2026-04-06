import { NextRequest } from "next/server";
import { requireRole } from "@/lib/rbac";
import * as XLSX from "xlsx";

const KYTE_API_BASE = "https://kyte-api-gateway.azure-api.net/api/kyte-web";
const KYTE_SUBSCRIPTION_KEY = "62dafa86be9543879a9b32d347c40ab9";
const DEFAULT_UID = "cPQI0AQmnlMpcifNbrfqzGZmTNz1";
const DEFAULT_AID = "cPQI0AQmnlMpci";

// ── Token parsing (mirrors kyte_api.py parse_kyte_token) ─────────────────────

function parseKyteToken(token: string): { uid: string; aid: string } {
  token = token.trim();
  // Fix base64 padding
  const pad = 4 - (token.length % 4);
  const padded = pad !== 4 ? token + "=".repeat(pad) : token;
  const decoded = Buffer.from(padded, "base64").toString("utf-8");
  const parts = decoded.split(".");
  if (parts.length < 3) throw new Error("Invalid kyte_token format");

  const prefix = parts[0];
  if (!prefix.startsWith("kyte_")) {
    throw new Error(`Token prefix should start with 'kyte_', got: ${prefix.slice(0, 20)}`);
  }
  const aid = prefix.slice("kyte_".length);

  // JWT payload is parts[2]
  const payloadB64 = parts[2];
  const payloadPadded = payloadB64 + "=".repeat(4 - (payloadB64.length % 4));
  const payload = JSON.parse(Buffer.from(payloadPadded, "base64").toString("utf-8"));
  const uid: string = payload.uid;

  return { uid, aid };
}

// ── Excel parsing ─────────────────────────────────────────────────────────────

type SourceRow = {
  code: string;
  name: string;
  price: number;
};

function parseExcel(buffer: ArrayBuffer): SourceRow[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // Convert to 2D array (raw, no header)
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
  });

  // Auto-detect header row: find row with 'articulo' + 'precio' columns
  let headerRow = -1;
  let articuloCol = -1;
  let precioCol = -1;
  let codigoCol = -1;

  for (let i = 0; i < Math.min(30, raw.length); i++) {
    const row = raw[i];
    let foundArticulo = -1;
    let foundPrecio = -1;
    let foundCodigo = -1;

    for (let j = 0; j < row.length; j++) {
      const val = row[j];
      if (val == null) continue;
      const lower = String(val).trim().toLowerCase();
      if (lower.includes("articulo") || lower.includes("artículo")) {
        foundArticulo = j;
      }
      if (lower.includes("precio")) {
        foundPrecio = j;
      }
      if (lower.includes("codigo") || lower.includes("código") || lower.includes("digo")) {
        foundCodigo = j;
      }
    }

    if (foundArticulo !== -1 && foundPrecio !== -1) {
      headerRow = i;
      articuloCol = foundArticulo;
      precioCol = foundPrecio;
      codigoCol = foundCodigo;
      break;
    }
  }

  if (headerRow === -1) {
    throw new Error(
      "No se encontró el encabezado. El archivo debe tener columnas 'Articulo' y 'Precio'."
    );
  }

  const results: SourceRow[] = [];

  for (let i = headerRow + 1; i < raw.length; i++) {
    const row = raw[i];
    if (!row || row.every((v) => v == null)) continue;

    const nameVal = row[articuloCol];
    const priceVal = row[precioCol];

    if (nameVal == null && priceVal == null) continue;

    const name = nameVal != null ? String(nameVal).trim() : "";
    const priceRaw = priceVal != null ? parseFloat(String(priceVal).replace(",", ".")) : NaN;
    if (isNaN(priceRaw)) continue;

    // Code: prefer dedicated column, fall back to 'articulo' if it looks numeric
    let code = "";
    if (codigoCol !== -1 && row[codigoCol] != null) {
      code = String(row[codigoCol]).trim().toLowerCase();
    }

    results.push({ code, name, price: priceRaw });
  }

  return results;
}

// ── Kyte API helpers ──────────────────────────────────────────────────────────

type KyteProduct = {
  _id: string;
  name: string;
  code?: string;
  salePrice: number;
  saleCostPrice?: number;
  [key: string]: unknown;
};

async function fetchKyteProducts(uid: string, aid: string): Promise<KyteProduct[]> {
  const allProducts: KyteProduct[] = [];
  const pageSize = 500;
  let skip = 0;
  let total: number | null = null;

  while (true) {
    const params = new URLSearchParams({
      limit: String(pageSize),
      skip: String(skip),
      sort: "PIN_FIRST",
      isWeb: "1",
      stockStatus: "",
      categoryId: "",
      search: "",
    });

    const res = await fetch(
      `${KYTE_API_BASE}/products/${aid}?${params}`,
      {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "Ocp-Apim-Subscription-Key": KYTE_SUBSCRIPTION_KEY,
          "Ocp-Apim-Trace": "true",
          Origin: "https://web.kyteapp.com",
          Referer: "https://web.kyteapp.com/",
          uid,
        },
      }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Kyte API error ${res.status}: ${text.slice(0, 300)}`);
    }

    const data = await res.json();
    if (!data || !data._products) break;

    const batch: KyteProduct[] = data._products;
    if (total === null) total = data.count ?? 0;

    allProducts.push(...batch);

    if (batch.length < pageSize || allProducts.length >= (total ?? 0)) break;
    skip += pageSize;
  }

  return allProducts;
}

function stripImageField(val: string, uid: string): string {
  if (!val) return val;
  let s = val.replace(/^\//, "");
  const uidEncoded = uid + "%2F";
  const uidSlash = uid + "/";
  while (s.startsWith(uidEncoded) || s.startsWith(uidSlash)) {
    if (s.startsWith(uidEncoded)) s = s.slice(uidEncoded.length);
    else if (s.startsWith(uidSlash)) s = s.slice(uidSlash.length);
  }
  const altIdx = s.indexOf("?alt=media");
  if (altIdx !== -1) s = s.slice(0, altIdx);
  return s;
}

function cleanImagesForPut(product: KyteProduct, uid: string): KyteProduct {
  const p = { ...product } as KyteProduct;
  for (const field of ["image", "imageLarge", "imageMedium", "imageThumb"] as const) {
    if (p[field] && typeof p[field] === "string") {
      p[field] = stripImageField(p[field] as string, uid);
    }
  }
  const gallery = p.gallery as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(gallery)) {
    p.gallery = gallery.map((g) => {
      const ng = { ...g };
      for (const field of ["image", "imageLarge", "imageMedium", "imageThumb"]) {
        if (ng[field] && typeof ng[field] === "string") {
          ng[field] = stripImageField(ng[field] as string, uid);
        }
      }
      return ng;
    });
  }
  return p;
}

async function updateKyteProduct(
  product: KyteProduct,
  uid: string
): Promise<void> {
  const cleaned = cleanImagesForPut(product, uid);
  const res = await fetch(`${KYTE_API_BASE}/product`, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "Ocp-Apim-Subscription-Key": KYTE_SUBSCRIPTION_KEY,
      "Ocp-Apim-Trace": "true",
      Origin: "https://web.kyteapp.com",
      Referer: "https://web.kyteapp.com/",
      uid,
    },
    body: JSON.stringify(cleaned),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kyte API PUT error ${res.status}: ${text.slice(0, 300)}`);
  }
}

// ── Preview item type ─────────────────────────────────────────────────────────

export type SyncPreviewItem = {
  code: string;
  name: string;
  kyteName: string;
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

  // Parse multipart form
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ error: "Invalid multipart form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return Response.json({ error: "No se recibió ningún archivo (campo 'file')" }, { status: 400 });
  }

  // Determine credentials: from token or defaults
  let uid = DEFAULT_UID;
  let aid = DEFAULT_AID;

  const tokenHeader = request.headers.get("x-kyte-token");
  const tokenForm = formData.get("kyte_token");
  const tokenEnv = process.env.KYTE_TOKEN;

  const rawToken = tokenHeader ?? (typeof tokenForm === "string" ? tokenForm : null) ?? tokenEnv;

  if (rawToken) {
    try {
      const parsed = parseKyteToken(rawToken);
      uid = parsed.uid;
      aid = parsed.aid;
    } catch (e) {
      return Response.json({ error: `Token inválido: ${(e as Error).message}` }, { status: 400 });
    }
  }

  // Parse Excel
  let sourceRows: SourceRow[];
  try {
    const arrayBuffer = await (file as File).arrayBuffer();
    sourceRows = parseExcel(arrayBuffer);
  } catch (e) {
    return Response.json({ error: `Error leyendo Excel: ${(e as Error).message}` }, { status: 400 });
  }

  if (sourceRows.length === 0) {
    return Response.json({ error: "El archivo no contiene filas válidas" }, { status: 400 });
  }

  // Fetch Kyte products
  let kyteProducts: KyteProduct[];
  try {
    kyteProducts = await fetchKyteProducts(uid, aid);
  } catch (e) {
    return Response.json(
      { error: `Error conectando a Kyte API: ${(e as Error).message}` },
      { status: 502 }
    );
  }

  // Build Kyte index by code (case-insensitive)
  const kyteByCode = new Map<string, KyteProduct>();
  for (const product of kyteProducts) {
    const code = (product.code ?? "").trim().toLowerCase();
    if (code) kyteByCode.set(code, product);
  }

  // Match and build preview
  const preview: SyncPreviewItem[] = [];
  const updatesToApply: Array<{ product: KyteProduct; newPrice: number }> = [];

  for (const src of sourceRows) {
    // Skip rows without a code
    if (!src.code) continue;

    const kyteProduct = kyteByCode.get(src.code);

    if (!kyteProduct) {
      preview.push({
        code: src.code,
        name: src.name,
        kyteName: "",
        currentPrice: 0,
        newPrice: src.price,
        willUpdate: false,
        reason: "No encontrado en Kyte",
      });
      continue;
    }

    // Skip price <= 0
    if (src.price <= 0) {
      preview.push({
        code: src.code,
        name: src.name,
        kyteName: kyteProduct.name,
        currentPrice: kyteProduct.salePrice,
        newPrice: src.price,
        willUpdate: false,
        reason: "Precio cero (ignorado)",
      });
      continue;
    }

    const priceChanged = Math.abs(kyteProduct.salePrice - src.price) > 0.001;

    preview.push({
      code: src.code,
      name: src.name,
      kyteName: kyteProduct.name,
      currentPrice: kyteProduct.salePrice,
      newPrice: src.price,
      willUpdate: priceChanged,
      reason: priceChanged ? undefined : "Sin cambio",
    });

    if (priceChanged) {
      updatesToApply.push({ product: kyteProduct, newPrice: src.price });
    }
  }

  const toUpdate = updatesToApply.length;
  const summary = {
    total: sourceRows.filter((r) => r.code).length,
    toUpdate,
    skipped: preview.filter((r) => !r.willUpdate).length,
    notFound: preview.filter((r) => r.reason === "No encontrado en Kyte").length,
    zeroPrice: preview.filter((r) => r.reason === "Precio cero (ignorado)").length,
  };

  if (!apply) {
    return Response.json({ preview, summary });
  }

  // Apply changes
  const errors: Array<{ code: string; name: string; error: string }> = [];
  let successCount = 0;

  for (const { product, newPrice } of updatesToApply) {
    try {
      product.salePrice = newPrice;
      await updateKyteProduct(product, uid);
      successCount++;
      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 300));
    } catch (e) {
      errors.push({
        code: product.code ?? "",
        name: product.name,
        error: (e as Error).message,
      });
    }
  }

  return Response.json({
    preview,
    summary,
    applied: {
      success: successCount,
      failed: errors.length,
      errors,
    },
  });
}
