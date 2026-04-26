// Lectura de Excel client-side. Lo hacemos en el browser para evitar pegarle
// al servidor con archivos grandes (la lista mayorista llega a 1000+ filas y
// 25 columnas con metadata extra que no usamos).

import * as XLSX from "xlsx";

export type ExcelRow = Record<string, unknown>;

export type ParsedExcel = {
  headers: string[];
  rows: ExcelRow[];
  // fila donde detectamos los headers (0-indexed). Útil para mostrar info al user.
  headerRowIndex: number;
};

// ── Header detection ─────────────────────────────────────────────────────────
//
// La regla del Streamlit original: en las primeras 30 filas, buscamos una que
// contenga al menos un keyword de "código" (codigo/articulo/code) y uno de
// "precio" (precio/price). La primera fila que matchee es el header.

const CODE_KEYWORDS = ["codigo", "código", "articulo", "artículo", "code", "sku"];
const PRICE_KEYWORDS = ["precio", "price", "valor"];

function normalize(v: unknown): string {
  if (v == null) return "";
  return String(v).toLowerCase().trim();
}

function rowContainsKeyword(row: unknown[], keywords: string[]): boolean {
  return row.some((v) => {
    const s = normalize(v);
    if (!s) return false;
    return keywords.some((k) => s.includes(k));
  });
}

// Busca la fila de header. Devuelve -1 si no encuentra.
export function detectHeaderRow(rawRows: unknown[][]): number {
  const max = Math.min(30, rawRows.length);
  for (let i = 0; i < max; i++) {
    const row = rawRows[i] ?? [];
    if (row.every((v) => v == null || v === "")) continue;
    const hasCode = rowContainsKeyword(row, CODE_KEYWORDS);
    const hasPrice = rowContainsKeyword(row, PRICE_KEYWORDS);
    if (hasCode && hasPrice) return i;
  }
  return -1;
}

// ── Parsing ──────────────────────────────────────────────────────────────────

export async function parseExcelFile(file: File): Promise<ParsedExcel> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    throw new Error("El Excel no tiene hojas");
  }
  const ws = wb.Sheets[sheetName];

  // Primero leemos todo como matriz para detectar el header.
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, blankrows: false });

  let headerRowIndex = detectHeaderRow(raw);
  if (headerRowIndex < 0) {
    // Fallback: usamos la primera fila no vacía.
    headerRowIndex = raw.findIndex((r) => Array.isArray(r) && r.some((v) => v != null && v !== ""));
    if (headerRowIndex < 0) headerRowIndex = 0;
  }

  const headerRow = (raw[headerRowIndex] ?? []) as unknown[];
  const headers: string[] = [];
  const seen = new Set<string>();
  headerRow.forEach((h, idx) => {
    let name = h == null ? "" : String(h).trim();
    if (!name) name = `Columna ${idx + 1}`;
    // Si hay headers duplicados (Excel feo), suffix-eamos.
    let unique = name;
    let n = 2;
    while (seen.has(unique)) {
      unique = `${name} (${n++})`;
    }
    seen.add(unique);
    headers.push(unique);
  });

  // Ahora leemos rows como objetos usando estos headers.
  const dataRows = raw.slice(headerRowIndex + 1);
  const rows: ExcelRow[] = [];
  for (const r of dataRows) {
    if (!Array.isArray(r)) continue;
    if (r.every((v) => v == null || v === "")) continue;
    const obj: ExcelRow = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] ?? null;
    });
    rows.push(obj);
  }

  return { headers, rows, headerRowIndex };
}

// ── Column auto-detection ────────────────────────────────────────────────────
//
// Buscamos la columna que mejor matchea para cada campo. Priorizamos exact-
// match sobre includes (ej "precio_venta" gana sobre "precio_compra").

function findBestColumn(headers: string[], candidates: string[][]): string | null {
  // candidates es una lista de "tiers": tier 0 = mejor match, tier N = peor.
  // Cada tier tiene una lista de keywords. Devolvemos la primer columna del
  // tier más alto que matchee.
  for (const tier of candidates) {
    for (const h of headers) {
      const norm = normalize(h).replace(/[\s_-]/g, "");
      for (const kw of tier) {
        const knorm = kw.replace(/[\s_-]/g, "");
        if (norm === knorm) return h;
      }
    }
    for (const h of headers) {
      const norm = normalize(h);
      for (const kw of tier) {
        if (norm.includes(kw)) return h;
      }
    }
  }
  return null;
}

export type ColumnGuess = {
  code: string | null;
  name: string | null;
  price: string | null;
  costPrice: string | null;
  category: string | null;
  description: string | null;
  stock: string | null;
};

export function guessColumns(headers: string[]): ColumnGuess {
  return {
    code: findBestColumn(headers, [
      ["codigo_catalogo", "codigocatalogo"],
      ["codigo", "código", "code", "sku"],
      ["articulo", "artículo"],
    ]),
    name: findBestColumn(headers, [
      ["descripcion", "descripción"],
      ["nombre", "name", "producto"],
      ["articulo", "artículo"],
    ]),
    price: findBestColumn(headers, [
      ["precio_venta", "precioventa", "precio venta"],
      ["precio", "price"],
      ["valor"],
    ]),
    costPrice: findBestColumn(headers, [
      ["precio_costo", "preciocosto", "costo"],
      ["cost"],
    ]),
    category: findBestColumn(headers, [
      ["rubro", "categoria", "categoría", "category"],
      ["subrubro"],
    ]),
    description: findBestColumn(headers, [
      ["descripcion_larga", "descripcion larga"],
      ["desc_adicional", "descripcion adicional", "descripcionadicional"],
      ["observacion", "observación"],
    ]),
    stock: findBestColumn(headers, [
      ["stock", "existencia", "cantidad", "qty"],
    ]),
  };
}

// ── Helpers para extraer valores ─────────────────────────────────────────────

export function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (v == null) return 0;
  const s = String(v).trim().replace(/[^\d.,-]/g, "");
  if (!s) return 0;
  // Heurística: si tiene coma como decimal (ej "1.234,56") la convertimos.
  // Si tiene punto (ej "1234.56") la dejamos. Excel ya devuelve number en
  // la mayoría de los casos, así que esto es solo para celdas-texto.
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized = s;
  if (lastComma > lastDot) {
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = s.replace(/,/g, "");
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

export function toString(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}
