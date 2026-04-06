// Server-only RBAC helpers — uses next/headers, NOT importable from Client Components.

import { createServiceClient } from "@/lib/supabase";
import { createSupabaseServer } from "@/lib/supabase-server";
import type { Role } from "@/lib/rbac";

// Returns the authenticated user's role, or null.
export async function getUserRole(
  _request?: Request
): Promise<{ userId: string; role: Role } | null> {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const service = createServiceClient();
  const { data: profile } = await service
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile?.role) return null;

  return { userId: user.id, role: profile.role as Role };
}

// Guard for API routes — returns 401/403 or the user info.
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
