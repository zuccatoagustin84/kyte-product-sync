import { test, expect } from "@playwright/test";

/**
 * Multi-tenancy isolation tests.
 *
 * Estos tests verifican que el catálogo expuesto en cada tenant esté aislado.
 * Como Vercel rutea por host (no se puede inyectar Host header arbitrario al
 * dominio default), apuntamos al dominio default = mptools fallback.
 *
 * Para validar isolation real con dos subdominios distintos hace falta:
 *   1) Configurar wildcard en Vercel (*.tutienda.com) o
 *   2) Correr esto contra `npm run dev` con baseURL=http://lvh.me:3000 y
 *      el demo tenant en `http://demo.lvh.me:3000`.
 *
 * En CI contra prod-vercel solo verificamos:
 *   - El tenant default (mptools) responde con su catálogo (~1221 productos).
 *   - El catálogo NO contiene productos del tenant "demo" (cuyo código DEMO-XXX).
 */

test.describe("Multi-tenant isolation (default tenant = mptools)", () => {
  test("catálogo público sólo expone productos de mptools, no de demo", async ({
    request,
  }) => {
    const res = await request.get("/api/products?limit=500");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.products)).toBe(true);
    expect(body.products.length).toBeGreaterThan(100); // mptools tiene 1200+

    const codes = body.products
      .map((p: { code: string | null }) => p.code ?? "")
      .filter(Boolean);
    // Demo seed usa códigos DEMO-001/DEMO-002. Estos NO deben aparecer
    // en el catálogo del tenant default.
    const demoLeak = codes.filter((c: string) =>
      c.toUpperCase().startsWith("DEMO-")
    );
    expect(demoLeak).toEqual([]);
  });

  test("categorías sólo trae categorías de mptools", async ({ request }) => {
    const res = await request.get("/api/categories");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.categories)).toBe(true);

    // La categoría "Demo Category" pertenece al tenant demo y NO debería estar acá.
    const demoLeak = body.categories.filter(
      (c: { name: string }) => c.name === "Demo Category"
    );
    expect(demoLeak).toEqual([]);
  });

  test("/tenant-not-found existe (nueva ruta del proxy multi-tenant)", async ({
    request,
  }) => {
    const res = await request.get("/tenant-not-found");
    expect(res.status()).toBe(200);
  });

  test("/api/health responde con company info si está expuesta", async ({
    request,
  }) => {
    const res = await request.get("/api/health");
    if (res.status() === 404) test.skip();
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});
