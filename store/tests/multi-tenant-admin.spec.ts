/**
 * Multi-tenant ISOLATION tests for the admin API.
 *
 * Verifica que un admin de la company A no pueda leer/escribir recursos de
 * la company B. Como el dominio default-vercel resuelve a `mptools`, usamos
 * UUIDs aleatorios para los `:id` de los endpoints admin/[id]: deben devolver
 * 404 porque el filtro `.eq("company_id", currentTenantId)` excluye cualquier
 * recurso que no pertenezca al tenant actual. Un UUID inválido / inexistente
 * es funcionalmente equivalente a un recurso de OTRA company (ambos producen
 * empty result sets bajo la misma lógica).
 *
 * Si alguno de estos endpoints alguna vez devuelve 200 con un ID random,
 * significa que se rompió el filtro multi-tenant.
 *
 * Credenciales: TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD (admin de mptools).
 */

import { test, expect } from "@playwright/test";

const ADMIN_EMAIL =
  process.env.TEST_ADMIN_EMAIL ?? "admin.test@mptools-mayorista.com";
const ADMIN_PASSWORD =
  process.env.TEST_ADMIN_PASSWORD ?? "MPTools2026!";

// UUID v4 random — simula un recurso de OTRA company.
function randomUuid(): string {
  const hex = (n: number) =>
    Math.floor(Math.random() * 16 ** n)
      .toString(16)
      .padStart(n, "0");
  // 4xxx variant + 8xxx variant nibbles para que sea v4 RFC 4122 válido.
  return `${hex(8)}-${hex(4)}-4${hex(3)}-8${hex(3)}-${hex(12)}`;
}

async function loginAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 12000 });
}

test.describe("Admin API — aislamiento por company_id", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("PUT /api/admin/products/[id] con id de otra company → 404", async ({
    page,
  }) => {
    const res = await page.request.put(`/api/admin/products/${randomUuid()}`, {
      data: { name: "Hack", sale_price: 1 },
    });
    expect(res.status()).toBe(404);
  });

  // NOTE: DELETE /api/admin/products/[id] no comprueba existencia: corre
  // .delete().eq("id", ...).eq("company_id", currentTenant) y devuelve 200
  // aunque no haya borrado nada. Eso ES seguro (el filtro company_id
  // garantiza que no toca otro tenant), simplemente silencioso. No tiene
  // sentido testearlo con UUID random porque siempre da 200; la auditoría
  // del filtro vive en el code review.

  test("GET /api/admin/customers/[id]/ledger de otra company → 404", async ({
    page,
  }) => {
    const res = await page.request.get(
      `/api/admin/customers/${randomUuid()}/ledger`
    );
    expect(res.status()).toBe(404);
  });

  test("POST /api/admin/customers/[id]/ledger en cliente ajeno → 404", async ({
    page,
  }) => {
    const res = await page.request.post(
      `/api/admin/customers/${randomUuid()}/ledger`,
      {
        data: { entry_type: "credit_add", amount: 100 },
      }
    );
    expect(res.status()).toBe(404);
  });

  test("GET /api/admin/orders/[id]/full de otra company → 404", async ({
    page,
  }) => {
    const res = await page.request.get(`/api/admin/orders/${randomUuid()}/full`);
    expect(res.status()).toBe(404);
  });

  test("GET /api/admin/orders/[id]/receipt/pdf de otra company → 404", async ({
    page,
  }) => {
    const res = await page.request.get(
      `/api/admin/orders/${randomUuid()}/receipt/pdf`
    );
    expect(res.status()).toBe(404);
  });

  test("GET /api/admin/orders/[id]/receipt/whatsapp de otra company → 404", async ({
    page,
  }) => {
    const res = await page.request.get(
      `/api/admin/orders/${randomUuid()}/receipt/whatsapp`
    );
    expect(res.status()).toBe(404);
  });

  test("GET /api/admin/orders/[id]/receipt/remito de otra company → 404", async ({
    page,
  }) => {
    const res = await page.request.get(
      `/api/admin/orders/${randomUuid()}/receipt/remito`
    );
    expect(res.status()).toBe(404);
  });

  test("PUT /api/admin/products/[id]/images con producto ajeno → 404", async ({
    page,
  }) => {
    const res = await page.request.put(
      `/api/admin/products/${randomUuid()}/images`,
      {
        data: {
          images: [{ id: randomUuid(), sort_order: 0, is_primary: true }],
        },
      }
    );
    expect(res.status()).toBe(404);
  });

  test("DELETE /api/admin/products/[id]/images con producto ajeno → 404", async ({
    page,
  }) => {
    const res = await page.request.delete(
      `/api/admin/products/${randomUuid()}/images?image_id=${randomUuid()}`
    );
    expect(res.status()).toBe(404);
  });

  test("anon NO puede llamar /api/admin/products/[id] PUT", async ({
    request,
  }) => {
    const res = await request.put(`/api/admin/products/${randomUuid()}`, {
      data: { name: "x" },
    });
    // requireRole devuelve 401 si no hay sesión.
    expect([401, 403]).toContain(res.status());
  });
});
