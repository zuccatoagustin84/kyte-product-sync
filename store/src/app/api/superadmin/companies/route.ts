import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/rbac-server";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/;

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ["superadmin"]);
  if (auth instanceof Response) return auth;

  const service = createServiceClient();
  const { data, error } = await service
    .from("companies")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ companies: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ["superadmin"]);
  if (auth instanceof Response) return auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const slug = String(body.slug ?? "").toLowerCase().trim();
  const name = String(body.name ?? "").trim();
  if (!SLUG_RE.test(slug)) {
    return Response.json(
      {
        error:
          "Slug inválido. Usá minúsculas, números y guiones (2-32 chars, sin espacios).",
      },
      { status: 400 }
    );
  }
  if (!name) {
    return Response.json(
      { error: "Nombre requerido" },
      { status: 400 }
    );
  }

  const insert: Record<string, unknown> = {
    slug,
    name,
    is_active: body.is_active ?? true,
  };
  for (const key of [
    "primary_domain",
    "logo_url",
    "whatsapp_number",
    "contact_email",
    "settings",
  ]) {
    if (key in body && body[key] !== "" && body[key] != null) {
      insert[key] = body[key];
    }
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from("companies")
    .insert(insert)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return Response.json(
        { error: "Ya existe una company con ese slug o dominio" },
        { status: 409 }
      );
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ company: data }, { status: 201 });
}
