"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/components/auth/AuthProvider";
import Link from "next/link";

interface OrderItem {
  id: string;
  product_name: string;
  product_code: string | null;
  unit_price: number;
  quantity: number;
  subtotal: number;
}

interface OrderDetail {
  id: string;
  customer_name: string;
  customer_company: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  notes: string | null;
  total: number;
  status: string;
  created_at: string;
  is_owner: boolean;
}

const STATUS_STEPS = [
  { key: "pending", label: "Pendiente", icon: "clock" },
  { key: "confirmed", label: "Confirmado", icon: "check" },
  { key: "shipped", label: "Enviado", icon: "truck" },
  { key: "delivered", label: "Entregado", icon: "package" },
] as const;

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: "Pendiente",
    confirmed: "Confirmado",
    shipped: "Enviado",
    delivered: "Entregado",
    cancelled: "Cancelado",
  };
  return map[status] ?? status;
}

function statusVariant(
  status: string
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "delivered") return "default";
  if (status === "cancelled") return "destructive";
  if (status === "shipped" || status === "confirmed") return "secondary";
  return "outline";
}

function formatDate(dateStr: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateStr));
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
  }).format(amount);
}

export default function OrderTrackingPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const orderId = params.id as string;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;

    fetch(`/api/orders/${orderId}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Pedido no encontrado");
        }
        return res.json();
      })
      .then((data) => {
        setOrder(data.order);
        setItems(data.items);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Error al cargar el pedido");
      })
      .finally(() => setLoading(false));
  }, [orderId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-gray-200 border-t-orange-500 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Pedido no encontrado</h1>
          <p className="text-sm text-gray-500 mb-6">{error}</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-orange-600 hover:text-orange-700 font-medium"
          >
            Volver al catálogo
          </Link>
        </main>
      </div>
    );
  }

  const currentStepIndex = order.status === "cancelled"
    ? -1
    : STATUS_STEPS.findIndex((s) => s.key === order.status);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-5">
        {/* Order header */}
        <section className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-100 p-5">
          <div className="flex items-start justify-between gap-3 mb-1">
            <div>
              <p className="text-xs text-gray-400 mb-1">
                Pedido #{order.id.slice(0, 8).toUpperCase()}
              </p>
              <h1 className="text-lg font-bold text-gray-900">
                Seguimiento del pedido
              </h1>
            </div>
            <Badge variant={statusVariant(order.status)} className="shrink-0 mt-1">
              {statusLabel(order.status)}
            </Badge>
          </div>
          <p className="text-xs text-gray-400">
            {formatDate(order.created_at)}
          </p>
        </section>

        {/* Progress tracker */}
        {order.status !== "cancelled" ? (
          <section className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">Estado</h2>
            <div className="flex items-center gap-0">
              {STATUS_STEPS.map((step, idx) => {
                const isCompleted = idx <= currentStepIndex;
                const isCurrent = idx === currentStepIndex;
                return (
                  <div key={step.key} className="flex items-center flex-1 last:flex-none">
                    <div className="flex flex-col items-center gap-1.5">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                          isCompleted
                            ? "bg-orange-500 text-white"
                            : "bg-gray-100 text-gray-400"
                        } ${isCurrent ? "ring-2 ring-orange-200" : ""}`}
                      >
                        {isCompleted ? (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          idx + 1
                        )}
                      </div>
                      <span
                        className={`text-[10px] font-medium text-center leading-tight ${
                          isCompleted ? "text-gray-900" : "text-gray-400"
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>
                    {idx < STATUS_STEPS.length - 1 && (
                      <div
                        className={`flex-1 h-0.5 mx-1 mt-[-18px] ${
                          idx < currentStepIndex ? "bg-orange-500" : "bg-gray-200"
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ) : (
          <section className="bg-red-50 rounded-2xl ring-1 ring-red-100 p-5 text-center">
            <p className="text-sm font-medium text-red-700">
              Este pedido fue cancelado.
            </p>
          </section>
        )}

        {/* Order items */}
        <section className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">
            Productos ({items.length})
          </h2>
          <ul className="divide-y divide-gray-100">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {item.product_name}
                  </p>
                  {item.product_code && (
                    <p className="text-xs text-gray-400">Cod: {item.product_code}</p>
                  )}
                  <p className="text-xs text-gray-500">
                    {formatCurrency(item.unit_price)} x {item.quantity}
                  </p>
                </div>
                <span className="text-sm font-semibold text-gray-900 ml-3">
                  {formatCurrency(item.subtotal)}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between pt-3 mt-3 border-t border-gray-100">
            <span className="text-sm font-medium text-gray-600">Total</span>
            <span className="text-base font-bold text-gray-900">
              {formatCurrency(order.total)}
            </span>
          </div>
        </section>

        {/* Customer info */}
        <section className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">
            Datos del cliente
          </h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-xs text-gray-400">Nombre</dt>
              <dd className="text-gray-900 font-medium">{order.customer_name}</dd>
            </div>
            {order.customer_company && (
              <div>
                <dt className="text-xs text-gray-400">Empresa</dt>
                <dd className="text-gray-900 font-medium">{order.customer_company}</dd>
              </div>
            )}
            {order.customer_phone && (
              <div>
                <dt className="text-xs text-gray-400">Teléfono</dt>
                <dd className="text-gray-900 font-medium">{order.customer_phone}</dd>
              </div>
            )}
            {order.customer_email && (
              <div>
                <dt className="text-xs text-gray-400">Email</dt>
                <dd className="text-gray-900 font-medium">{order.customer_email}</dd>
              </div>
            )}
          </dl>
          {order.notes && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <dt className="text-xs text-gray-400 mb-1">Notas</dt>
              <dd className="text-sm text-gray-700">{order.notes}</dd>
            </div>
          )}
        </section>

        {/* Actions */}
        <div className="flex flex-col items-center gap-3 pb-6">
          {user && order.is_owner && (
            <Link
              href="/perfil"
              className="text-sm text-orange-600 hover:text-orange-700 font-medium"
            >
              Ver todos mis pedidos
            </Link>
          )}
          <Link
            href="/"
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Volver al catálogo
          </Link>
        </div>
      </main>
    </div>
  );
}

function Header() {
  return (
    <header
      className="sticky top-0 z-50 h-14 flex items-center px-4 shadow-md"
      style={{ backgroundColor: "var(--navy)" }}
    >
      <Link href="/" className="flex items-center gap-1.5">
        <span
          className="text-lg font-extrabold tracking-wide"
          style={{ color: "var(--brand)" }}
        >
          MP TOOLS
        </span>
        <span className="text-xs text-white/70 font-medium">Mayorista</span>
      </Link>
    </header>
  );
}
