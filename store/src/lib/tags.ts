// Normaliza un payload de tags:
// - acepta string[] o null/undefined
// - trimmea, descarta vacíos, deduplica case-insensitive
// - preserva capitalización del primer match ("Ofertas" gana sobre "ofertas")
// - retorna null si queda vacío (para borrar todos los tags desde el UI)
export function normalizeTags(input: unknown): string[] | null {
  if (input == null) return null;
  if (!Array.isArray(input)) return null;

  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out.length > 0 ? out : null;
}
