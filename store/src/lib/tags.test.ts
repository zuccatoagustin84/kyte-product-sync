import { describe, it, expect } from "vitest";
import { normalizeTags } from "./tags";

describe("normalizeTags", () => {
  it("null/undefined → null", () => {
    expect(normalizeTags(null)).toBe(null);
    expect(normalizeTags(undefined)).toBe(null);
  });

  it("no array → null (defensivo contra payloads malformados)", () => {
    expect(normalizeTags("string")).toBe(null);
    expect(normalizeTags(42)).toBe(null);
    expect(normalizeTags({})).toBe(null);
  });

  it("array vacío → null (semántica: 'borrar tags')", () => {
    expect(normalizeTags([])).toBe(null);
  });

  it("array sólo con strings vacíos o whitespace → null", () => {
    expect(normalizeTags(["", "   ", "\t\n"])).toBe(null);
  });

  it("trim de espacios laterales", () => {
    expect(normalizeTags(["  hola  ", "chau\t"])).toEqual(["hola", "chau"]);
  });

  it("descarta no-strings dentro del array", () => {
    expect(normalizeTags(["valido", 42, null, undefined, {}, "otro"])).toEqual([
      "valido",
      "otro",
    ]);
  });

  it("dedup case-insensitive: gana la primera capitalización vista", () => {
    expect(normalizeTags(["Ofertas", "ofertas", "OFERTAS"])).toEqual([
      "Ofertas",
    ]);
  });

  it("preserva orden de inserción", () => {
    expect(normalizeTags(["zeta", "alpha", "beta"])).toEqual([
      "zeta",
      "alpha",
      "beta",
    ]);
  });

  it("mezcla: trim + dedup + descarte combinados", () => {
    expect(
      normalizeTags(["  Promo  ", "promo", "", "OFERTA", "  oferta", null])
    ).toEqual(["Promo", "OFERTA"]);
  });
});
