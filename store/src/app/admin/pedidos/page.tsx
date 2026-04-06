"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Order } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type OrderItem = {
  id: string;
  product_name: string;
  product_code: string | null;
  unit_price: number;
  quantity: number;
  subtotal: number;
};

type OrderWithItems = Order & {
  order_items?: OrderItem[];
};

type StatusFilter = "all" | "pending" | "confirmed" | "cancelled";

function StatusBadge({ status }: { status: Order["status"] }) {
  const map: Record<Order["status"], { label: string; className: string }> = {
    pending: {
      label: "Pendiente",
      className: "bg-yellow-100 text-yellow-800 border-yellow-200",
    },
    confirmed: {
      label: "Confirmado",
      className: "bg-green-100 text-green-800 border-green-200",
    },
    cancelled: {
      label: "Cancelado",
      className: "bg-red-100 text-red-800 border-red-200",
    },
  };
  const cfg = map[status];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}

export default function PedidosAdmin() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [selected, setSelected] = useState<OrderWithItems | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (filter !== "all") {
      query = query.eq("status", filter);
    }

    const { data } = await query.limit(200);
    setOrders((data as Order[]) ?? []);
    setLoading(false);
  }, [filter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  async function openOrder(order: Order) {
    setSelected(order as OrderWithItems);
    setDetailLoading(true);
    const { data } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", order.id);
    setSelected({ ...order, order_items: (data as OrderItem[]) ?? [] });
    setDetailLoading(false);
  }

  async function updateStatus(orderId: string, status: Order["status"]) {
    setUpdatingStatus(true);
    try {
      await fetch(`/api/admin/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setSelected((prev) => (prev ? { ...prev, status } : null));
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status } : o))
      );
    } finally {
      setUpdatingStatus(false);
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function whatsappLink(phone: string | null, name: string) {
    if (!phone) return null;
    const clean = phone.replace(/\D/g, "");
    const msg = encodeURIComponent(`Hola ${name}, te contactamos por tu pedido en MP Tools.`);
    return `https://wa.me/${clean}?text=${msg}`;
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Pedidos</h1>
        <p className="text-gray-500 mt-1">Gestión de pedidos de clientes</p>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {(["all", "pending", "confirmed", "cancelled"] as StatusFilter[]).map(
          (s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                filter === s
                  ? "bg-[#1a1a2e] text-white border-[#1a1a2e]"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
            >
              {s === "all"
                ? "Todos"
                : s === "pending"
                ? "Pendientes"
                : s === "confirmed"
                ? "Confirmados"
                : "Cancelados"}
            </button>
          )
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl ring-1 ring-foreground/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-600">Fecha</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Cliente</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Empresa</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Teléfono</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Total</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Estado</th>
                <th className="px-4 py-3 text-center font-medium text-gray-600">Ver</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-gray-400">
                    No hay pedidos
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer"
                    onClick={() => openOrder(order)}
                  >
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {formatDate(order.created_at)}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {order.customer_name}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {order.customer_company ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {order.customer_phone ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      {formatPrice(order.total)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={order.status} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          openOrder(order);
                        }}
                      >
                        Ver
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Sheet */}
      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Detalle del pedido</SheetTitle>
          </SheetHeader>

          {selected && (
            <div className="px-4 py-4 space-y-5">
              {/* Customer info */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <h3 className="font-semibold text-gray-900 mb-2">Cliente</h3>
                <p className="text-sm">
                  <span className="text-gray-500">Nombre: </span>
                  <span className="font-medium">{selected.customer_name}</span>
                </p>
                {selected.customer_company && (
                  <p className="text-sm">
                    <span className="text-gray-500">Empresa: </span>
                    {selected.customer_company}
                  </p>
                )}
                {selected.customer_phone && (
                  <p className="text-sm">
                    <span className="text-gray-500">Teléfono: </span>
                    {selected.customer_phone}
                  </p>
                )}
                {selected.customer_email && (
                  <p className="text-sm">
                    <span className="text-gray-500">Email: </span>
                    {selected.customer_email}
                  </p>
                )}
                {selected.notes && (
                  <p className="text-sm">
                    <span className="text-gray-500">Notas: </span>
                    {selected.notes}
                  </p>
                )}
                <p className="text-sm">
                  <span className="text-gray-500">Fecha: </span>
                  {formatDate(selected.created_at)}
                </p>
                <div className="pt-1 flex items-center gap-2">
                  <span className="text-gray-500 text-sm">Estado: </span>
                  <StatusBadge status={selected.status} />
                </div>
              </div>

              {/* WhatsApp link */}
              {selected.customer_phone && (
                <a
                  href={whatsappLink(selected.customer_phone, selected.customer_name) ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-green-700 hover:text-green-800 font-medium"
                >
                  <span>💬</span> Contactar por WhatsApp
                </a>
              )}

              {/* Order items */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-3">Productos</h3>
                {detailLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(selected.order_items ?? []).map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {item.product_name}
                          </p>
                          {item.product_code && (
                            <p className="text-xs text-gray-400 font-mono">
                              {item.product_code}
                            </p>
                          )}
                        </div>
                        <div className="text-right ml-3 shrink-0">
                          <p className="text-sm font-medium text-gray-900">
                            {formatPrice(item.subtotal)}
                          </p>
                          <p className="text-xs text-gray-400">
                            {item.quantity} × {formatPrice(item.unit_price)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Total */}
                <div className="mt-4 pt-3 border-t border-gray-200 flex justify-between items-center">
                  <span className="font-semibold text-gray-900">Total</span>
                  <span className="text-xl font-bold text-gray-900">
                    {formatPrice(selected.total)}
                  </span>
                </div>
              </div>

              {/* Status actions */}
              {selected.status !== "cancelled" && (
                <div className="flex gap-2 pt-2">
                  {selected.status !== "confirmed" && (
                    <Button
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white border-0"
                      disabled={updatingStatus}
                      onClick={() => updateStatus(selected.id, "confirmed")}
                    >
                      Confirmar pedido
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    className="flex-1"
                    disabled={updatingStatus}
                    onClick={() => updateStatus(selected.id, "cancelled")}
                  >
                    Cancelar pedido
                  </Button>
                </div>
              )}
              {selected.status === "cancelled" && (
                <Button
                  className="w-full bg-yellow-500 hover:bg-yellow-600 text-white border-0"
                  disabled={updatingStatus}
                  onClick={() => updateStatus(selected.id, "pending")}
                >
                  Reabrir como pendiente
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
