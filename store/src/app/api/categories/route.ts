import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { getCurrentTenant } from "@/lib/tenant";

export async function GET() {
  try {
    const { id: companyId } = await getCurrentTenant();
    const supabase = createServiceClient();

    const { data: categories, error } = await supabase
      .from("categories")
      .select("*")
      .eq("company_id", companyId)
      .order("sort_order");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ categories });
  } catch (err) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
