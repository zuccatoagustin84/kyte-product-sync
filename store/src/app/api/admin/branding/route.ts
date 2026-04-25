// GET / PATCH branding de la company actual.
// Branding vive en companies.settings.branding (JSONB).

import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/rbac-server";
import { getCurrentTenant } from "@/lib/tenant";
import {
  coerceBranding,
  BRANDING_PRESETS,
  type Branding,
} from "@/lib/branding";

const HEX = /^#[0-9a-fA-F]{6}$/;

function validateBranding(input: unknown): Branding | { error: string } {
  if (!input || typeof input !== "object") {
    return { error: "branding inválido" };
  }
  const b = input as Record<string, unknown>;
  for (const k of ["brand", "brand_dark", "navy", "navy_light"] as const) {
    if (typeof b[k] !== "string" || !HEX.test(b[k] as string)) {
      return { error: `${k} debe ser un color hex (#RRGGBB)` };
    }
  }
  if (b.style !== "rounded" && b.style !== "square" && b.style !== "modern") {
    return { error: "style debe ser rounded, square o modern" };
  }
  return coerceBranding(b);
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ["admin", "superadmin"]);
  if (auth instanceof Response) return auth;
  const { id: companyId } = await getCurrentTenant();

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("companies")
    .select("name, logo_url, settings")
    .eq("id", companyId)
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const settings = (data.settings ?? {}) as Record<string, unknown>;
  return Response.json({
    name: data.name,
    logo_url: data.logo_url,
    branding: coerceBranding(settings.branding),
    presets: BRANDING_PRESETS,
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireRole(request, ["admin", "superadmin"]);
  if (auth instanceof Response) return auth;
  const { id: companyId } = await getCurrentTenant();

  let body: {
    name?: string;
    logo_url?: string | null;
    branding?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data: current } = await supabase
    .from("companies")
    .select("settings")
    .eq("id", companyId)
    .single();
  const settings = ((current?.settings ?? {}) as Record<string, unknown>) || {};

  if (body.branding !== undefined) {
    const validated = validateBranding(body.branding);
    if ("error" in validated) {
      return Response.json({ error: validated.error }, { status: 400 });
    }
    settings.branding = validated;
  }

  const update: Record<string, unknown> = {
    settings,
    updated_at: new Date().toISOString(),
  };
  if (typeof body.name === "string" && body.name.trim()) {
    update.name = body.name.trim();
  }
  if (body.logo_url !== undefined) {
    update.logo_url =
      typeof body.logo_url === "string" && body.logo_url.trim()
        ? body.logo_url.trim()
        : null;
  }

  const { error } = await supabase
    .from("companies")
    .update(update)
    .eq("id", companyId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}
