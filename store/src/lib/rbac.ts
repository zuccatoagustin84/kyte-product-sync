// Pure types and helpers — safe to import from Client Components.

export type Role = "superadmin" | "admin" | "operador" | "user";

export const ROLE_PERMISSIONS: Record<Role, readonly string[]> = {
  // superadmin (cross-tenant): puede gestionar companies + todo lo de admin.
  // company_id en su profile es NULL. Su scope cruza tenants.
  superadmin: [
    "companies",
    "products",
    "orders",
    "users",
    "sync",
    "categories",
    "customers",
    "pos",
    "transactions",
    "finances",
    "analytics",
    "settings",
  ],
  admin: [
    "products",
    "orders",
    "users",
    "sync",
    "categories",
    "customers",
    "pos",
    "transactions",
    "finances",
    "analytics",
    "settings",
  ],
  operador: [
    "products",
    "orders",
    "categories",
    "customers",
    "pos",
    "transactions",
  ],
  user: [],
} as const;

export function hasPermission(role: Role, permission: string): boolean {
  return (ROLE_PERMISSIONS[role] as readonly string[]).includes(permission);
}
