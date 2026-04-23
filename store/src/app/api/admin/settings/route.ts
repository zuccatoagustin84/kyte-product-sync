import { NextRequest } from "next/server";
import { requireRole } from "@/lib/rbac-server";
import {
  getAppSettings,
  setAppSetting,
  setSupabaseSignupDisabled,
  type AppSettings,
} from "@/lib/app-settings";

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ["admin"]);
  if (auth instanceof Response) return auth;
  const settings = await getAppSettings();
  return Response.json({ settings });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireRole(request, ["admin"]);
  if (auth instanceof Response) return auth;

  let body: Partial<AppSettings>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const warnings: string[] = [];

  if ("allow_public_signup" in body) {
    const v = Boolean(body.allow_public_signup);
    await setAppSetting("allow_public_signup", v, auth.userId);
    // Sync Supabase platform flag so it's enforced even if UI is bypassed.
    const res = await setSupabaseSignupDisabled(!v);
    if (!res.ok)
      warnings.push(`No pude sincronizar disable_signup en Supabase: ${res.error}`);
  }

  if ("require_login_for_orders" in body) {
    await setAppSetting(
      "require_login_for_orders",
      Boolean(body.require_login_for_orders),
      auth.userId
    );
  }

  const settings = await getAppSettings();
  return Response.json({ settings, warnings });
}
