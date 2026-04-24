import { NextRequest } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
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

function formatMoneyPlain(n: number): string {
  return (
    "$ " +
    Number(n).toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function formatDatePlain(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }) +
    " " +
    d.toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
    })
  );
}

// Replace chars not supported by WinAnsi (pdf-lib StandardFonts use WinAnsi)
function safeText(s: string): string {
  return String(s ?? "").replace(/[^\x00-\xFF]/g, "?");
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

  const { data: order, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .eq("company_id", companyId)
    .single();
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
    .eq("company_id", companyId)
    .order("paid_at", { ascending: true });

  // Build PDF
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  const margin = 40;
  let y = height - margin;

  const orange = rgb(0.96, 0.55, 0.08);
  const dark = rgb(0.1, 0.1, 0.15);
  const gray = rgb(0.45, 0.45, 0.5);
  const lightGray = rgb(0.88, 0.88, 0.9);

  // Header
  page.drawText(safeText("MP.TOOLS MAYORISTA"), {
    x: margin,
    y,
    size: 18,
    font: bold,
    color: dark,
  });
  y -= 18;
  page.drawText(safeText("Comprobante de venta"), {
    x: margin,
    y,
    size: 10,
    font,
    color: gray,
  });

  // Order number (right side)
  const orderNumText = `N° ${order.order_number ?? "—"}`;
  page.drawText(safeText(orderNumText), {
    x: width - margin - bold.widthOfTextAtSize(orderNumText, 14),
    y: height - margin,
    size: 14,
    font: bold,
    color: orange,
  });
  const dateText = formatDatePlain(order.created_at);
  page.drawText(safeText(dateText), {
    x: width - margin - font.widthOfTextAtSize(dateText, 9),
    y: height - margin - 16,
    size: 9,
    font,
    color: gray,
  });

  y -= 28;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: lightGray,
  });
  y -= 18;

  // Customer
  page.drawText("Cliente:", {
    x: margin,
    y,
    size: 9,
    font: bold,
    color: gray,
  });
  page.drawText(safeText(order.customer_name ?? "Cliente genérico"), {
    x: margin + 50,
    y,
    size: 10,
    font,
    color: dark,
  });
  y -= 14;
  if (order.customer_phone) {
    page.drawText("Teléfono:", { x: margin, y, size: 9, font: bold, color: gray });
    page.drawText(safeText(order.customer_phone), {
      x: margin + 50,
      y,
      size: 10,
      font,
      color: dark,
    });
    y -= 14;
  }
  if (order.notes) {
    page.drawText("Notas:", { x: margin, y, size: 9, font: bold, color: gray });
    page.drawText(safeText(order.notes).slice(0, 90), {
      x: margin + 50,
      y,
      size: 9,
      font,
      color: dark,
    });
    y -= 14;
  }

  y -= 8;

  // Table header
  const colX = {
    name: margin,
    qty: margin + 280,
    unit: margin + 340,
    sub: width - margin - 70,
  };
  page.drawRectangle({
    x: margin - 4,
    y: y - 4,
    width: width - margin * 2 + 8,
    height: 18,
    color: rgb(0.96, 0.97, 0.98),
  });
  page.drawText("Producto", {
    x: colX.name,
    y,
    size: 9,
    font: bold,
    color: gray,
  });
  page.drawText("Cant.", { x: colX.qty, y, size: 9, font: bold, color: gray });
  page.drawText("P. Unit.", { x: colX.unit, y, size: 9, font: bold, color: gray });
  page.drawText("Subtotal", { x: colX.sub, y, size: 9, font: bold, color: gray });
  y -= 16;

  let currentPage = page;
  for (const item of items ?? []) {
    if (y < margin + 120) {
      // Page break: add a new page and keep drawing there
      currentPage = pdf.addPage([width, height]);
      y = height - margin;
    }
    currentPage.drawText(safeText(String(item.product_name).slice(0, 50)), {
      x: colX.name,
      y,
      size: 9,
      font,
      color: dark,
    });
    if (item.product_code) {
      currentPage.drawText(safeText(item.product_code), {
        x: colX.name,
        y: y - 10,
        size: 7,
        font,
        color: gray,
      });
    }
    currentPage.drawText(String(item.quantity), {
      x: colX.qty,
      y,
      size: 9,
      font,
      color: dark,
    });
    currentPage.drawText(safeText(formatMoneyPlain(Number(item.unit_price))), {
      x: colX.unit,
      y,
      size: 9,
      font,
      color: dark,
    });
    currentPage.drawText(safeText(formatMoneyPlain(Number(item.subtotal))), {
      x: colX.sub,
      y,
      size: 9,
      font,
      color: dark,
    });
    y -= 22;
  }

  y -= 4;
  currentPage.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: lightGray,
  });
  y -= 14;

  // Totals
  const drawRow = (label: string, val: string, boldRow = false) => {
    if (y < margin + 60) {
      currentPage = pdf.addPage([width, height]);
      y = height - margin;
    }
    const f = boldRow ? bold : font;
    const size = boldRow ? 12 : 10;
    currentPage.drawText(label, { x: colX.unit, y, size, font: f, color: dark });
    const textW = f.widthOfTextAtSize(val, size);
    currentPage.drawText(safeText(val), {
      x: width - margin - textW,
      y,
      size,
      font: f,
      color: boldRow ? orange : dark,
    });
    y -= boldRow ? 20 : 14;
  };
  drawRow("Subtotal:", formatMoneyPlain(Number(order.subtotal ?? 0)));
  if (Number(order.discount_total) > 0) {
    drawRow("Descuento:", "- " + formatMoneyPlain(Number(order.discount_total)));
  }
  if (Number(order.shipping_total) > 0) {
    drawRow("Envío:", formatMoneyPlain(Number(order.shipping_total)));
  }
  y -= 4;
  drawRow("TOTAL:", formatMoneyPlain(Number(order.total)), true);

  y -= 6;
  // Payments
  currentPage.drawText("Pagos:", {
    x: margin,
    y,
    size: 10,
    font: bold,
    color: gray,
  });
  y -= 14;
  for (const p of payments ?? []) {
    if (y < margin + 20) {
      currentPage = pdf.addPage([width, height]);
      y = height - margin;
    }
    const label = PAYMENT_LABELS[p.method] ?? p.method;
    currentPage.drawText(
      safeText(`• ${label}${p.reference ? ` (${p.reference})` : ""}`),
      {
        x: margin,
        y,
        size: 9,
        font,
        color: dark,
      }
    );
    const amtText = formatMoneyPlain(Number(p.amount));
    currentPage.drawText(safeText(amtText), {
      x: width - margin - font.widthOfTextAtSize(amtText, 9),
      y,
      size: 9,
      font,
      color: dark,
    });
    y -= 12;
  }

  // Footer
  currentPage.drawText(safeText("¡Gracias por su compra!"), {
    x: margin,
    y: margin,
    size: 9,
    font,
    color: gray,
  });

  const bytes = await pdf.save();
  const body = new Uint8Array(bytes);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="comprobante-${order.order_number ?? order.id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
