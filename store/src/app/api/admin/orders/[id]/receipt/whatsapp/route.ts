import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/rbac-server";
import { hasPermission } from "@/lib/rbac";
import { getCurrentTenant } from "@/lib/tenant";

const PAYMENT_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  mercadopago: "MercadoPago",
  credito_cliente: "Crédito cliente",
  otro: "Otro",
};

function fmt(n: number): string {
  return (
    "$ " +
    Number(n).toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }) +
    " " +
    d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["admin", "operador", "superadmin"]);
  if (auth instanceof Response) return auth;
  if (!hasPermission(auth.role, "pos")) {
    return Response.json({ error: "Sin permiso" }, { status: 403 });
  }
  const { id: companyId } = await getCurrentTenant();

  const { id } = await params;
  const supabase = createServiceClient();

  const [{ data: order, error }, { data: company }] = await Promise.all([
    supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .single(),
    supabase
      .from("companies")
      .select("name")
      .eq("id", companyId)
      .single(),
  ]);
  if (error || !order) {
    return Response.json({ error: "Pedido no encontrado" }, { status: 404 });
  }

  const { data: items } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", id)
    .eq("company_id", companyId);
  const { data: payments } = await supabase
    .from("order_payments")
    .select("*")
    .eq("order_id", id)
    .eq("company_id", companyId);

  const lines: string[] = [];
  lines.push(`*${company?.name ?? "Tienda"}*`);
  lines.push(`Comprobante N° ${order.order_number ?? "—"}`);
  lines.push(fmtDate(order.created_at));
  lines.push("");
  lines.push(`Cliente: ${order.customer_name ?? "Cliente genérico"}`);
  lines.push("");
  lines.push("*Productos:*");
  for (const it of items ?? []) {
    const code = it.product_code ? ` [${it.product_code}]` : "";
    lines.push(
      `• ${it.product_name}${code}`
    );
    lines.push(
      `   ${it.quantity} × ${fmt(Number(it.unit_price))} = ${fmt(Number(it.subtotal))}`
    );
  }
  lines.push("");
  lines.push(`Subtotal: ${fmt(Number(order.subtotal ?? 0))}`);
  if (Number(order.discount_total) > 0) {
    lines.push(`Descuento: -${fmt(Number(order.discount_total))}`);
  }
  if (Number(order.shipping_total) > 0) {
    lines.push(`Envío: ${fmt(Number(order.shipping_total))}`);
  }
  lines.push(`*TOTAL: ${fmt(Number(order.total))}*`);
  lines.push("");
  lines.push("*Pagos:*");
  for (const p of payments ?? []) {
    const label = PAYMENT_LABELS[p.method] ?? p.method;
    lines.push(`• ${label}: ${fmt(Number(p.amount))}`);
  }
  if (order.notes) {
    lines.push("");
    lines.push(`Notas: ${order.notes}`);
  }
  lines.push("");
  lines.push("¡Gracias por su compra!");

  const text = lines.join("\n");
  const encoded = encodeURIComponent(text);

  // Strip non-digits from phone for wa.me
  const phoneDigits = (order.customer_phone ?? "").replace(/\D/g, "");
  const url = phoneDigits
    ? `https://wa.me/${phoneDigits}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;

  return Response.json({ url, text });
}
