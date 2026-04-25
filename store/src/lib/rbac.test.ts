import { describe, it, expect } from "vitest";
import { hasPermission, ROLE_PERMISSIONS } from "./rbac";

describe("hasPermission — superadmin", () => {
  it("tiene companies (única exclusiva del superadmin)", () => {
    expect(hasPermission("superadmin", "companies")).toBe(true);
  });

  it("tiene todas las que tiene admin", () => {
    for (const p of ROLE_PERMISSIONS.admin) {
      expect(hasPermission("superadmin", p)).toBe(true);
    }
  });
});

describe("hasPermission — admin", () => {
  it("NO tiene companies (sólo superadmin gestiona tenants)", () => {
    expect(hasPermission("admin", "companies")).toBe(false);
  });

  it("tiene products, orders, users, customers, pos, finances, settings", () => {
    for (const p of [
      "products",
      "orders",
      "users",
      "customers",
      "pos",
      "finances",
      "settings",
    ]) {
      expect(hasPermission("admin", p)).toBe(true);
    }
  });
});

describe("hasPermission — operador", () => {
  it("tiene operativa: products, orders, customers, pos, transactions", () => {
    for (const p of [
      "products",
      "orders",
      "customers",
      "pos",
      "transactions",
    ]) {
      expect(hasPermission("operador", p)).toBe(true);
    }
  });

  it("NO tiene users, finances, analytics, settings (gestión)", () => {
    for (const p of ["users", "finances", "analytics", "settings"]) {
      expect(hasPermission("operador", p)).toBe(false);
    }
  });

  it("NO tiene companies (cross-tenant)", () => {
    expect(hasPermission("operador", "companies")).toBe(false);
  });
});

describe("hasPermission — user", () => {
  it("no tiene ningún permiso administrativo", () => {
    for (const p of [
      "companies",
      "products",
      "orders",
      "users",
      "customers",
      "pos",
      "finances",
      "analytics",
      "settings",
      "transactions",
    ]) {
      expect(hasPermission("user", p)).toBe(false);
    }
  });
});

describe("hasPermission — permission desconocido", () => {
  it("permission inexistente devuelve false para todos los roles", () => {
    for (const role of ["superadmin", "admin", "operador", "user"] as const) {
      expect(hasPermission(role, "blasterizer")).toBe(false);
    }
  });
});
