import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/rbac-server";
import { hasPermission } from "@/lib/rbac";
import type { PaymentMethod, PaymentStatus } from "@/lib/types";

type CheckoutItem = {
  product_id: string;
  quantity: number;
  unit_price: number;
  discount_amount?: number;
};

type CheckoutPayment = {
  method: PaymentMethod;
  amount: number;
  reference?: string | null;
};

type CheckoutBody = {
  customer_id: string | null;
  customer_name: string;
  items: CheckoutItem[];
  discount_total: number;
  shipping_total: number;
  payments: CheckoutPayment[];
  notes?: string | null;
  channel?: string;
};

const VALID_METHODS: PaymentMethod[] = [
  "efectivo",
  "tarjeta",
  "transferencia",
  "mercadopago",
  "credito_cliente",
  "otro",
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ["admin", "operador"]);
  if (auth instanceof Response) return auth;

  if (!hasPermission(auth.role, "pos")) {
    return Response.json({ error: "Sin permiso para POS" }, { status: 403 });
  }

  let body: CheckoutBody;
  try {
    body = (await request.json()) as CheckoutBody;
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  // Basic validation
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return Response.json({ error: "Carrito vacío" }, { status: 400 });
  }
  if (!Array.isArray(body.payments) || body.payments.length === 0) {
    return Response.json(
      { error: "Debe registrar al menos un pago" },
      { status: 400 }
    );
  }

  const customerName = String(body.customer_name ?? "").trim() || "Cliente genérico";
  const discountTotal = Math.max(0, Number(body.discount_total ?? 0));
  const shippingTotal = Math.max(0, Number(body.shipping_total ?? 0));

  // Validate payments
  for (const p of body.payments) {
    if (!VALID_METHODS.includes(p.method)) {
      return Response.json(
        { error: `Método de pago inválido: ${p.method}` },
        { status: 400 }
      );
    }
    if (!Number.isFinite(p.amount) || p.amount <= 0) {
      return Response.json(
        { error: "Monto de pago inválido" },
        { status: 400 }
      );
    }
  }

  const supabase = createServiceClient();

  // Fetch products to snapshot name/code/cost and validate
  const productIds = body.items.map((i) => i.product_id);
  const { data: products, error: prodErr } = await supabase
    .from("products")
    .select("id, name, code, cost_price, stock, sale_price")
    .in("id", productIds);

  if (prodErr) {
    return Response.json({ error: prodErr.message }, { status: 500 });
  }
  const prodMap = new Map(products?.map((p) => [p.id, p]) ?? []);

  // Build order items with snapshots + compute subtotal
  let subtotal = 0;
  const itemsWithSnapshot = body.items.map((item) => {
    const prod = prodMap.get(item.product_id);
    if (!prod) {
      throw new Error(`Producto no encontrado: ${item.product_id}`);
    }
    const qty = Math.max(1, Math.floor(Number(item.quantity) || 0));
    const unit = Math.max(0, Number(item.unit_price) || 0);
    const disc = Math.max(0, Number(item.discount_amount ?? 0));
    const lineSubtotal = round2(qty * unit - disc);
    subtotal += lineSubtotal;
    return {
      product_id: item.product_id,
      product_name: prod.name,
      product_code: prod.code,
      unit_price: unit,
      quantity: qty,
      subtotal: lineSubtotal,
      discount_amount: disc,
      cost_snapshot: prod.cost_price,
      _stock: prod.stock,
    };
  });
  subtotal = round2(subtotal);

  const total = round2(subtotal - discountTotal + shippingTotal);
  if (total < 0) {
    return Response.json(
      { error: "Total negativo" },
      { status: 400 }
    );
  }

  const paidAmount = round2(body.payments.reduce((s, p) => s + Number(p.amount), 0));

  // Determine customer requirement for credito_cliente
  const hasCreditPayment = body.payments.some((p) => p.method === "credito_cliente");
  if (hasCreditPayment) {
    if (!body.customer_id) {
      return Response.json(
        { error: "Se requiere cliente para pago con crédito" },
        { status: 400 }
      );
    }
    const { data: cust } = await supabase
      .from("customers")
      .select("id, allow_pay_later")
      .eq("id", body.customer_id)
      .single();
    if (!cust || !cust.allow_pay_later) {
      return Response.json(
        { error: "El cliente no tiene habilitado el pago a crédito" },
        { status: 400 }
      );
    }
  }

  // Determine payment status
  let paymentStatus: PaymentStatus;
  if (paidAmount >= total - 0.009) {
    paymentStatus = "paid";
  } else if (paidAmount > 0) {
    paymentStatus = "partial";
  } else {
    paymentStatus = "pending";
  }

  // Customer snapshot fields (for searching/display even if no customer_id)
  let customer_phone: string | null = null;
  let customer_email: string | null = null;
  if (body.customer_id) {
    const { data: cust } = await supabase
      .from("customers")
      .select("phone, email")
      .eq("id", body.customer_id)
      .single();
    if (cust) {
      customer_phone = cust.phone ?? null;
      customer_email = cust.email ?? null;
    }
  }

  // Insert order
  const { data: order, error: ordErr } = await supabase
    .from("orders")
    .insert({
      customer_id: body.customer_id ?? null,
      customer_name: customerName,
      customer_phone,
      customer_email,
      seller_user_id: auth.userId,
      channel: body.channel ?? "pos",
      subtotal,
      discount_total: discountTotal,
      shipping_total: shippingTotal,
      tax_total: 0,
      total,
      status: "confirmed",
      payment_status: paymentStatus,
      notes: body.notes ?? null,
      fulfilled_at: paymentStatus === "paid" ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (ordErr || !order) {
    return Response.json(
      { error: ordErr?.message ?? "Error creando orden" },
      { status: 500 }
    );
  }

  // Insert order_items (strip _stock helper field)
  const orderItemsPayload = itemsWithSnapshot.map((it) => {
    const { _stock: _omit, ...rest } = it;
    void _omit;
    return { order_id: order.id, ...rest };
  });
  const { error: itemsErr } = await supabase
    .from("order_items")
    .insert(orderItemsPayload);
  if (itemsErr) {
    // Rollback order
    await supabase.from("orders").delete().eq("id", order.id);
    return Response.json({ error: itemsErr.message }, { status: 500 });
  }

  // Insert payments
  const paymentsPayload = body.payments.map((p) => ({
    order_id: order.id,
    method: p.method,
    amount: round2(Number(p.amount)),
    reference: p.reference ?? null,
    created_by: auth.userId,
  }));
  const { error: payErr } = await supabase
    .from("order_payments")
    .insert(paymentsPayload);
  if (payErr) {
    await supabase.from("order_items").delete().eq("order_id", order.id);
    await supabase.from("orders").delete().eq("id", order.id);
    return Response.json({ error: payErr.message }, { status: 500 });
  }

  // Insert status history entry
  await supabase.from("order_status_history").insert({
    order_id: order.id,
    status: "confirmed",
    changed_by: auth.userId,
    notes: "Venta POS",
  });

  // Credit to customer ledger if credito_cliente used and payments < total
  if (hasCreditPayment && body.customer_id && paidAmount < total) {
    const creditOwed = round2(total - paidAmount);
    if (creditOwed > 0) {
      const { error: ledErr } = await supabase.rpc("apply_sale_on_credit", {
        p_customer_id: body.customer_id,
        p_order_id: order.id,
        p_amount: creditOwed,
        p_created_by: auth.userId,
      });
      // Fallback: insert manually if RPC failed
      if (ledErr) {
        const { data: cur } = await supabase
          .from("customers")
          .select("balance")
          .eq("id", body.customer_id)
          .single();
        const prevBal = Number(cur?.balance ?? 0);
        const newBal = round2(prevBal - creditOwed);
        await supabase.from("customer_ledger").insert({
          customer_id: body.customer_id,
          entry_type: "sale",
          amount: -creditOwed,
          balance_after: newBal,
          reference_type: "order",
          reference_id: order.id,
          created_by: auth.userId,
        });
      }
    }
  }

  // Decrement stock where not null
  for (const item of itemsWithSnapshot) {
    if (item._stock !== null && item._stock !== undefined) {
      const newStock = Math.max(0, Number(item._stock) - item.quantity);
      await supabase
        .from("products")
        .update({ stock: newStock })
        .eq("id", item.product_id);
    }
  }

  return Response.json({
    order: {
      id: order.id,
      order_number: order.order_number,
      total: order.total,
      payment_status: order.payment_status,
    },
  });
}
