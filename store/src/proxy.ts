// Next.js 16 Proxy (formerly middleware).
// Doble responsabilidad: (1) resolver tenant desde el host, (2) auth gate de /admin y /perfil.
// Diseño: ver store/docs/MULTI_TENANCY.md

import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import type { Role } from "@/lib/rbac";
import {
  TENANT_HEADER_ID,
  TENANT_HEADER_SLUG,
  resolveTenantFromHost,
} from "@/lib/tenant";

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const host = request.headers.get("host") ?? "";

  // ---------------------------------------------------------------------------
  // 1) Resolver tenant desde el host. Aplica a TODAS las rutas matcheadas.
  // ---------------------------------------------------------------------------
  const tenant = await resolveTenantFromHost(host);

  if (!tenant) {
    // Host no matchea ninguna company. Mostramos página "tenant not found"
    // salvo que ya estemos ahí (evitar loop) o sea una ruta de superadmin.
    if (path === "/tenant-not-found" || path.startsWith("/superadmin")) {
      return NextResponse.next({ request });
    }
    return NextResponse.rewrite(new URL("/tenant-not-found", request.url));
  }

  // Propagar tenant a server components y route handlers.
  // NextResponse.next({ request: { headers } }) los hace visibles upstream.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(TENANT_HEADER_ID, tenant.id);
  requestHeaders.set(TENANT_HEADER_SLUG, tenant.slug);

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // ---------------------------------------------------------------------------
  // 2) Auth gate (solo si hace falta — /admin, /perfil)
  // ---------------------------------------------------------------------------
  const needsAuthCheck = path.startsWith("/admin") || path.startsWith("/perfil");
  if (!needsAuthCheck) return supabaseResponse;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request: { headers: requestHeaders },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (path.startsWith("/perfil") && !user) {
    return NextResponse.redirect(new URL("/login?next=/perfil", request.url));
  }

  if (path.startsWith("/admin")) {
    if (!user) {
      return NextResponse.redirect(new URL(`/login?next=${path}`, request.url));
    }

    // Service role bypassa RLS — necesario para leer profiles desde proxy.
    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
    const { data: profile } = await service
      .from("profiles")
      .select("role, company_id")
      .eq("id", user.id)
      .single();

    const role = profile?.role as Role | undefined;

    // Tenant cross-check: el user solo puede entrar al admin de su company.
    // Excepción: superadmin puede entrar a cualquier company.
    if (role !== "superadmin" && profile?.company_id !== tenant.id) {
      return NextResponse.redirect(new URL("/", request.url));
    }

    const adminOnly =
      path.startsWith("/admin/usuarios") ||
      path.startsWith("/admin/sync") ||
      path.startsWith("/admin/finanzas") ||
      path.startsWith("/admin/estadisticas");

    if (adminOnly) {
      if (role !== "admin" && role !== "superadmin") {
        return NextResponse.redirect(new URL("/", request.url));
      }
    } else {
      if (role !== "admin" && role !== "operador" && role !== "superadmin") {
        return NextResponse.redirect(new URL("/", request.url));
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  // Matchear todo excepto assets estáticos y archivos internos de Next.
  // El tenant resolve corre en cada request matcheado; la auth gate solo
  // dispara en /admin y /perfil dentro del proxy.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|woff|woff2|ttf|otf)$).*)",
  ],
};
