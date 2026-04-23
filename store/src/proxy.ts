import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import type { Role } from "@/lib/rbac";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;

  // Protect admin routes
  if (path.startsWith("/admin")) {
    if (!user) {
      return NextResponse.redirect(new URL(`/login?next=${path}`, request.url));
    }

    // Use service role client to read the user's role from profiles (bypasses RLS)
    const service = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
    const { data: profile } = await service
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = profile?.role as Role | undefined;

    // Admin-only: usuarios, sync, finanzas, estadisticas
    const adminOnly =
      path.startsWith("/admin/usuarios") ||
      path.startsWith("/admin/sync") ||
      path.startsWith("/admin/finanzas") ||
      path.startsWith("/admin/estadisticas");

    if (adminOnly) {
      if (role !== "admin") {
        return NextResponse.redirect(new URL("/", request.url));
      }
    } else {
      if (role !== "admin" && role !== "operador") {
        return NextResponse.redirect(new URL("/", request.url));
      }
    }
  }

  // Protect profile page
  if (path.startsWith("/perfil") && !user) {
    return NextResponse.redirect(new URL("/login?next=/perfil", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/admin/:path*", "/perfil/:path*"],
};
