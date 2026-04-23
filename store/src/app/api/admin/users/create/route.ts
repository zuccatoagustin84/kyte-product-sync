import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/rbac-server";

type Mode = "password" | "invite";

type Body = {
  mode: Mode;
  email: string;
  password?: string;
  full_name?: string;
  role?: "admin" | "operador" | "user";

  // Vinculación con customer
  customer_id?: string | null;         // si viene, linkea a customer existente
  create_customer?: boolean;           // si true y customer_id null, crea customer nuevo
  customer?: {
    name?: string;
    doc_id?: string;
    phone?: string;
    phone_alt?: string;
    address?: string;
    city?: string;
    state?: string;
    tax_condition?: string;
    allow_pay_later?: boolean;
    credit_limit?: number | null;
    notes?: string;
    tags?: string[];
  };
};

function randomPassword(len = 12): string {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let out = "";
  for (let i = 0; i < len; i++)
    out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ["admin"]);
  if (auth instanceof Response) return auth;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!email || !/.+@.+\..+/.test(email)) {
    return Response.json({ error: "Email inválido" }, { status: 400 });
  }
  if (body.mode !== "password" && body.mode !== "invite") {
    return Response.json({ error: "mode debe ser 'password' o 'invite'" }, { status: 400 });
  }

  const role = body.role ?? "user";
  const supabase = createServiceClient();

  // 1) Crear el auth user
  let userId: string;
  let tempPassword: string | null = null;

  if (body.mode === "password") {
    const password = (body.password ?? randomPassword()).toString();
    if (password.length < 8) {
      return Response.json(
        { error: "La contraseña debe tener al menos 8 caracteres" },
        { status: 400 }
      );
    }
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: body.full_name ?? null,
      },
    });
    if (error || !data?.user) {
      return Response.json(
        { error: error?.message ?? "No se pudo crear el usuario" },
        { status: 400 }
      );
    }
    userId = data.user.id;
    tempPassword = password;
  } else {
    const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { full_name: body.full_name ?? null },
    });
    if (error || !data?.user) {
      return Response.json(
        { error: error?.message ?? "No se pudo enviar la invitación" },
        { status: 400 }
      );
    }
    userId = data.user.id;
  }

  // 2) Asegurar profile (el trigger de Supabase puede haberlo creado ya)
  await supabase
    .from("profiles")
    .upsert(
      {
        id: userId,
        full_name: body.full_name ?? null,
        role,
        is_active: true,
      },
      { onConflict: "id" }
    );

  // 3) Sincronizar is_admin en user_permissions
  await supabase
    .from("user_permissions")
    .upsert(
      {
        user_id: userId,
        is_admin: role === "admin",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  // 4) Linkear / crear customer
  let customerId: string | null = null;

  if (body.customer_id) {
    const { error } = await supabase
      .from("customers")
      .update({ user_id: userId, updated_at: new Date().toISOString() })
      .eq("id", body.customer_id);
    if (error) {
      return Response.json(
        { error: `Usuario creado pero no se pudo linkear customer: ${error.message}` },
        { status: 500 }
      );
    }
    customerId = body.customer_id;
  } else if (body.create_customer) {
    const c = body.customer ?? {};
    const name = (c.name ?? body.full_name ?? email.split("@")[0]).trim();
    const { data, error } = await supabase
      .from("customers")
      .insert({
        name,
        doc_id: c.doc_id ?? null,
        email,
        phone: c.phone ?? null,
        phone_alt: c.phone_alt ?? null,
        address: c.address ?? null,
        city: c.city ?? null,
        state: c.state ?? null,
        notes: c.notes ?? null,
        tax_condition: c.tax_condition ?? "Consumidor Final",
        allow_pay_later: Boolean(c.allow_pay_later),
        credit_limit: c.credit_limit ?? null,
        tags: c.tags ?? null,
        user_id: userId,
      })
      .select("id")
      .single();
    if (error || !data) {
      return Response.json(
        { error: `Usuario creado pero no se pudo crear customer: ${error?.message}` },
        { status: 500 }
      );
    }
    customerId = data.id;
  }

  return Response.json({
    user: { id: userId, email, role },
    customer_id: customerId,
    temp_password: tempPassword, // solo cuando mode=password
    mode: body.mode,
  });
}
