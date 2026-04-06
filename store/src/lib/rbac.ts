import { createServiceClient } from "@/lib/supabase";
import { createSupabaseServer } from "@/lib/supabase-server";

// Roles del sistema
export type Role = "admin" | "operador" | "user";

// Permisos por sección
export const ROLE_PERMISSIONS: Record<Role, readonly string[]> = {
  admin: ["products", "orders", "users", "sync", "categories"],
  operador: ["products", "orders", "categories"],
  user: [],
} as const;

// Helper: chequear si un rol tiene permiso
export function hasPermission(role: Role, permission: string): boolean {
  return (ROLE_PERMISSIONS[role] as readonly string[]).includes(permission);
}

// Helper para API routes: retorna el role del usuario autenticado o null
// Usa el service role key de Supabase para leer profiles.role
export async function getUserRole(
  _request?: Request
): Promise<{ userId: string; role: Role } | null> {
  // Use the server-side anon client to get the authenticated user from cookies
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Use the service role client to read the profile role (bypasses RLS)
  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile?.role) return null;

  return { userId: user.id, role: profile.role as Role };
}

// Helper que retorna 401/403 si no tiene el rol requerido,
// o el objeto { userId, role } si tiene permiso.
export async function requireRole(
  request: Request,
  allowedRoles: Role[]
): Promise<{ userId: string; role: Role } | Response> {
  const result = await getUserRole(request);

  if (!result) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!allowedRoles.includes(result.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  return result;
}
