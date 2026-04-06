/**
 * Kyte API client — TypeScript port of kyte_api.py
 */

const API_BASE = "https://kyte-api-gateway.azure-api.net/api/kyte-web";
const SUBSCRIPTION_KEY = "62dafa86be9543879a9b32d347c40ab9";

export interface KyteConfig {
  uid: string;
  aid: string;
}

export interface KyteProduct {
  id: string;
  name: string;
  code: string;
  salePrice: number;
  saleCostPrice: number;
  salePromotionalPrice: number | null;
  image?: string;
  imageLarge?: string;
  imageMedium?: string;
  imageThumb?: string;
  gallery?: Array<Record<string, string>>;
  category?: { name: string } | null;
  [key: string]: unknown;
}

export interface KyteCategory {
  id: string;
  name: string;
}

export class KyteAPIError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public url: string = ""
  ) {
    super(`Kyte API error ${statusCode} on ${url}: ${message}`);
  }
}

/** Parse a kyte_token from localStorage and return { uid, aid, exp } */
export function parseKyteToken(token: string): KyteConfig & { exp?: Date } {
  token = token.trim();
  const padding = 4 - (token.length % 4);
  const padded = padding !== 4 ? token + "=".repeat(padding) : token;
  const decoded = atob(padded);
  const parts = decoded.split(".");
  if (parts.length < 3) throw new Error("Invalid kyte_token format");

  const prefix = parts[0];
  if (!prefix.startsWith("kyte_"))
    throw new Error(`Token prefix should start with 'kyte_', got: ${prefix.slice(0, 20)}`);
  const aid = prefix.slice("kyte_".length);

  let payloadB64 = parts[2];
  payloadB64 += "=".repeat(4 - (payloadB64.length % 4));
  const payload = JSON.parse(atob(payloadB64));
  const uid: string = payload.uid;
  const exp = payload.exp ? new Date(payload.exp * 1000) : undefined;

  return { uid, aid, exp };
}

function makeHeaders(config: KyteConfig) {
  return {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "Ocp-Apim-Subscription-Key": SUBSCRIPTION_KEY,
    "Ocp-Apim-Trace": "true",
    Origin: "https://web.kyteapp.com",
    Referer: "https://web.kyteapp.com/",
    uid: config.uid,
  };
}

async function apiRequest(
  config: KyteConfig,
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, string | number>
): Promise<unknown> {
  let url = `${API_BASE}${path}`;
  if (params) {
    const qs = new URLSearchParams(
      Object.entries(params).map(([k, v]) => [k, String(v)])
    ).toString();
    url += `?${qs}`;
  }
  const res = await fetch(url, {
    method,
    headers: makeHeaders(config),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail: string;
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      detail = await res.text();
    }
    throw new KyteAPIError(res.status, detail, url);
  }
  return res.json().catch(() => ({ status: "ok" }));
}

/** Fetch all products with pagination */
export async function getProducts(config: KyteConfig, pageSize = 500): Promise<KyteProduct[]> {
  const all: KyteProduct[] = [];
  let skip = 0;
  let total: number | null = null;

  while (true) {
    const data = (await apiRequest(config, "GET", `/products/${config.aid}`, undefined, {
      limit: pageSize,
      skip,
      sort: "PIN_FIRST",
      isWeb: 1,
      stockStatus: "",
      categoryId: "",
      search: "",
    })) as { _products: KyteProduct[]; count: number };

    if (!data._products) break;
    all.push(...data._products);
    if (total === null) total = data.count ?? 0;
    if (data._products.length < pageSize || all.length >= total) break;
    skip += pageSize;
  }
  return all;
}

/** Fetch categories */
export async function getCategories(config: KyteConfig): Promise<KyteCategory[]> {
  const data = (await apiRequest(config, "GET", `/products/categories/${config.aid}`)) as
    | { _productsCategory: KyteCategory[] }
    | KyteCategory[];
  if (Array.isArray(data)) return data;
  return (data as { _productsCategory: KyteCategory[] })._productsCategory ?? [];
}

/** Strip uid/ prefix and ?alt=media suffix from image path before PUT */
function stripImageField(val: string, uid: string): string {
  if (!val) return val;
  let s = val.replace(/^\//, "");
  const uidEncoded = uid + "%2F";
  const uidSlash = uid + "/";
  while (s.startsWith(uidEncoded) || s.startsWith(uidSlash)) {
    if (s.startsWith(uidEncoded)) s = s.slice(uidEncoded.length);
    else s = s.slice(uidSlash.length);
  }
  const altIdx = s.indexOf("?alt=media");
  if (altIdx !== -1) s = s.slice(0, altIdx);
  return s;
}

function cleanImagesForPut(product: KyteProduct, uid: string): KyteProduct {
  const p = structuredClone(product);
  for (const field of ["image", "imageLarge", "imageMedium", "imageThumb"] as const) {
    if (p[field]) p[field] = stripImageField(p[field] as string, uid);
  }
  for (const g of p.gallery ?? []) {
    for (const field of ["image", "imageLarge", "imageMedium", "imageThumb"]) {
      if (g[field]) g[field] = stripImageField(g[field], uid);
    }
  }
  return p;
}

/** Update a single product price */
export async function updateProductPrice(
  config: KyteConfig,
  product: KyteProduct,
  salePrice: number,
  costPrice?: number
): Promise<void> {
  const p = { ...product, salePrice };
  if (costPrice !== undefined) p.saleCostPrice = costPrice;
  const cleaned = cleanImagesForPut(p, config.uid);
  await apiRequest(config, "PUT", "/product", cleaned);
}

/** Build Firebase Storage image URL from raw API field */
export const FIREBASE_BASE =
  "https://firebasestorage.googleapis.com/v0/b/kyte-7c484.appspot.com/o";

export function buildImageUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  raw = raw.trim();
  if (raw.startsWith("http")) return raw;
  const path = raw.replace(/^\//, "");
  return `${FIREBASE_BASE}/${path}`;
}
