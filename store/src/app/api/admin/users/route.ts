import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/rbac-server";
import { getCurrentTenant } from "@/lib/tenant";

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

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ["admin", "superadmin"]);
  if (auth instanceof Response) return auth;
  const { id: companyId } = await getCurrentTenant();

  const supabase = createServiceClient();

  // Fetch profiles — solo de la company actual.
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, full_name, company, phone, role")
    .eq("company_id", companyId)
    .order("full_name");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Fetch permissions solo para los profiles de esta company.
  const profileIds = (profiles ?? []).map((p) => p.id);
  const permsMap: Record<string, Record<string, unknown>> = {};
  if (profileIds.length > 0) {
    const { data: perms } = await supabase
      .from("user_permissions")
      .select("*")
      .in("user_id", profileIds);
    for (const p of perms ?? []) {
      permsMap[p.user_id as string] = p as Record<string, unknown>;
    }
  }

  // Attempt to enrich with emails from auth.users via service role
  const emailMap: Record<string, string> = {};
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
    permissions: permsMap[p.id] ?? emptyPermissions(p.id),
  }));

  return Response.json({ users });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireRole(request, ["admin", "superadmin"]);
  if (auth instanceof Response) return auth;
  const { id: companyId } = await getCurrentTenant();

  let body: {
    userId?: string;
    role?: string;
    permissions?: Partial<Record<PermissionField, unknown>>;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const { userId, role, permissions } = body;

  if (!userId || typeof userId !== "string") {
    return Response.json({ error: "userId es requerido" }, { status: 400 });
  }

  if (role !== undefined && !VALID_ROLES.includes(role as Role)) {
    return Response.json(
      { error: "Rol inválido. Debe ser: admin, operador o user" },
      { status: 400 }
    );
  }

  // Prevent admin from changing their own role (lockout prevention)
  if (userId === auth.userId && role !== undefined) {
    return Response.json(
      { error: "No podés cambiar tu propio rol" },
      { status: 400 }
    );
  }

  // Prevent admin from removing their own admin permission
  if (
    userId === auth.userId &&
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

  // Tenant cross-check: el target user debe pertenecer a la misma company.
  // user_permissions no tiene company_id directo — se infiere via profiles.
  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("id, company_id")
    .eq("id", userId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!targetProfile) {
    return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  // Update role if provided
  let profile: Record<string, unknown> | null = null;
  if (role !== undefined) {
    const { data, error } = await supabase
      .from("profiles")
      .update({ role })
      .eq("id", userId)
      .eq("company_id", companyId)
      .select("id, full_name, company, phone, role")
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return Response.json({ error: "Usuario no encontrado" }, { status: 404 });
      }
      return Response.json({ error: error.message }, { status: 500 });
    }
    profile = data;
  }

  // Upsert permissions if provided
  let permsData: Record<string, unknown> | null = null;
  if (permissions && typeof permissions === "object") {
    const upsertPayload: Record<string, unknown> = {
      user_id: userId,
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

    // Keep is_admin synced with role when role is being updated
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
    // If only role changed, still sync is_admin flag
    const { data } = await supabase
      .from("user_permissions")
      .upsert(
        {
          user_id: userId,
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
