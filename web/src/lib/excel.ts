/**
 * Excel parsing for distributor price list
 * Port of load_source() + detect_columns() + run_matching() from app.py
 */
import * as XLSX from "xlsx";
import type { KyteProduct } from "./kyte";

export interface SourceRow {
  name: string;
  code: string;
  price: number;
}

export type MatchStatus = "ACTUALIZAR" | "OK" | "SIN MATCH" | "SIN CODIGO" | "PRECIO 0";

export interface MatchRow {
  estado: MatchStatus;
  nombre: string;
  codigo: string;
  precioKyte: number | null;
  precioNuevo: number;
  diferencia: number | null;
  difPct: string;
  categoria: string;
}

export interface UpdateEntry {
  product: KyteProduct;
  salePrice: number;
  costPrice?: number;
}

export interface MatchResult {
  rows: MatchRow[];
  updates: UpdateEntry[];
}

function normalize(text: unknown): string {
  if (text == null) return "";
  return String(text).trim().toLowerCase().replace(/\s+/g, " ");
}

/** Parse Excel buffer → source rows */
export function parseSourceExcel(buffer: ArrayBuffer): SourceRow[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  // Find header row (look for 'articulo' + 'precio')
  let headerRow = -1;
  for (let i = 0; i < Math.min(30, raw.length); i++) {
    const vals = raw[i].map((v) => String(v ?? "").trim().toLowerCase());
    if (vals.some((v) => v.includes("articulo")) && vals.some((v) => v.includes("precio"))) {
      headerRow = i;
      break;
    }
  }
  if (headerRow === -1) throw new Error("No se encontró header con 'Articulo' y 'Precio'");

  const headers = raw[headerRow].map((h) => String(h ?? "").trim().toLowerCase());
  const codeIdx = headers.findIndex((h) => h.includes("codigo") || h.includes("digo"));
  const nameIdx = headers.findIndex((h) => h.includes("articulo"));
  const priceIdx = headers.findIndex((h) => h.includes("precio"));

  if (nameIdx === -1 || priceIdx === -1)
    throw new Error("Columnas 'Articulo' y 'Precio' no encontradas");

  const rows: SourceRow[] = [];
  for (let i = headerRow + 1; i < raw.length; i++) {
    const row = raw[i];
    const price = parseFloat(String(row[priceIdx] ?? ""));
    if (isNaN(price)) continue;
    rows.push({
      name: String(row[nameIdx] ?? "").trim(),
      code: codeIdx >= 0 ? normalize(row[codeIdx]) : "",
      price,
    });
  }
  return rows;
}

/** Match source rows against Kyte products */
export function runMatching(
  kyteProducts: KyteProduct[],
  sourceRows: SourceRow[],
  updateCost: boolean
): MatchResult {
  const kyteByCode = new Map<string, KyteProduct>();
  for (const p of kyteProducts) {
    const code = normalize(p.code);
    if (code) kyteByCode.set(code, p);
  }

  const rows: MatchRow[] = [];
  const updates: UpdateEntry[] = [];

  for (const src of sourceRows) {
    const { name, code, price: newPrice } = src;

    if (!code) {
      rows.push({ estado: "SIN CODIGO", nombre: name, codigo: "", precioKyte: null,
        precioNuevo: newPrice, diferencia: null, difPct: "", categoria: "" });
      continue;
    }

    const matched = kyteByCode.get(code);
    if (!matched) {
      rows.push({ estado: "SIN MATCH", nombre: name, codigo: code, precioKyte: null,
        precioNuevo: newPrice, diferencia: null, difPct: "", categoria: "" });
      continue;
    }

    const oldPrice = matched.salePrice ?? 0;
    const catName = (matched.category as { name?: string } | null)?.name ?? "";

    if (newPrice <= 0) {
      rows.push({ estado: "PRECIO 0", nombre: matched.name, codigo: code,
        precioKyte: oldPrice, precioNuevo: newPrice, diferencia: null, difPct: "", categoria: catName });
      continue;
    }

    const diff = Math.round((newPrice - oldPrice) * 100) / 100;
    const diffPct = oldPrice ? ((diff / oldPrice) * 100).toFixed(1) : "0";
    const changed = Math.abs(oldPrice - newPrice) > 0.001;

    rows.push({
      estado: changed ? "ACTUALIZAR" : "OK",
      nombre: matched.name,
      codigo: code,
      precioKyte: oldPrice,
      precioNuevo: newPrice,
      diferencia: diff,
      difPct: changed ? `${diff > 0 ? "+" : ""}${diffPct}%` : "",
      categoria: catName,
    });

    if (changed) {
      const entry: UpdateEntry = { product: matched, salePrice: newPrice };
      if (updateCost) entry.costPrice = newPrice;
      updates.push(entry);
    }
  }

  return { rows, updates };
}

/** Format number as Argentine peso: 12500 → "$12.500" */
export function formatARS(value: number): string {
  return "$" + Math.round(value).toLocaleString("es-AR");
}
