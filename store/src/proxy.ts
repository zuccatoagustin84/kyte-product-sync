// Next.js 16 Proxy (formerly middleware).
// Triple responsabilidad:
//   (1) gate de /superadmin y /api/superadmin (cross-tenant, sólo role=superadmin)
//   (2) resolver tenant desde el host (todas las demás rutas)
//   (3) auth gate de /admin y /perfil
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

function buildSupabaseResponse(
  request: NextRequest,
  requestHeaders?: Headers
): { response: NextResponse; supabase: ReturnType<typeof createServerClient> } {
  let response = NextResponse.next({
    request: requestHeaders ? { headers: requestHeaders } : undefined,
  });

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
          response = NextResponse.next({
            request: requestHeaders ? { headers: requestHeaders } : undefined,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  return { response, supabase };
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const host = request.headers.get("host") ?? "";

  // ---------------------------------------------------------------------------
  // 1) Gate de superadmin (independiente del tenant — el superadmin opera
  //    cross-tenant, su profile.company_id es NULL y no resuelve por host).
  // ---------------------------------------------------------------------------
  const isSuperadminPath =
    path.startsWith("/superadmin") || path.startsWith("/api/superadmin");

  if (isSuperadminPath) {
    const { response, supabase } = buildSupabaseResponse(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      // API responde 401 (no redirect a /login para no romper fetch).
      if (path.startsWith("/api/")) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      return NextResponse.redirect(new URL(`/login?next=${path}`, request.url));
    }

    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
    const { data: profile } = await service
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    if ((profile?.role as Role | undefined) !== "superadmin") {
      if (path.startsWith("/api/")) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.redirect(new URL("/", request.url));
    }
    return response;
  }

  // ---------------------------------------------------------------------------
  // 2) Resolver tenant desde el host. Aplica a TODAS las rutas no-superadmin.
  // ---------------------------------------------------------------------------
  const tenant = await resolveTenantFromHost(host);

  if (!tenant) {
    // Host no matchea ninguna company. Mostramos página "tenant not found"
    // salvo que ya estemos ahí (evitar loop) o sea login/auth (necesarios
    // para que el superadmin pueda entrar desde un host sin tenant).
    if (
      path === "/tenant-not-found" ||
      path === "/login" ||
      path.startsWith("/auth/")
    ) {
      return NextResponse.next({ request });
    }
    return NextResponse.rewrite(new URL("/tenant-not-found", request.url));
  }

  // Propagar tenant a server components y route handlers.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(TENANT_HEADER_ID, tenant.id);
  requestHeaders.set(TENANT_HEADER_SLUG, tenant.slug);

  // ---------------------------------------------------------------------------
  // 3) Auth gate (solo si hace falta — /admin, /perfil)
  // ---------------------------------------------------------------------------
  const needsAuthCheck =
    path.startsWith("/admin") || path.startsWith("/perfil");
  if (!needsAuthCheck) {
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  const { response: supabaseResponse, supabase } = buildSupabaseResponse(
    request,
    requestHeaders
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
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|woff|woff2|ttf|otf)$).*)",
  ],
};
