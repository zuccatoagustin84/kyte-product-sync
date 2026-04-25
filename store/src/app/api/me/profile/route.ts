// PATCH /api/me/profile — el usuario actualiza su propio profile + customer linkeado.
//
// El customer linkeado se busca por user_id (NO se permite cambiar el link
// desde acá: eso lo hace el admin). Si no hay customer, sólo se actualiza
// el profile.

import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { createSupabaseServer } from "@/lib/supabase-server";
import { getCurrentTenant } from "@/lib/tenant";

const PROFILE_FIELDS = ["full_name", "company", "phone"] as const;

const CUSTOMER_FIELDS = [
  "name",
  "doc_id",
  "phone",
  "phone_alt",
  "address",
  "address_complement",
  "city",
  "state",
  "tax_condition",
] as const;

type Body = {
  profile?: Partial<Record<(typeof PROFILE_FIELDS)[number], string | null>>;
  customer?: Partial<Record<(typeof CUSTOMER_FIELDS)[number], string | null>>;
};

export async function PATCH(request: NextRequest) {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id: companyId } = await getCurrentTenant();

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const service = createServiceClient();

  // Profile
  if (body.profile) {
    const update: Record<string, string | null> = {};
    for (const f of PROFILE_FIELDS) {
      if (f in body.profile) {
        const v = body.profile[f];
        update[f] = typeof v === "string" ? v.trim() || null : null;
      }
    }
    if (Object.keys(update).length > 0) {
      const { error } = await service
        .from("profiles")
        .update(update)
        .eq("id", user.id)
        .eq("company_id", companyId);
      if (error) return Response.json({ error: error.message }, { status: 500 });
    }
  }

  // Customer linkeado
  if (body.customer) {
    const { data: linked } = await service
      .from("customers")
      .select("id")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .eq("active", true)
      .maybeSingle();

    if (linked?.id) {
      const update: Record<string, string | null> = {};
      for (const f of CUSTOMER_FIELDS) {
        if (f in body.customer) {
          const v = body.customer[f];
          update[f] = typeof v === "string" ? v.trim() || null : null;
        }
      }
      if (Object.keys(update).length > 0) {
        const { error } = await service
          .from("customers")
          .update({ ...update, updated_at: new Date().toISOString() })
          .eq("id", linked.id)
          .eq("company_id", companyId);
        if (error) return Response.json({ error: error.message }, { status: 500 });
      }
    }
  }

  return Response.json({ ok: true });
}
