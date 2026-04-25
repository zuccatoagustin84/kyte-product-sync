// App settings — per-company key-value store.
//
// La tabla app_settings tiene PK compuesta (company_id, key). Cada función de
// este módulo recibe el companyId del tenant actual; el caller lo obtiene
// desde getCurrentTenant() o lo inyecta explícitamente (p.ej. en jobs cron
// que iteran sobre todas las companies).

import { createServiceClient } from "@/lib/supabase";

export type AppSettings = {
  allow_public_signup: boolean;
  require_login_for_orders: boolean;
  require_login_for_catalog: boolean;
};

const DEFAULTS: AppSettings = {
  allow_public_signup: true,
  require_login_for_orders: false,
  require_login_for_catalog: false,
};

export async function getAppSettings(companyId: string): Promise<AppSettings> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("app_settings")
    .select("key, value")
    .eq("company_id", companyId);
  if (error || !data) return DEFAULTS;

  const out: AppSettings = { ...DEFAULTS };
  for (const row of data) {
    if (row.key in out) {
      (out as unknown as Record<string, unknown>)[row.key] = row.value as unknown;
    }
  }
  return out;
}

export async function setAppSetting(
  companyId: string,
  key: keyof AppSettings,
  value: boolean,
  updatedBy: string | null
) {
  const supabase = createServiceClient();
  const { error } = await supabase.from("app_settings").upsert(
    {
      company_id: companyId,
      key,
      value: value as unknown as object,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    },
    { onConflict: "company_id,key" }
  );
  if (error) throw new Error(error.message);
}

// Toggle Supabase-platform signup gate via Management API so the block
// holds even if someone bypasses the UI and calls supabase.auth.signUp directly.
//
// NOTA: este toggle es global al proyecto Supabase, no per-company. Si en el
// futuro queremos signup-gates per-company sin compartir Supabase project,
// hay que mover a un patrón distinto (ej: bloquear en /api/auth/signup).
export async function setSupabaseSignupDisabled(disabled: boolean): Promise<{
  ok: boolean;
  error?: string;
}> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!token || !url) return { ok: false, error: "Missing SUPABASE_ACCESS_TOKEN or URL" };

  const ref = url.replace(/^https?:\/\//, "").split(".")[0];
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "Mozilla/5.0 supabase-cli",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ disable_signup: disabled }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "fetch failed" };
  }
}
