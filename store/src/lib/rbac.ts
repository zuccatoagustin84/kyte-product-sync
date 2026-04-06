// Pure types and helpers — safe to import from Client Components.

export type Role = "admin" | "operador" | "user";

export const ROLE_PERMISSIONS: Record<Role, readonly string[]> = {
  admin: ["products", "orders", "users", "sync", "categories"],
  operador: ["products", "orders", "categories"],
  user: [],
} as const;

export function hasPermission(role: Role, permission: string): boolean {
  return (ROLE_PERMISSIONS[role] as readonly string[]).includes(permission);
}
