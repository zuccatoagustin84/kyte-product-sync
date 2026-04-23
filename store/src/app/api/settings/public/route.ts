import { getAppSettings } from "@/lib/app-settings";

// Público — sólo para que las páginas de registro / checkout puedan saber
// si deben bloquearse antes de mostrar el form.
export async function GET() {
  const s = await getAppSettings();
  return Response.json({
    allow_public_signup: s.allow_public_signup,
    require_login_for_orders: s.require_login_for_orders,
  });
}
