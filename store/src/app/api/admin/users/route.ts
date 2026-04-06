import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/rbac-server";

type Role = "admin" | "operador" | "user";
const VALID_ROLES: Role[] = ["admin", "operador", "user"];

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ["admin"]);
  if (auth instanceof Response) return auth;

  const supabase = createServiceClient();

  // Fetch profiles
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, full_name, company, phone, role")
    .order("full_name");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Attempt to enrich with emails from auth.users via service role
  let emailMap: Record<string, string> = {};
  try {
    const { data: authUsers } = await supabase.auth.admin.listUsers({
      perPage: 1000,
    });
    if (authUsers?.users) {
      for (const u of authUsers.users) {
        emailMap[u.id] = u.email ?? "";
      }
    }
  } catch {
    // If auth.admin is not available, we'll fall back to showing truncated IDs
  }

  const users = (profiles ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name ?? null,
    company: p.company ?? null,
    phone: p.phone ?? null,
    role: (p.role as Role) ?? "user",
    email: emailMap[p.id] ?? null,
  }));

  return Response.json({ users });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireRole(request, ["admin"]);
  if (auth instanceof Response) return auth;

  let body: { userId?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const { userId, role } = body;

  if (!userId || typeof userId !== "string") {
    return Response.json({ error: "userId es requerido" }, { status: 400 });
  }

  if (!role || !VALID_ROLES.includes(role as Role)) {
    return Response.json(
      { error: "Rol inválido. Debe ser: admin, operador o user" },
      { status: 400 }
    );
  }

  // Prevent admin from changing their own role (lockout prevention)
  if (userId === auth.userId) {
    return Response.json(
      { error: "No podés cambiar tu propio rol" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId)
    .select("id, full_name, company, phone, role")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ user: data });
}
