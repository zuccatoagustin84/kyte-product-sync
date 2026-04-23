import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/rbac-server";

type Role = "admin" | "operador" | "user";
const VALID_ROLES: Role[] = ["admin", "operador", "user"];

const PERMISSION_FIELDS = [
  "is_admin",
  "allow_personal_device",
  "view_other_users_transactions",
  "give_discounts",
  "register_products",
  "manage_stock",
  "enable_pay_later",
  "manage_expenses",
  "view_analytics",
  "commission_rate",
] as const;

type PermissionField = (typeof PERMISSION_FIELDS)[number];

function emptyPermissions(userId: string) {
  return {
    user_id: userId,
    is_admin: false,
    allow_personal_device: true,
    view_other_users_transactions: false,
    give_discounts: false,
    register_products: false,
    manage_stock: false,
    enable_pay_later: false,
    manage_expenses: false,
    view_analytics: false,
    commission_rate: null as number | null,
    updated_at: new Date().toISOString(),
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["admin"]);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  const supabase = createServiceClient();

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, company, phone, role, is_active")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  const { data: perms } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("user_id", id)
    .maybeSingle();

  // Enrich with email
  let email: string | null = null;
  try {
    const { data: authUser } = await supabase.auth.admin.getUserById(id);
    email = authUser?.user?.email ?? null;
  } catch {
    // ignore
  }

  return Response.json({
    user: {
      id: profile.id,
      full_name: profile.full_name ?? null,
      company: profile.company ?? null,
      phone: profile.phone ?? null,
      role: (profile.role as Role) ?? "user",
      is_active: profile.is_active ?? true,
      email,
      permissions: perms ?? emptyPermissions(id),
    },
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["admin"]);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  let body: {
    role?: string;
    permissions?: Partial<Record<PermissionField, unknown>>;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const { role, permissions } = body;

  if (role !== undefined && !VALID_ROLES.includes(role as Role)) {
    return Response.json(
      { error: "Rol inválido. Debe ser: admin, operador o user" },
      { status: 400 }
    );
  }

  // Self-lockout prevention
  if (id === auth.userId && role !== undefined) {
    return Response.json(
      { error: "No podés cambiar tu propio rol" },
      { status: 400 }
    );
  }
  if (
    id === auth.userId &&
    permissions &&
    "is_admin" in permissions &&
    permissions.is_admin === false
  ) {
    return Response.json(
      { error: "No podés quitarte tu propio permiso de admin" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  let profile: Record<string, unknown> | null = null;
  if (role !== undefined) {
    const { data, error } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", id)
      .select("id, full_name, company, phone, role, is_active")
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
      }
      return Response.json({ error: error.message }, { status: 500 });
    }
    profile = data;
  }

  let permsData: Record<string, unknown> | null = null;
  if (permissions && typeof permissions === "object") {
    const upsertPayload: Record<string, unknown> = {
      user_id: id,
      updated_at: new Date().toISOString(),
    };
    for (const f of PERMISSION_FIELDS) {
      if (f in permissions) {
        if (f === "commission_rate") {
          const v = permissions[f];
          if (v === null || v === "" || v === undefined) {
            upsertPayload[f] = null;
          } else {
            const num = Number(v);
            if (!Number.isFinite(num) || num < 0 || num > 100) {
              return Response.json(
                { error: "commission_rate debe estar entre 0 y 100" },
                { status: 400 }
              );
            }
            upsertPayload[f] = num;
          }
        } else {
          upsertPayload[f] = Boolean(permissions[f]);
        }
      }
    }
    if (role !== undefined && !("is_admin" in permissions)) {
      upsertPayload.is_admin = role === "admin";
    }
    const { data, error } = await supabase
      .from("user_permissions")
      .upsert(upsertPayload, { onConflict: "user_id" })
      .select()
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    permsData = data;
  } else if (role !== undefined) {
    const { data } = await supabase
      .from("user_permissions")
      .upsert(
        {
          user_id: id,
          is_admin: role === "admin",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .select()
      .single();
    permsData = data;
  }

  return Response.json({ user: profile, permissions: permsData });
}

export async function DELETE() {
  return Response.json(
    { error: "Eliminar usuarios no está permitido" },
    { status: 405 }
  );
}
