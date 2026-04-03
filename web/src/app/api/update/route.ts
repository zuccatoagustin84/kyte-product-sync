import { NextRequest, NextResponse } from "next/server";
import { parseKyteToken, updateProductPrice, KyteAPIError } from "@/lib/kyte";

// Single product update — client calls this per-product to track progress
export async function POST(req: NextRequest) {
  try {
    const { token, product, salePrice, costPrice } = await req.json();
    if (!token || !product || salePrice == null)
      return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });

    const config = parseKyteToken(token);
    await updateProductPrice(config, product, salePrice, costPrice);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof KyteAPIError)
      return NextResponse.json({ error: e.message }, { status: e.statusCode });
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
