import { test, expect, request } from "@playwright/test";

test.describe("Catálogo", () => {
  test("homepage carga con header y productos", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("MP TOOLS")).toBeVisible();
    // Wait for products to load (supabase fetch)
    await expect(page.locator(".grid > div").first()).toBeVisible({ timeout: 10000 });
  });

  test("categorías se cargan", async ({ page }) => {
    await page.goto("/");
    // Wait for a known category name to appear (first match = mobile chips)
    await expect(page.getByText("THUNDER").first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Todos").first()).toBeVisible();
  });

  test("búsqueda filtra productos", async ({ page }) => {
    await page.goto("/");
    await page.locator("input[placeholder*='Buscar']").waitFor({ timeout: 8000 });
    await page.locator("input[placeholder*='Buscar']").fill("destornillador");
    await page.waitForTimeout(600); // debounce
    await expect(page.locator(".grid > div").first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText("No se encontraron")).not.toBeVisible();
  });

  test("búsqueda sin resultados muestra mensaje", async ({ page }) => {
    await page.goto("/");
    await page.locator("input[placeholder*='Buscar']").waitFor({ timeout: 8000 });
    await page.locator("input[placeholder*='Buscar']").fill("xxxxxnoexistexxxxx");
    await page.waitForTimeout(600);
    await expect(page.getByText("No se encontraron")).toBeVisible({ timeout: 8000 });
  });
});

test.describe("Carrito", () => {
  test("agregar producto abre el carrito automáticamente", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Agregar" }).first().waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "Agregar" }).first().click();
    // addItem now sets isOpen=true so CartSheet should open
    await expect(page.getByRole("heading", { name: "Mi Pedido" })).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole("button", { name: "Confirmar Pedido" })).toBeVisible();
  });

  test("formulario de pedido se muestra al confirmar", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Agregar" }).first().waitFor({ timeout: 10000 });
    await page.getByRole("button", { name: "Agregar" }).first().click();
    await expect(page.getByRole("heading", { name: "Mi Pedido" })).toBeVisible({ timeout: 8000 });
    await page.getByRole("button", { name: "Confirmar Pedido" }).click();
    await expect(page.getByText("Nombre y apellido")).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Auth", () => {
  test("página de login carga con Google y formulario", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Iniciar sesión" })).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole("button", { name: /Continuar con Google/i })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Contraseña")).toBeVisible();
    await expect(page.getByRole("link", { name: /Olvidaste tu/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Registrarse", exact: true })).toBeVisible();
  });

  test("página de registro carga con Google y campos", async ({ page }) => {
    await page.goto("/registro");
    await expect(page.getByRole("heading", { name: "Crear cuenta" })).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole("button", { name: /Continuar con Google/i })).toBeVisible();
    await expect(page.getByLabel(/Nombre completo/)).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Contraseña")).toBeVisible();
    await expect(page.getByRole("link", { name: /Iniciar sesión/i })).toBeVisible();
  });

  test("recuperar contraseña carga correctamente", async ({ page }) => {
    await page.goto("/recuperar");
    await expect(page.getByRole("heading", { name: "Recuperar contraseña" })).toBeVisible({ timeout: 8000 });
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByRole("button", { name: "Enviar link" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Volver al inicio/i })).toBeVisible();
  });

  test("verificar page carga con mensaje de email", async ({ page }) => {
    await page.goto("/verificar?email=test@example.com");
    await expect(page.getByRole("heading", { name: "Revisá tu email" })).toBeVisible({ timeout: 8000 });
    await expect(page.getByText("test@example.com")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reenviar email" })).toBeVisible();
  });

  test("login con credenciales incorrectas muestra error", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("inexistente@test.com");
    await page.getByLabel("Contraseña").fill("wrongpassword");
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(page.getByText(/Email o contraseña incorrectos/i)).toBeVisible({ timeout: 8000 });
  });

  test("/admin redirige a login si no está autenticado", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/, { timeout: 8000 });
  });
});

test.describe("API", () => {
  test("GET /api/categories devuelve categorías", async ({ request }) => {
    const res = await request.get("/api/categories");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.categories).toBeDefined();
    expect(body.categories.length).toBeGreaterThan(0);
  });

  test("GET /api/products devuelve productos", async ({ request }) => {
    const res = await request.get("/api/products?limit=5");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.products).toBeDefined();
    expect(body.products.length).toBeGreaterThan(0);
    const p = body.products[0];
    expect(p.id).toBeDefined();
    expect(p.name).toBeDefined();
    expect(p.sale_price).toBeDefined();
  });

  test("GET /api/products?search= filtra correctamente", async ({ request }) => {
    const res = await request.get("/api/products?search=destornillador&limit=10");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.products.length).toBeGreaterThan(0);
    const names = body.products.map((p: { name: string }) => p.name.toLowerCase());
    expect(names.some((n: string) => n.includes("destornill"))).toBeTruthy();
  });

  test("GET /api/health devuelve status ok", async ({ request }) => {
    const res = await request.get("/api/health");
    // May not be deployed yet — skip if 404
    if (res.status() === 404) return;
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.products).toBeGreaterThan(0);
  });

  test("POST /api/orders crea un pedido", async ({ request }) => {
    const res = await request.post("/api/orders", {
      data: {
        customer_name: "Playwright Test",
        customer_phone: "1199999999",
        customer_email: "test@playwright.com",
        customer_company: "Test SA",
        notes: "Test automatico",
        items: [{
          product_id: "1750341440323-cPQI0",
          product_name: "Adaptador de Mandril",
          product_code: "WKCR0102",
          unit_price: 2157.39,
          quantity: 1,
          subtotal: 2157.39,
        }],
        total: 2157.39,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.orderId).toBeDefined();
  });
});
