import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/rbac-server";

type Params = { params: Promise<{ id: string }> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST: crea (o promueve) un usuario como admin de la company.
// Body: { email, password?, full_name?, role? = "admin" | "operador" }
//
// Si el email ya tiene cuenta de Supabase auth, lo asigna a la company
// con el rol indicado. Si no existe, lo crea con la password provista
// (requerida para usuarios nuevos).
export async function POST(request: NextRequest, ctx: Params) {
  const auth = await requireRole(request, ["superadmin"]);
  if (auth instanceof Response) return auth;
  const { id: companyId } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const email = String(body.email ?? "").toLowerCase().trim();
  const role = (body.role as string) || "admin";
  const fullName = body.full_name ? String(body.full_name).trim() : null;
  const password = body.password ? String(body.password) : null;

  if (!EMAIL_RE.test(email)) {
    return Response.json({ error: "Email inválido" }, { status: 400 });
  }
  if (role !== "admin" && role !== "operador") {
    return Response.json(
      { error: "Rol debe ser 'admin' u 'operador'" },
      { status: 400 }
    );
  }

  const service = createServiceClient();

  // Verificar que la company existe
  const { data: company, error: companyErr } = await service
    .from("companies")
    .select("id, slug")
    .eq("id", companyId)
    .single();
  if (companyErr || !company) {
    return Response.json({ error: "Company no encontrada" }, { status: 404 });
  }

  // Buscar si el user ya existe en Supabase auth via admin API
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // listUsers no soporta filter por email; iteramos primera página (suficiente
  // para deploys con <1k usuarios). Para escala mayor: sumar índice o llamar
  // endpoint /auth/v1/admin/users?email=... directo.
  let userId: string | null = null;
  const { data: list } = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  const existing = list?.users?.find(
    (u) => u.email?.toLowerCase() === email
  );
  if (existing) {
    userId = existing.id;
  } else {
    if (!password) {
      return Response.json(
        {
          error:
            "El usuario no existe; pasá una password para crearlo (mín 8 chars).",
        },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return Response.json(
        { error: "Password muy corta (mín 8 chars)" },
        { status: 400 }
      );
    }
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: fullName ? { full_name: fullName } : undefined,
    });
    if (createErr || !created.user) {
      return Response.json(
        { error: createErr?.message ?? "No se pudo crear el usuario" },
        { status: 500 }
      );
    }
    userId = created.user.id;
  }

  // Upsert profile con rol + company
  const profileUpdate: Record<string, unknown> = {
    id: userId,
    company_id: companyId,
    role,
    is_active: true,
  };
  if (fullName) profileUpdate.full_name = fullName;

  const { error: profileErr } = await service
    .from("profiles")
    .upsert(profileUpdate, { onConflict: "id" });
  if (profileErr) {
    return Response.json({ error: profileErr.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    user_id: userId,
    company_id: companyId,
    role,
    created: !existing,
  });
}
