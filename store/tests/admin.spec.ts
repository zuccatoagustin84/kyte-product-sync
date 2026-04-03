/**
 * Admin E2E tests — requires TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD env vars.
 * Run locally:  TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... npx playwright test admin
 * In CI: set as GitHub secrets.
 *
 * Test admin credentials:
 *   email:    admin.test@mptools-mayorista.com
 *   password: Admin@MPTools2026!
 */

import { test, expect } from "@playwright/test";

const ADMIN_EMAIL =
  process.env.TEST_ADMIN_EMAIL ?? "admin.test@mptools-mayorista.com";
const ADMIN_PASSWORD =
  process.env.TEST_ADMIN_PASSWORD ?? "Admin@MPTools2026!";

const TEST_PRODUCT_NAME = `Producto Test Playwright ${Date.now()}`;

// ─── helpers ───────────────────────────────────────────────────────────────

async function loginAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ADMIN_EMAIL);
  await page.getByLabel("Contraseña").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  // Wait for redirect to homepage
  await expect(page).toHaveURL(/^\/$|\/\?/, { timeout: 12000 });
}

// ─── auth tests ────────────────────────────────────────────────────────────

test.describe("Login admin", () => {
  test("admin puede iniciar sesión", async ({ page }) => {
    await loginAsAdmin(page);
    // Should be on homepage, not login
    await expect(page).not.toHaveURL(/\/login/);
  });

  test("header muestra link Administrar para admin", async ({ page }) => {
    await loginAsAdmin(page);
    // Open user menu
    await page.getByRole("button", { name: /[A-Z]{1,2}/ }).click();
    await expect(page.getByRole("link", { name: /Administrar/i })).toBeVisible({
      timeout: 5000,
    });
  });

  test("/admin accesible para admin logueado", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/, { timeout: 8000 });
    await expect(page.getByText("Dashboard")).toBeVisible({ timeout: 8000 });
  });
});

test.describe("Admin productos — CRUD", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/productos");
    await page.waitForLoadState("networkidle");
  });

  test("página de productos carga tabla", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Productos" })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole("table")).toBeVisible({ timeout: 10000 });
  });

  test("crear producto nuevo", async ({ page }) => {
    // Click "Nuevo producto" button
    await page.getByRole("button", { name: /Nuevo producto/i }).click();

    // Fill the create form
    await page.getByLabel("Nombre").fill(TEST_PRODUCT_NAME);
    await page.getByLabel(/Precio venta/i).fill("9999");
    await page.getByLabel(/Código/i).fill("TEST-PW-001");

    // Submit
    await page.getByRole("button", { name: /Crear|Guardar/i }).last().click();

    // Product should appear in the table
    await expect(page.getByText(TEST_PRODUCT_NAME)).toBeVisible({
      timeout: 10000,
    });
  });

  test("eliminar producto creado por el test", async ({ page }) => {
    // Search for the test product
    await page.getByPlaceholder(/Buscar/i).fill("TEST-PW-001");
    await page.waitForTimeout(800);

    // Open edit for the test product
    const row = page.getByRole("row").filter({ hasText: "TEST-PW-001" }).first();
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.getByRole("button", { name: "Editar" }).click();

    // Click delete
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /Eliminar/i }).click();

    // Product should no longer appear
    await page.waitForTimeout(1000);
    await expect(page.getByText(TEST_PRODUCT_NAME)).not.toBeVisible({
      timeout: 8000,
    });
  });

  test("buscar productos filtra correctamente", async ({ page }) => {
    const search = page.getByPlaceholder(/Buscar/i);
    await search.fill("xxxxxnoexiste12345");
    await page.waitForTimeout(800);
    await expect(
      page.getByText("No se encontraron productos")
    ).toBeVisible({ timeout: 8000 });
  });
});

test.describe("Admin pedidos", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/pedidos");
    await page.waitForLoadState("networkidle");
  });

  test("página de pedidos carga", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Pedidos" })).toBeVisible({
      timeout: 10000,
    });
  });

  test("muestra pedidos existentes o mensaje vacío", async ({ page }) => {
    const hasOrders = await page.getByRole("table").isVisible({ timeout: 5000 }).catch(() => false);
    const isEmpty = await page.getByText(/no hay pedidos/i).isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasOrders || isEmpty).toBe(true);
  });
});

test.describe("Usuario no-admin", () => {
  test("usuario no-admin es redirigido desde /admin", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("cliente.test@mptools-mayorista.com");
    await page.getByLabel("Contraseña").fill("Cliente@MPTools2026!");
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 12000 });

    // Try to access admin
    await page.goto("/admin");
    await expect(page).not.toHaveURL(/\/admin\//, { timeout: 8000 });
    // Should be redirected to /
    await expect(page).toHaveURL(/^\/$|\/\?/, { timeout: 8000 });
  });

  test("usuario no-admin no ve link Administrar", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("cliente.test@mptools-mayorista.com");
    await page.getByLabel("Contraseña").fill("Cliente@MPTools2026!");
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 12000 });

    await page.getByRole("button", { name: /[A-Z]{1,2}/ }).click();
    await expect(
      page.getByRole("link", { name: /Administrar/i })
    ).not.toBeVisible({ timeout: 3000 });
  });
});
