import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/auth/google?next=/some-page
 *
 * Initiates server-side Google OAuth by redirecting the browser to
 * Google's consent screen.  The callback is our own /auth/callback route,
 * so we don't need to whitelist anything in the Supabase dashboard.
 */
export async function GET(request: NextRequest) {
  const { origin } = new URL(request.url);
  const next = request.nextUrl.searchParams.get("next") ?? "/";

  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "GOOGLE_CLIENT_ID not configured" },
      { status: 500 },
    );
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/auth/callback`,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    state: next,
    prompt: "select_account",
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
  );
}
