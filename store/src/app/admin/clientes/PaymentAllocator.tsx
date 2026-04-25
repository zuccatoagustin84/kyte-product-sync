"use client";

// Componente para registrar un pago de cliente e imputarlo a órdenes pendientes.
// Lista las órdenes con saldo pendiente, permite distribuir el monto FIFO o
// editarlo por orden, y llama a /api/admin/customers/:id/payment.

import { useEffect, useState, useCallback } from "react";
import { CheckIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney, formatDate } from "@/lib/format";

type PendingOrder = {
  id: string;
  order_number: number | null;
  created_at: string;
  total: number;
  paid: number;
  pending: number;
  payment_status: string;
  status: string;
};

type Props = {
  customerId: string;
  onSuccess: () => void; // refrescar saldo + ledger en el padre
};

export default function PaymentAllocator({ customerId, onSuccess }: Props) {
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("efectivo");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/customers/${customerId}/pending-orders`
      );
      const body = await res.json();
      if (res.ok) setOrders(body.orders ?? []);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const totalPending = orders.reduce((s, o) => s + o.pending, 0);
  const allocatedSum = Object.values(allocations).reduce(
    (s, v) => s + (Number(v) || 0),
    0
  );
  const amountNum = Number(amount) || 0;
  const remaining = amountNum - allocatedSum;

  // Distribución FIFO: agarra del monto disponible y cubre las órdenes más
  // viejas hasta agotar.
  function fillFIFO() {
    if (amountNum <= 0) return;
    let left = amountNum;
    const next: Record<string, string> = {};
    for (const o of orders) {
      if (left <= 0) {
        next[o.id] = "";
        continue;
      }
      const take = Math.min(o.pending, left);
      next[o.id] = take > 0 ? take.toFixed(2) : "";
      left -= take;
    }
    setAllocations(next);
  }

  function clearAllocations() {
    setAllocations({});
  }

  async function submit() {
    setError(null);
    setOk(false);
    if (amountNum <= 0) {
      setError("Monto inválido");
      return;
    }
    if (allocatedSum > amountNum + 0.01) {
      setError("La suma imputada supera el monto del pago");
      return;
    }

    setSaving(true);
    try {
      const allocList = Object.entries(allocations)
        .map(([order_id, v]) => ({
          order_id,
          amount: Number(v) || 0,
        }))
        .filter((a) => a.amount > 0);

      const res = await fetch(`/api/admin/customers/${customerId}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amountNum,
          method,
          reference: reference.trim() || undefined,
          notes: notes.trim() || undefined,
          allocations: allocList,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "No se pudo registrar el pago");
        return;
      }
      setOk(true);
      setAmount("");
      setAllocations({});
      setNotes("");
      setReference("");
      await fetchOrders();
      onSuccess();
      setTimeout(() => setOk(false), 2500);
    } catch {
      setError("Error de red");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border rounded-lg p-3 space-y-3 bg-orange-50/30">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm">Registrar pago e imputar</h4>
        <button
          type="button"
          onClick={fetchOrders}
          className="text-xs text-gray-500 hover:text-gray-800 inline-flex items-center gap-1"
          disabled={loading}
        >
          <RefreshCwIcon size={12} />
          {loading ? "..." : "Refrescar"}
        </button>
      </div>

      {error && (
        <div className="p-2 rounded bg-red-50 border border-red-200 text-red-700 text-xs">
          {error}
        </div>
      )}
      {ok && (
        <div className="p-2 rounded bg-green-50 border border-green-200 text-green-700 text-xs flex items-center gap-1">
          <CheckIcon size={12} /> Pago registrado
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <label className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">
            Monto del pago
          </label>
          <Input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">
            Método
          </label>
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="transferencia">Transferencia</option>
            <option value="mercadopago">MercadoPago</option>
            <option value="otro">Otro</option>
          </select>
        </div>
      </div>

      <Input
        placeholder="Referencia (nº de transferencia, voucher...)"
        value={reference}
        onChange={(e) => setReference(e.target.value)}
      />

      {/* Lista de órdenes pendientes */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">
            Imputar a órdenes ({orders.length} pendientes
            {totalPending > 0 ? ` · ${formatMoney(totalPending)}` : ""})
          </p>
          {orders.length > 0 && amountNum > 0 && (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={fillFIFO}
                className="text-[11px] px-2 py-0.5 rounded bg-orange-100 text-orange-700 hover:bg-orange-200"
              >
                Auto FIFO
              </button>
              <button
                type="button"
                onClick={clearAllocations}
                className="text-[11px] px-2 py-0.5 rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
              >
                Limpiar
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="h-12 bg-gray-100 rounded animate-pulse" />
        ) : orders.length === 0 ? (
          <p className="text-xs text-gray-400 py-2">
            No hay órdenes pendientes. El pago se registrará a cuenta.
          </p>
        ) : (
          <div className="max-h-48 overflow-y-auto space-y-1 border rounded bg-white">
            {orders.map((o) => {
              const v = allocations[o.id] ?? "";
              return (
                <div
                  key={o.id}
                  className="flex items-center gap-2 px-2 py-1.5 border-b border-gray-100 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800">
                      #{o.order_number ?? o.id.slice(0, 6)}{" "}
                      <span className="text-gray-400">
                        · {formatDate(o.created_at)}
                      </span>
                    </p>
                    <p className="text-[11px] text-gray-500">
                      Total {formatMoney(o.total)} · pendiente{" "}
                      <span className="text-red-600 font-semibold">
                        {formatMoney(o.pending)}
                      </span>
                    </p>
                  </div>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max={o.pending}
                    value={v}
                    onChange={(e) =>
                      setAllocations({
                        ...allocations,
                        [o.id]: e.target.value,
                      })
                    }
                    placeholder="0"
                    className="max-w-[110px] text-right"
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {amountNum > 0 && (
        <div className="text-[11px] text-gray-600 flex items-center justify-between border-t pt-2">
          <span>
            Imputado:{" "}
            <strong className="text-gray-900">
              {formatMoney(allocatedSum)}
            </strong>
          </span>
          <span
            className={
              remaining < -0.01
                ? "text-red-600"
                : remaining > 0.01
                ? "text-orange-600"
                : "text-green-700"
            }
          >
            {remaining > 0.01
              ? `A cuenta: ${formatMoney(remaining)}`
              : remaining < -0.01
              ? `Sobrepasado: ${formatMoney(-remaining)}`
              : "Calzado"}
          </span>
        </div>
      )}

      <Input
        placeholder="Notas (opcional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />

      <Button
        onClick={submit}
        disabled={saving || amountNum <= 0 || allocatedSum > amountNum + 0.01}
        className="w-full bg-orange-500 hover:bg-orange-600 text-white border-0"
      >
        {saving ? "Registrando..." : "Registrar pago"}
      </Button>
    </div>
  );
}
