// GET /api/admin/orders/[id]/receipt/remito
// Genera un remito PDF (sin precios) — pensado para acompañar la mercadería
// y firmar como conformidad. Lee el nombre de la company para el header.

import { NextRequest } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/rbac-server";
import { hasPermission } from "@/lib/rbac";
import { getCurrentTenant } from "@/lib/tenant";

function formatDatePlain(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function safeText(s: string): string {
  return String(s ?? "").replace(/[^\x00-\xFF]/g, "?");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["admin", "operador", "superadmin"]);
  if (auth instanceof Response) return auth;
  if (!hasPermission(auth.role, "orders") && !hasPermission(auth.role, "pos")) {
    return Response.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { id: companyId } = await getCurrentTenant();
  const { id } = await params;
  const supabase = createServiceClient();

  const [{ data: order }, { data: company }] = await Promise.all([
    supabase
      .from("orders")
      .select("*")
      .eq("id", id)
      .eq("company_id", companyId)
      .single(),
    supabase
      .from("companies")
      .select("name, contact_email, whatsapp_number")
      .eq("id", companyId)
      .single(),
  ]);

  if (!order) {
    return Response.json({ error: "Pedido no encontrado" }, { status: 404 });
  }

  const { data: items } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", id)
    .eq("company_id", companyId);

  let customer: {
    address: string | null;
    city: string | null;
    state: string | null;
    doc_id: string | null;
  } | null = null;
  if (order.customer_id) {
    const { data: c } = await supabase
      .from("customers")
      .select("address, city, state, doc_id")
      .eq("id", order.customer_id)
      .eq("company_id", companyId)
      .maybeSingle();
    customer = c ?? null;
  }

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  const margin = 40;
  let y = height - margin;

  const dark = rgb(0.1, 0.1, 0.15);
  const gray = rgb(0.45, 0.45, 0.5);
  const lightGray = rgb(0.85, 0.85, 0.88);

  // Header — nombre de la company
  page.drawText(safeText(company?.name ?? "Tienda"), {
    x: margin,
    y,
    size: 16,
    font: bold,
    color: dark,
  });
  y -= 18;
  page.drawText("REMITO (no válido como factura)", {
    x: margin,
    y,
    size: 10,
    font: bold,
    color: gray,
  });

  // N° y fecha (derecha)
  const numText = `N° ${order.order_number ?? "—"}`;
  page.drawText(safeText(numText), {
    x: width - margin - bold.widthOfTextAtSize(numText, 14),
    y: height - margin,
    size: 14,
    font: bold,
    color: dark,
  });
  const dateText = `Fecha: ${formatDatePlain(order.created_at)}`;
  page.drawText(safeText(dateText), {
    x: width - margin - font.widthOfTextAtSize(dateText, 9),
    y: height - margin - 16,
    size: 9,
    font,
    color: gray,
  });

  y -= 24;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: lightGray,
  });
  y -= 18;

  // Datos del cliente
  page.drawText("DESTINATARIO", { x: margin, y, size: 9, font: bold, color: gray });
  y -= 14;
  page.drawText(safeText(order.customer_name ?? "Cliente"), {
    x: margin,
    y,
    size: 11,
    font: bold,
    color: dark,
  });
  y -= 14;
  if (customer?.doc_id) {
    page.drawText(safeText(`CUIT/DNI: ${customer.doc_id}`), {
      x: margin,
      y,
      size: 9,
      font,
      color: dark,
    });
    y -= 12;
  }
  if (customer?.address) {
    const dirParts = [customer.address, customer.city, customer.state]
      .filter(Boolean)
      .join(", ");
    page.drawText(safeText(`Dirección: ${dirParts}`), {
      x: margin,
      y,
      size: 9,
      font,
      color: dark,
    });
    y -= 12;
  }
  if (order.customer_phone) {
    page.drawText(safeText(`Teléfono: ${order.customer_phone}`), {
      x: margin,
      y,
      size: 9,
      font,
      color: dark,
    });
    y -= 12;
  }

  y -= 12;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: lightGray,
  });
  y -= 18;

  // Tabla de items — sin precios
  const colX = {
    code: margin,
    name: margin + 90,
    qty: width - margin - 60,
  };
  page.drawRectangle({
    x: margin - 4,
    y: y - 4,
    width: width - margin * 2 + 8,
    height: 18,
    color: rgb(0.96, 0.97, 0.98),
  });
  page.drawText("Código", { x: colX.code, y, size: 9, font: bold, color: gray });
  page.drawText("Descripción", { x: colX.name, y, size: 9, font: bold, color: gray });
  page.drawText("Cantidad", { x: colX.qty, y, size: 9, font: bold, color: gray });
  y -= 18;

  let currentPage = page;
  let totalQty = 0;
  for (const item of items ?? []) {
    if (y < margin + 140) {
      currentPage = pdf.addPage([width, height]);
      y = height - margin;
    }
    const qty = Number(item.quantity ?? 0);
    totalQty += qty;
    currentPage.drawText(safeText(item.product_code ?? "—"), {
      x: colX.code,
      y,
      size: 9,
      font,
      color: dark,
    });
    currentPage.drawText(
      safeText(String(item.product_name).slice(0, 60)),
      { x: colX.name, y, size: 9, font, color: dark }
    );
    const qStr = String(qty);
    currentPage.drawText(qStr, {
      x: colX.qty + 30 - font.widthOfTextAtSize(qStr, 10),
      y,
      size: 10,
      font: bold,
      color: dark,
    });
    y -= 16;
  }

  y -= 10;
  currentPage.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: lightGray,
  });
  y -= 14;
  const totalLine = `Total de unidades: ${totalQty}`;
  currentPage.drawText(safeText(totalLine), {
    x: width - margin - bold.widthOfTextAtSize(totalLine, 11),
    y,
    size: 11,
    font: bold,
    color: dark,
  });

  // Notas
  if (order.notes) {
    y -= 22;
    currentPage.drawText("Observaciones:", {
      x: margin,
      y,
      size: 9,
      font: bold,
      color: gray,
    });
    y -= 12;
    currentPage.drawText(safeText(String(order.notes).slice(0, 250)), {
      x: margin,
      y,
      size: 9,
      font,
      color: dark,
    });
  }

  // Firma — abajo de la página
  const sigY = margin + 60;
  currentPage.drawLine({
    start: { x: margin, y: sigY },
    end: { x: margin + 200, y: sigY },
    thickness: 0.7,
    color: dark,
  });
  currentPage.drawText("Firma del receptor", {
    x: margin,
    y: sigY - 12,
    size: 8,
    font,
    color: gray,
  });
  currentPage.drawLine({
    start: { x: width - margin - 200, y: sigY },
    end: { x: width - margin, y: sigY },
    thickness: 0.7,
    color: dark,
  });
  currentPage.drawText("Aclaración / DNI", {
    x: width - margin - 200,
    y: sigY - 12,
    size: 8,
    font,
    color: gray,
  });

  // Footer
  const footerParts: string[] = [];
  if (company?.contact_email) footerParts.push(company.contact_email);
  if (company?.whatsapp_number) footerParts.push(`WhatsApp: ${company.whatsapp_number}`);
  if (footerParts.length > 0) {
    currentPage.drawText(safeText(footerParts.join(" · ")), {
      x: margin,
      y: margin,
      size: 8,
      font,
      color: gray,
    });
  }

  const bytes = await pdf.save();
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="remito-${order.order_number ?? order.id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
