import { NextRequest, NextResponse } from "next/server";
import { parseKyteToken, getCategories, KyteAPIError } from "@/lib/kyte";

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token) return NextResponse.json({ error: "Token requerido" }, { status: 400 });
    const config = parseKyteToken(token);
    const categories = await getCategories(config);
    return NextResponse.json({ categories });
  } catch (e) {
    if (e instanceof KyteAPIError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
