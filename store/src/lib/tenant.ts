// Tenant resolution — server-side helpers.
//
// El tenant (company) se resuelve en proxy.ts a partir del host del request,
// y se propaga a server components / route handlers vía request headers
// (x-tenant-id, x-tenant-slug). Este módulo expone esos headers tipados.
//
// Los headers se setean en proxy.ts; nunca se confía en valores que vengan del
// cliente. Dado que NextResponse.next() reemplaza los headers entrantes con los
// que pasamos, un cliente externo no puede inyectar x-tenant-* manualmente.
//
// Diseño: ver store/docs/MULTI_TENANCY.md

import { headers } from "next/headers";
import { createServiceClient } from "@/lib/supabase";

export type Tenant = {
  id: string;
  slug: string;
};

export const TENANT_HEADER_ID = "x-tenant-id";
export const TENANT_HEADER_SLUG = "x-tenant-slug";

export class TenantNotResolvedError extends Error {
  constructor() {
    super(
      "Tenant not resolved — proxy.ts no encontró una company para este host."
    );
  }
}

// Devuelve el tenant del request actual o lanza si no hay.
// Usar en pages/route handlers que requieren un tenant.
export async function getCurrentTenant(): Promise<Tenant> {
  const h = await headers();
  const id = h.get(TENANT_HEADER_ID);
  const slug = h.get(TENANT_HEADER_SLUG);
  if (!id || !slug) throw new TenantNotResolvedError();
  return { id, slug };
}

// Variante que devuelve null si no hay tenant — para páginas globales
// (landing, /superadmin, /tenant-not-found) donde el tenant es opcional.
export async function tryGetCurrentTenant(): Promise<Tenant | null> {
  const h = await headers();
  const id = h.get(TENANT_HEADER_ID);
  const slug = h.get(TENANT_HEADER_SLUG);
  if (!id || !slug) return null;
  return { id, slug };
}

// Resuelve company por host. Usado por proxy.ts y por flujos server-side
// que necesitan resolver tenants distintos del actual (ej: superadmin).
//
// Estrategia:
//   1. Match exacto por primary_domain
//   2. Match por subdominio: extrae el primer label del host
//   3. Si DEFAULT_TENANT_SLUG está seteado y el host es localhost/lvh.me sin
//      subdominio reconocible, usa ese slug como fallback
//
// Devuelve null si no encuentra company.
export async function resolveTenantFromHost(
  host: string
): Promise<Tenant | null> {
  const supabase = createServiceClient();
  const cleanHost = host.toLowerCase().split(":")[0]; // strip port

  // 1) Match por primary_domain custom
  const { data: byDomain } = await supabase
    .from("companies")
    .select("id, slug")
    .eq("primary_domain", cleanHost)
    .eq("is_active", true)
    .maybeSingle();
  if (byDomain) return byDomain as Tenant;

  // 2) Match por subdominio (primer label)
  const slug = extractSubdomainSlug(cleanHost);
  if (slug) {
    const { data: bySlug } = await supabase
      .from("companies")
      .select("id, slug")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();
    if (bySlug) return bySlug as Tenant;
  }

  // 3) Fallback a default tenant si está configurado.
  // Hardcoded a "mptools" para el demo en *.vercel.app (donde el slug del subdomain
  // es el nombre del proyecto, no un tenant). Override con DEFAULT_TENANT_SLUG.
  const fallbackSlug = process.env.DEFAULT_TENANT_SLUG ?? "mptools";
  if (fallbackSlug) {
    const { data: byFallback } = await supabase
      .from("companies")
      .select("id, slug")
      .eq("slug", fallbackSlug)
      .eq("is_active", true)
      .maybeSingle();
    if (byFallback) return byFallback as Tenant;
  }

  return null;
}

// Extrae el primer label del host como candidato a slug, o null si el host
// no tiene subdominio reconocible. Ignora "www" y la raíz misma.
//
//   "mptools.lvh.me"            → "mptools"
//   "mptools.tutienda.com"      → "mptools"
//   "www.tutienda.com"          → null
//   "tutienda.com"              → null
//   "localhost"                 → null
//   "lvh.me"                    → null
function extractSubdomainSlug(host: string): string | null {
  const parts = host.split(".");
  if (parts.length < 2) return null;

  const first = parts[0];
  if (!first || first === "www") return null;

  // Hosts como "lvh.me" (2 labels) → no hay subdominio; el primer label es la raíz.
  // Solo consideramos subdominio si hay 3+ labels, o si el host raíz coincide
  // con NEXT_PUBLIC_TENANT_DEV_HOST (típicamente "lvh.me" en dev).
  const devRoot = process.env.NEXT_PUBLIC_TENANT_DEV_HOST?.toLowerCase();
  const rootHost = parts.slice(1).join(".");
  if (parts.length < 3 && rootHost !== devRoot) return null;

  return first;
}
