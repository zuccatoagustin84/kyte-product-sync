import { NextRequest } from "next/server";
import { requireRole } from "@/lib/rbac-server";

export const runtime = "nodejs";
export const maxDuration = 30;

// ── Bing Images scraping ────────────────────────────────────────────────────
//
// Bing es el motor que mejor scrapea sin browser real. Cada resultado vive en un
// `<a class="iusc">` con un atributo `m="<JSON HTML-escaped>"` que contiene la
// URL real (`murl`), la thumbnail (`turl`), título (`t`), y la página origen
// (`purl`).
//
// Usamos varios "patrones" de query (en castellano + inglés) y mergeamos los
// resultados para mejorar la calidad de match — los códigos de catálogo a veces
// no aparecen tal cual en las primeras 20 imágenes de Bing.

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

type BingResult = {
  url: string;
  thumb: string;
  title: string;
  source: string | null;
  width: number | null;
  height: number | null;
};

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'");
}

async function searchBing(query: string, num: number, market: string): Promise<BingResult[]> {
  const url = `https://www.bing.com/images/search?${new URLSearchParams({
    q: query,
    first: "1",
    form: "HDRSC2",
    mkt: market,
    safesearch: "Moderate",
  })}`;

  const res = await fetch(url, { headers: BROWSER_HEADERS, cache: "no-store" });
  if (!res.ok) return [];
  const html = await res.text();

  const out: BingResult[] = [];
  const seen = new Set<string>();

  // Match bloques <a class="iusc" ... m="..."> (atributo m con JSON HTML-escaped).
  const re = /<a\b[^>]*\bclass="iusc"[^>]*\bm="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const decoded = decodeHtmlEntities(m[1]);
      const data = JSON.parse(decoded);
      const imgUrl = (data.murl as string) || "";
      if (!imgUrl || seen.has(imgUrl)) continue;
      seen.add(imgUrl);
      out.push({
        url: imgUrl,
        thumb: (data.turl as string) || imgUrl,
        title: (data.t as string) || "",
        source: (data.purl as string) || null,
        width: typeof data.w === "number" ? data.w : null,
        height: typeof data.h === "number" ? data.h : null,
      });
      if (out.length >= num) break;
    } catch {
      // ignoramos bloques con JSON inválido
    }
  }

  return out;
}

// Combina varias variantes del query para ampliar resultados sin spammear.
async function multiQuerySearch(
  baseQueries: string[],
  num: number
): Promise<BingResult[]> {
  const seen = new Set<string>();
  const merged: BingResult[] = [];

  // Probamos primero mkt=es-AR (ideal para productos locales en castellano), y
  // luego en-US como fallback más amplio.
  for (const q of baseQueries) {
    if (!q.trim()) continue;
    for (const mkt of ["es-AR", "en-US"]) {
      const batch = await searchBing(q, num, mkt);
      for (const r of batch) {
        if (seen.has(r.url)) continue;
        seen.add(r.url);
        merged.push(r);
        if (merged.length >= num) return merged;
      }
    }
  }

  return merged;
}

// ── Handler ─────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ["admin", "operador", "superadmin"]);
  if (auth instanceof Response) return auth;

  let body: { code?: string; name?: string; category?: string; query?: string; limit?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const code = (body.code || "").trim();
  const name = (body.name || "").trim();
  const category = (body.category || "").trim();
  const limit = Math.min(Math.max(body.limit ?? 24, 1), 40);
  const explicit = (body.query || "").trim();

  // Construimos varias queries para mejorar el recall:
  //   1. La query explícita (si la hay) — el usuario manda.
  //   2. Código + nombre — match más estricto.
  //   3. Solo código — útil para SKUs con marca embebida (ej "WPT3133").
  //   4. Nombre + categoría — fallback semántico.
  const queries: string[] = [];
  if (explicit) queries.push(explicit);
  if (code && name) queries.push(`${code} ${name}`.slice(0, 120));
  if (code) queries.push(code);
  if (name && category) queries.push(`${name} ${category}`.slice(0, 120));
  if (name) queries.push(name.slice(0, 120));

  if (queries.length === 0) {
    return Response.json({ error: "No hay query válido" }, { status: 400 });
  }

  try {
    const results = await multiQuerySearch(queries, limit);
    return Response.json({ results, queries });
  } catch (e) {
    return Response.json(
      { error: `Bing search falló: ${(e as Error).message}` },
      { status: 502 }
    );
  }
}
