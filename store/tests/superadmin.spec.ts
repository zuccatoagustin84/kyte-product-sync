/**
 * Superadmin (backoffice) E2E tests.
 *
 * Credentials por defecto:
 *   email:    superadmin.test@mptools-mayorista.com
 *   password: SuperMPTools2026!
 *
 * El user fue creado en Supabase con role='superadmin' y company_id=NULL.
 */

import { test, expect } from "@playwright/test";

const SUPER_EMAIL =
  process.env.TEST_SUPERADMIN_EMAIL ?? "superadmin.test@mptools-mayorista.com";
const SUPER_PASSWORD =
  process.env.TEST_SUPERADMIN_PASSWORD ?? "SuperMPTools2026!";

const ADMIN_EMAIL =
  process.env.TEST_ADMIN_EMAIL ?? "admin.test@mptools-mayorista.com";
const ADMIN_PASSWORD =
  process.env.TEST_ADMIN_PASSWORD ?? "MPTools2026!";

async function loginAs(
  page: import("@playwright/test").Page,
  email: string,
  password: string
) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 12000 });
}

test.describe("Superadmin backoffice", () => {
  test("superadmin puede entrar a /superadmin y ver dashboard", async ({
    page,
  }) => {
    await loginAs(page, SUPER_EMAIL, SUPER_PASSWORD);
    await page.goto("/superadmin");
    await expect(page.getByRole("heading", { name: "Backoffice" })).toBeVisible(
      { timeout: 10000 }
    );
    // "Companies" aparece como label de stat card y como heading "Companies recientes"
    await expect(
      page.getByRole("heading", { name: /Companies recientes/i })
    ).toBeVisible({ timeout: 8000 });
  });

  test("admin (no superadmin) es bounceado de /superadmin", async ({ page }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await page.goto("/superadmin");
    // El proxy redirige a /. Aceptamos cualquier URL que NO sea /superadmin.
    await expect(page).not.toHaveURL(/\/superadmin/, { timeout: 8000 });
  });

  test("anon (no logueado) es redirigido a /login al entrar a /superadmin", async ({
    page,
  }) => {
    await page.goto("/superadmin");
    await expect(page).toHaveURL(/\/login/, { timeout: 8000 });
  });

  test("superadmin lista companies vía API", async ({ page }) => {
    await loginAs(page, SUPER_EMAIL, SUPER_PASSWORD);
    const res = await page.request.get("/api/superadmin/companies");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.companies)).toBe(true);
    expect(body.companies.length).toBeGreaterThanOrEqual(2); // mptools + demo
    const slugs = body.companies.map((c: { slug: string }) => c.slug);
    expect(slugs).toContain("mptools");
  });

  test("admin (no superadmin) NO puede consultar /api/superadmin/companies", async ({
    page,
  }) => {
    await loginAs(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    const res = await page.request.get("/api/superadmin/companies");
    expect(res.status()).toBe(403);
  });

  test("anon NO puede consultar /api/superadmin/companies", async ({
    request,
  }) => {
    const res = await request.get("/api/superadmin/companies");
    expect(res.status()).toBe(401);
  });

  test("superadmin lista de companies se muestra en la UI", async ({ page }) => {
    await loginAs(page, SUPER_EMAIL, SUPER_PASSWORD);
    await page.goto("/superadmin/companies");
    await expect(page.getByRole("heading", { name: "Companies" })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText("mptools", { exact: false }).first()).toBeVisible({
      timeout: 8000,
    });
  });

  test("superadmin crea company nueva y la borra (API)", async ({ page }) => {
    await loginAs(page, SUPER_EMAIL, SUPER_PASSWORD);
    const slug = `e2e-${Date.now().toString(36)}`;
    const create = await page.request.post("/api/superadmin/companies", {
      data: { slug, name: `E2E Test ${slug}` },
    });
    expect(create.status()).toBe(201);
    const { company } = await create.json();
    expect(company.slug).toBe(slug);

    // Inactivar (vía PATCH — soft delete)
    const patch = await page.request.patch(
      `/api/superadmin/companies/${company.id}`,
      { data: { is_active: false } }
    );
    expect(patch.status()).toBe(200);
    const patched = await patch.json();
    expect(patched.company.is_active).toBe(false);
  });

  test("superadmin rechaza slug inválido", async ({ page }) => {
    await loginAs(page, SUPER_EMAIL, SUPER_PASSWORD);
    const res = await page.request.post("/api/superadmin/companies", {
      data: { slug: "Tiene Mayúsculas Y Espacios", name: "X" },
    });
    expect(res.status()).toBe(400);
  });

  test("superadmin formulario 'nueva company' carga campos", async ({
    page,
  }) => {
    await loginAs(page, SUPER_EMAIL, SUPER_PASSWORD);
    await page.goto("/superadmin/companies/new");
    await expect(page.getByLabel(/Slug/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByLabel(/^Nombre/i)).toBeVisible();
  });
});
