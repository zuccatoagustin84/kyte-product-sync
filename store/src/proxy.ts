import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
      return NextResponse.redirect(new URL("/login?next=/admin", request.url));
    }
    // Check admin role via service client
    const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map(e => e.trim());
    if (!adminEmails.includes(user.email ?? "")) {
      return NextResponse.redirect(new URL("/", request.url));
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
