// POST /api/admin/customers/[id]/payment
//
// Registra un pago del cliente y opcionalmente lo imputa a una o varias
// órdenes pendientes. La imputación crea filas en order_payments y recalcula
// orders.payment_status (paid si está cubierta, partial si parcial).
//
// Body:
//   {
//     amount: number,                  // monto total del pago (>0)
//     method?: string,                 // 'efectivo' | 'tarjeta' | ...
//     notes?: string,
//     reference?: string,
//     allocations?: { order_id: string; amount: number }[]  // imputaciones
//   }
//
// Si no hay allocations, el pago va "a cuenta" (suma al balance del cliente).
// Si hay, la suma de allocations debe ser <= amount; el remanente queda a cuenta.

import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/rbac-server";
import { getCurrentTenant } from "@/lib/tenant";
import { computePaymentStatus } from "@/lib/payment-utils";

type Body = {
  amount: number;
  method?: string;
  notes?: string;
  reference?: string;
  allocations?: { order_id: string; amount: number }[];
};

const VALID_METHODS = [
  "efectivo",
  "tarjeta",
  "transferencia",
  "mercadopago",
  "credito_cliente",
  "otro",
];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ["admin", "operador", "superadmin"]);
  if (auth instanceof Response) return auth;

  const { id: companyId } = await getCurrentTenant();
  const { id: customerId } = await params;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return Response.json({ error: "Monto inválido" }, { status: 400 });
  }
  const method = body.method ?? "efectivo";
  if (!VALID_METHODS.includes(method)) {
    return Response.json({ error: "Método inválido" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Verificar que el customer pertenece a la company
  const { data: customer } = await supabase
    .from("customers")
    .select("id, balance")
    .eq("id", customerId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!customer) {
    return Response.json({ error: "Cliente no encontrado" }, { status: 404 });
  }

  // Validar allocations si hay
  const allocations = (body.allocations ?? []).filter(
    (a) => Number.isFinite(Number(a.amount)) && Number(a.amount) > 0
  );

  let allocatedSum = 0;
  for (const a of allocations) {
    allocatedSum += Number(a.amount);
  }
  // Tolerancia para redondeo de centavos
  if (allocatedSum > amount + 0.01) {
    return Response.json(
      { error: "La suma imputada no puede ser mayor al monto del pago" },
      { status: 400 }
    );
  }

  // Cargar las órdenes a imputar y validar (pertenecen a este cliente y a esta company)
  if (allocations.length > 0) {
    const orderIds = allocations.map((a) => a.order_id);
    const { data: orders } = await supabase
      .from("orders")
      .select("id, total, payment_status, customer_id")
      .in("id", orderIds)
      .eq("company_id", companyId)
      .eq("customer_id", customerId);

    const found = new Set((orders ?? []).map((o) => o.id as string));
    for (const a of allocations) {
      if (!found.has(a.order_id)) {
        return Response.json(
          { error: `Orden ${a.order_id} no pertenece a este cliente` },
          { status: 400 }
        );
      }
    }
  }

  // 1) Insertar pagos por orden (order_payments)
  const updatedOrders: { id: string; payment_status: string }[] = [];
  for (const a of allocations) {
    const { error: insertErr } = await supabase.from("order_payments").insert({
      company_id: companyId,
      order_id: a.order_id,
      method,
      amount: Number(a.amount),
      reference: body.reference ?? null,
      notes: body.notes ?? null,
      created_by: auth.userId,
    });
    if (insertErr) {
      return Response.json(
        { error: `Error guardando pago para orden ${a.order_id}: ${insertErr.message}` },
        { status: 500 }
      );
    }

    // Recalcular payment_status sumando todos los order_payments de esa orden
    const { data: paymentsAgg } = await supabase
      .from("order_payments")
      .select("amount")
      .eq("order_id", a.order_id)
      .eq("company_id", companyId);
    const paid = (paymentsAgg ?? []).reduce(
      (sum, p) => sum + Number(p.amount ?? 0),
      0
    );
    const { data: orderRow } = await supabase
      .from("orders")
      .select("total")
      .eq("id", a.order_id)
      .eq("company_id", companyId)
      .single();
    const total = Number(orderRow?.total ?? 0);
    const newStatus = computePaymentStatus(paid, total);

    await supabase
      .from("orders")
      .update({
        payment_status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", a.order_id)
      .eq("company_id", companyId);

    updatedOrders.push({ id: a.order_id, payment_status: newStatus });
  }

  // 2) Insertar entrada en customer_ledger (suma al balance del cliente).
  //    El monto entero del pago se suma — incluyendo el remanente "a cuenta".
  //    Las ventas a crédito ya habían descontado del balance al crearse, así
  //    que registrar el pago lo equilibra (parcial o totalmente).
  const currentBalance = Number(customer.balance ?? 0);
  const newBalance = currentBalance + amount;

  const noteParts: string[] = [];
  if (allocations.length > 0) {
    noteParts.push(`Imputado a ${allocations.length} orden(es)`);
  }
  if (allocatedSum < amount - 0.01) {
    const onAccount = amount - allocatedSum;
    noteParts.push(`A cuenta: ${onAccount.toFixed(2)}`);
  }
  if (body.notes) noteParts.push(body.notes);

  const { data: ledgerEntry, error: ledgerErr } = await supabase
    .from("customer_ledger")
    .insert({
      company_id: companyId,
      customer_id: customerId,
      entry_type: "payment",
      amount,
      balance_after: newBalance,
      reference_type: allocations.length > 0 ? "order" : "manual",
      reference_id: allocations.length === 1 ? allocations[0].order_id : null,
      payment_method: method,
      notes: noteParts.join(" · ") || null,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (ledgerErr) {
    return Response.json({ error: ledgerErr.message }, { status: 500 });
  }

  return Response.json({
    payment: ledgerEntry,
    new_balance: newBalance,
    updated_orders: updatedOrders,
  });
}
