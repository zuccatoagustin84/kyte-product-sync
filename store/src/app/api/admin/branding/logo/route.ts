// POST /api/admin/branding/logo — sube el logo de la company a Supabase Storage
// y actualiza companies.logo_url. Reutiliza el bucket "product-images" en la
// carpeta `branding/{companyId}/`.

import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/rbac-server";
import { getCurrentTenant } from "@/lib/tenant";

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
const MAX = 2 * 1024 * 1024; // 2MB

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ["admin", "superadmin"]);
  if (auth instanceof Response) return auth;
  const { id: companyId } = await getCurrentTenant();

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Falta el archivo" }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return Response.json(
      { error: "Tipo no permitido. Use JPG, PNG, WebP, GIF o SVG." },
      { status: 400 }
    );
  }
  if (file.size > MAX) {
    return Response.json({ error: "Máximo 2MB" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const filename = `branding/${companyId}/logo-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("product-images")
    .upload(filename, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    return Response.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage
    .from("product-images")
    .getPublicUrl(filename);
  const logoUrl = urlData.publicUrl;

  const { error: updateError } = await supabase
    .from("companies")
    .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
    .eq("id", companyId);
  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 500 });
  }

  return Response.json({ logo_url: logoUrl });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRole(request, ["admin", "superadmin"]);
  if (auth instanceof Response) return auth;
  const { id: companyId } = await getCurrentTenant();

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("companies")
    .update({ logo_url: null, updated_at: new Date().toISOString() })
    .eq("id", companyId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
