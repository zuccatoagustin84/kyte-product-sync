import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = createServiceClient();
    const { count, error } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("active", true);

    if (error) throw error;

    return NextResponse.json({
      status: "ok",
      products: count,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ status: "error", error: String(e) }, { status: 500 });
  }
}
