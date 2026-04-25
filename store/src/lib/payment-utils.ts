// Lógica pura de imputación de pagos. Sin DB ni I/O — testeable end-to-end.
//
// Reglas de negocio:
//   - allocateFIFO reparte un monto entre órdenes pendientes, cubriendo
//     primero las más viejas (orden ya asumido por el caller — no reordena).
//   - El último centavo se redondea hacia abajo (toFixed(2)) para no pasar
//     un peso de más sobre la última orden.
//   - computePaymentStatus aplica una tolerancia de 0.005 para evitar que
//     redondeos a centavos dejen una orden marcada como `partial` por una
//     diferencia inexistente.

export type PendingOrderInput = {
  id: string;
  pending: number;
};

export type Allocation = {
  order_id: string;
  amount: number;
};

// Reparte `amount` entre las órdenes en orden FIFO (el caller debe pasarlas
// ya ordenadas por antigüedad). Devuelve solo las imputaciones > 0.
export function allocateFIFO(
  orders: ReadonlyArray<PendingOrderInput>,
  amount: number
): Allocation[] {
  if (!Number.isFinite(amount) || amount <= 0) return [];

  let left = roundCents(amount);
  const out: Allocation[] = [];

  for (const o of orders) {
    if (left <= 0) break;
    const pending = Number(o.pending);
    if (!Number.isFinite(pending) || pending <= 0) continue;
    const take = roundCents(Math.min(pending, left));
    if (take <= 0) continue;
    out.push({ order_id: o.id, amount: take });
    left = roundCents(left - take);
  }

  return out;
}

// paid: total acumulado pagado para la orden (post-imputación).
// total: monto total de la orden.
// Tolerancia de medio centavo para no penalizar redondeos.
export function computePaymentStatus(
  paid: number,
  total: number
): "paid" | "partial" | "pending" {
  const t = Number(total);
  const p = Number(paid);
  if (!Number.isFinite(t) || t <= 0) return p > 0 ? "paid" : "pending";
  if (p + 0.005 >= t) return "paid";
  if (p > 0) return "partial";
  return "pending";
}

// Suma todas las imputaciones, redondeada a centavos.
export function sumAllocations(allocations: ReadonlyArray<Allocation>): number {
  return roundCents(
    allocations.reduce((s, a) => s + (Number(a.amount) || 0), 0)
  );
}

// La parte del pago que NO se imputó a una orden (queda a cuenta).
export function onAccountRemainder(
  amount: number,
  allocations: ReadonlyArray<Allocation>
): number {
  return Math.max(0, roundCents(amount - sumAllocations(allocations)));
}

function roundCents(n: number): number {
  return Math.round(n * 100) / 100;
}
