"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import {
  SearchIcon,
  ShoppingCart,
  Package,
  MessageCircle,
  Camera as Instagram,
  User,
  FileText,
  Printer,
  ExternalLink,
  XCircle,
  History,
  Wallet,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type {
  Order,
  OrderItem,
  OrderPayment,
  OrderChannel,
  PaymentMethod,
  PaymentStatus,
} from "@/lib/types";
import { formatMoney, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

// ---------------------------------------------------------------------------
// Types local
// ---------------------------------------------------------------------------

type OrderStatusRow = {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  is_default: boolean;
  is_closed: boolean;
  is_cancelled: boolean;
  is_active: boolean;
};

type OrderItemExt = OrderItem & {
  product_image_url?: string | null;
};

type OrderWithExtras = Order & {
  order_items?: OrderItemExt[];
  seller_name?: string | null;
};

type StatusHistoryEntry = {
  id: string;
  order_id: string;
  status: string;
  changed_by: string | null;
  changed_by_name: string | null;
  changed_at: string;
  notes: string | null;
};

type DateRangePreset = "all" | "7d" | "30d" | "custom";
type PaymentStatusFilter = "all" | PaymentStatus;
type ChannelFilter = "all" | OrderChannel;

// ---------------------------------------------------------------------------
// Spanish labels
// ---------------------------------------------------------------------------

const CHANNEL_LABEL: Record<OrderChannel, string> = {
  pos: "POS",
  catalog: "Catálogo",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  manual: "Manual",
};

const CHANNELS: OrderChannel[] = ["pos", "catalog", "whatsapp", "instagram", "manual"];

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  preparing: "Preparando",
  shipped: "Enviado",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: "Sin pagar",
  partial: "Parcial",
  paid: "Pagado",
};

const PAYMENT_STATUS_STYLE: Record<PaymentStatus, string> = {
  pending: "bg-gray-100 text-gray-700 border-gray-200",
  partial: "bg-yellow-100 text-yellow-800 border-yellow-200",
  paid: "bg-green-100 text-green-700 border-green-200",
};

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  mercadopago: "MercadoPago",
  credito_cliente: "Crédito cliente",
  otro: "Otro",
};

const PAYMENT_METHODS: PaymentMethod[] = [
  "efectivo",
  "tarjeta",
  "transferencia",
  "mercadopago",
  "credito_cliente",
  "otro",
];

// ---------------------------------------------------------------------------
// Small visual components
// ---------------------------------------------------------------------------

function ChannelIcon({ channel, size = 14 }: { channel: OrderChannel; size?: number }) {
  switch (channel) {
    case "pos":
      return <ShoppingCart size={size} />;
    case "catalog":
      return <Package size={size} />;
    case "whatsapp":
      return <MessageCircle size={size} />;
    case "instagram":
      return <Instagram size={size} />;
    case "manual":
    default:
      return <User size={size} />;
  }
}

function ChannelBadge({ channel }: { channel: OrderChannel }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-gray-50 text-gray-700 border-gray-200">
      <ChannelIcon channel={channel} />
      {CHANNEL_LABEL[channel]}
    </span>
  );
}

function StatusBadge({
  status,
  color,
}: {
  status: string;
  color?: string;
}) {
  const bg = color ? `${color}22` : "#e5e7eb";
  const fg = color ?? "#374151";
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
      style={{
        backgroundColor: bg,
        color: fg,
        borderColor: `${fg}55`,
      }}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${PAYMENT_STATUS_STYLE[status]}`}
    >
      {PAYMENT_STATUS_LABEL[status]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDatePreset(preset: DateRangePreset): { from: string | null; to: string | null } {
  const now = new Date();
  if (preset === "7d") {
    const from = new Date(now);
    from.setDate(from.getDate() - 7);
    return { from: from.toISOString(), to: null };
  }
  if (preset === "30d") {
    const from = new Date(now);
    from.setDate(from.getDate() - 30);
    return { from: from.toISOString(), to: null };
  }
  return { from: null, to: null };
}

function whatsappLink(phone: string | null, name: string, orderNumber: number | null) {
  if (!phone) return null;
  const clean = phone.replace(/\D/g, "");
  const num = orderNumber ? `#${orderNumber}` : "";
  const msg = encodeURIComponent(
    `Hola ${name}, te contactamos por tu pedido ${num} en MP Tools.`
  );
  return `https://wa.me/${clean}?text=${msg}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function PedidosAdmin() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [statuses, setStatuses] = useState<OrderStatusRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [paymentFilter, setPaymentFilter] = useState<PaymentStatusFilter>("all");
  const [q, setQ] = useState("");
  const [datePreset, setDatePreset] = useState<DateRangePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  // Detail sheet
  const [selected, setSelected] = useState<OrderWithExtras | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [payments, setPayments] = useState<OrderPayment[]>([]);
  const [statusHistory, setStatusHistory] = useState<StatusHistoryEntry[]>([]);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [newStatus, setNewStatus] = useState<string>("");

  // Payment form
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("efectivo");
  const [payReference, setPayReference] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);

  // Internal notes debounce
  const [internalNotes, setInternalNotes] = useState("");
  const internalNotesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load statuses once
  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/order-statuses");
      const body = await res.json();
      if (res.ok) setStatuses((body.statuses as OrderStatusRow[]) ?? []);
    })();
  }, []);

  const statusesByName = useMemo(() => {
    const m: Record<string, OrderStatusRow> = {};
    for (const s of statuses) m[s.name] = s;
    return m;
  }, [statuses]);

  const fetchOrders = useCallback(async () => {
    setLoading(true);

    let query = supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });

    if (statusFilter !== "all") query = query.eq("status", statusFilter);
    if (channelFilter !== "all") query = query.eq("channel", channelFilter);
    if (paymentFilter !== "all") query = query.eq("payment_status", paymentFilter);

    if (datePreset !== "all" && datePreset !== "custom") {
      const { from } = parseDatePreset(datePreset);
      if (from) query = query.gte("created_at", from);
    } else if (datePreset === "custom") {
      if (customFrom) query = query.gte("created_at", new Date(customFrom).toISOString());
      if (customTo) {
        const end = new Date(customTo);
        end.setHours(23, 59, 59, 999);
        query = query.lte("created_at", end.toISOString());
      }
    }

    const { data } = await query.limit(300);
    let list = (data as Order[]) ?? [];

    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter((o) => {
        const num = o.order_number?.toString() ?? "";
        return (
          num.includes(needle) ||
          (o.customer_name ?? "").toLowerCase().includes(needle) ||
          (o.customer_company ?? "").toLowerCase().includes(needle) ||
          (o.customer_phone ?? "").toLowerCase().includes(needle)
        );
      });
    }

    setOrders(list);
    setLoading(false);
  }, [statusFilter, channelFilter, paymentFilter, q, datePreset, customFrom, customTo]);

  useEffect(() => {
    const t = setTimeout(fetchOrders, 200);
    return () => clearTimeout(t);
  }, [fetchOrders]);

  // -------------------------------------------------------------------------
  // Load aggregated seller names into a small map
  // -------------------------------------------------------------------------
  const [sellerMap, setSellerMap] = useState<Record<string, string>>({});
  useEffect(() => {
    const ids = Array.from(
      new Set(orders.map((o) => o.seller_user_id).filter((x): x is string => Boolean(x)))
    ).filter((id) => !(id in sellerMap));
    if (ids.length === 0) return;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      if (data) {
        setSellerMap((prev) => {
          const next = { ...prev };
          for (const p of data) {
            next[p.id as string] = (p.full_name as string) ?? "";
          }
          return next;
        });
      }
    })();
  }, [orders, sellerMap]);

  // -------------------------------------------------------------------------
  // Computed totals per order (paid)
  // -------------------------------------------------------------------------
  const [paidMap, setPaidMap] = useState<Record<string, number>>({});
  useEffect(() => {
    const ids = orders.map((o) => o.id);
    if (ids.length === 0) return;
    (async () => {
      const { data } = await supabase
        .from("order_payments")
        .select("order_id, amount")
        .in("order_id", ids);
      const map: Record<string, number> = {};
      for (const row of data ?? []) {
        const oid = row.order_id as string;
        map[oid] = (map[oid] ?? 0) + Number(row.amount ?? 0);
      }
      setPaidMap(map);
    })();
  }, [orders]);

  // -------------------------------------------------------------------------
  // Detail loaders
  // -------------------------------------------------------------------------

  async function openOrder(order: Order) {
    setSelected(order as OrderWithExtras);
    setDetailLoading(true);
    setInternalNotes(order.notes_internal ?? "");
    setNewStatus(order.status);
    setPayAmount("");
    setPayMethod("efectivo");
    setPayReference("");
    setPayNotes("");

    // Load in parallel
    const [itemsRes, paysRes, histRes, sellerRes] = await Promise.all([
      supabase
        .from("order_items")
        .select("*")
        .eq("order_id", order.id),
      fetch(`/api/admin/orders/${order.id}/payments`),
      fetch(`/api/admin/orders/${order.id}/status-history`),
      order.seller_user_id
        ? supabase
            .from("profiles")
            .select("id, full_name")
            .eq("id", order.seller_user_id)
            .single()
        : Promise.resolve({ data: null }),
    ]);

    const items = (itemsRes.data as OrderItemExt[]) ?? [];

    // Enrich with product image_url
    const productIds = items
      .map((i) => i.product_id)
      .filter((x): x is string => Boolean(x));
    if (productIds.length > 0) {
      const { data: prods } = await supabase
        .from("products")
        .select("id, image_url")
        .in("id", productIds);
      const imgMap: Record<string, string | null> = {};
      for (const p of prods ?? []) imgMap[p.id as string] = (p.image_url as string) ?? null;
      for (const it of items) {
        if (it.product_id) it.product_image_url = imgMap[it.product_id] ?? null;
      }
    }

    const paysBody = paysRes.ok ? await paysRes.json() : { payments: [] };
    const histBody = histRes.ok ? await histRes.json() : { entries: [] };

    const sellerName =
      sellerRes && "data" in sellerRes && sellerRes.data
        ? (sellerRes.data as { full_name?: string }).full_name ?? null
        : null;

    setSelected({
      ...order,
      order_items: items,
      seller_name: sellerName,
    });
    setPayments((paysBody.payments as OrderPayment[]) ?? []);
    setStatusHistory((histBody.entries as StatusHistoryEntry[]) ?? []);
    setDetailLoading(false);
  }

  async function refreshDetailAfterChange(id: string) {
    const [{ data: fresh }, paysRes, histRes] = await Promise.all([
      supabase.from("orders").select("*").eq("id", id).single(),
      fetch(`/api/admin/orders/${id}/payments`),
      fetch(`/api/admin/orders/${id}/status-history`),
    ]);
    if (fresh) {
      setSelected((prev) =>
        prev ? { ...prev, ...(fresh as Order) } : (fresh as OrderWithExtras)
      );
      setOrders((prev) =>
        prev.map((o) => (o.id === id ? { ...o, ...(fresh as Order) } : o))
      );
    }
    if (paysRes.ok) {
      const b = await paysRes.json();
      setPayments((b.payments as OrderPayment[]) ?? []);
    }
    if (histRes.ok) {
      const b = await histRes.json();
      setStatusHistory((b.entries as StatusHistoryEntry[]) ?? []);
    }
  }

  async function applyStatus() {
    if (!selected || !newStatus || newStatus === selected.status) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/admin/orders/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) return;
      await refreshDetailAfterChange(selected.id);
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function cancelOrder() {
    if (!selected) return;
    if (!confirm("¿Cancelar este pedido?")) return;
    setUpdatingStatus(true);
    try {
      await fetch(`/api/admin/orders/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      await refreshDetailAfterChange(selected.id);
      setNewStatus("cancelled");
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function registerPayment() {
    if (!selected) return;
    const amt = Number(payAmount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    setSavingPayment(true);
    try {
      const res = await fetch(`/api/admin/orders/${selected.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: payMethod,
          amount: amt,
          reference: payReference || null,
          notes: payNotes || null,
        }),
      });
      if (!res.ok) return;
      setPayAmount("");
      setPayReference("");
      setPayNotes("");
      await refreshDetailAfterChange(selected.id);
    } finally {
      setSavingPayment(false);
    }
  }

  // Debounced save for internal notes
  function onInternalNotesChange(value: string) {
    setInternalNotes(value);
    if (internalNotesTimer.current) clearTimeout(internalNotesTimer.current);
    internalNotesTimer.current = setTimeout(async () => {
      if (!selected) return;
      await fetch(`/api/admin/orders/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes_internal: value }),
      });
      setSelected((prev) => (prev ? { ...prev, notes_internal: value } : null));
      setOrders((prev) =>
        prev.map((o) => (o.id === selected.id ? { ...o, notes_internal: value } : o))
      );
    }, 600);
  }

  const totalPaidSelected = useMemo(
    () => payments.reduce((s, p) => s + Number(p.amount ?? 0), 0),
    [payments]
  );
  const balanceSelected = selected
    ? Math.max(0, Number(selected.total ?? 0) - totalPaidSelected)
    : 0;

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Pedidos</h1>
        <p className="text-gray-500 mt-1">Gestión de pedidos — POS, catálogo y canales externos</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl ring-1 ring-foreground/10 p-4 mb-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-2 items-start">
          <div className="relative">
            <SearchIcon
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar # pedido, cliente, empresa o teléfono"
              className="pl-9"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-lg border border-input bg-white px-3 text-sm"
          >
            <option value="all">Estado: Todos</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.name}>
                {STATUS_LABEL[s.name] ?? s.name}
              </option>
            ))}
          </select>
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value as ChannelFilter)}
            className="h-9 rounded-lg border border-input bg-white px-3 text-sm"
          >
            <option value="all">Canal: Todos</option>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>
                {CHANNEL_LABEL[c]}
              </option>
            ))}
          </select>
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value as PaymentStatusFilter)}
            className="h-9 rounded-lg border border-input bg-white px-3 text-sm"
          >
            <option value="all">Pago: Todos</option>
            <option value="pending">Sin pagar</option>
            <option value="partial">Parcial</option>
            <option value="paid">Pagado</option>
          </select>
        </div>

        <div className="flex gap-2 flex-wrap items-center">
          {(["all", "7d", "30d", "custom"] as DateRangePreset[]).map((p) => (
            <button
              key={p}
              onClick={() => setDatePreset(p)}
              className={`px-3 py-1 rounded-lg text-xs font-medium border transition ${
                datePreset === p
                  ? "bg-[#1a1a2e] text-white border-[#1a1a2e]"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
            >
              {p === "all"
                ? "Todas las fechas"
                : p === "7d"
                ? "Últimos 7 días"
                : p === "30d"
                ? "Últimos 30 días"
                : "Personalizado"}
            </button>
          ))}
          {datePreset === "custom" && (
            <>
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-8 w-auto"
              />
              <span className="text-xs text-gray-400">a</span>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-8 w-auto"
              />
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl ring-1 ring-foreground/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-3 py-3 text-left font-medium text-gray-600">#</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">Fecha</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">Cliente</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">Empresa</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">Canal</th>
                <th className="px-3 py-3 text-right font-medium text-gray-600">Total</th>
                <th className="px-3 py-3 text-right font-medium text-gray-600">Pagado</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600">Pago</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600">Estado</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">Vendedor</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 11 }).map((_, j) => (
                      <td key={j} className="px-3 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-gray-400">
                    No hay pedidos
                  </td>
                </tr>
              ) : (
                orders.map((order) => {
                  const paid = paidMap[order.id] ?? 0;
                  const statusRow = statusesByName[order.status];
                  return (
                    <tr
                      key={order.id}
                      className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer"
                      onClick={() => openOrder(order)}
                    >
                      <td className="px-3 py-3 font-mono text-xs text-gray-700">
                        {order.order_number ? `#${order.order_number}` : "—"}
                      </td>
                      <td className="px-3 py-3 text-gray-500 whitespace-nowrap">
                        {formatDate(order.created_at)}
                      </td>
                      <td className="px-3 py-3 font-medium text-gray-900">
                        {order.customer_id ? (
                          <Link
                            href={`/admin/clientes?id=${order.customer_id}`}
                            className="hover:text-orange-600 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {order.customer_name}
                          </Link>
                        ) : (
                          order.customer_name
                        )}
                      </td>
                      <td className="px-3 py-3 text-gray-500">
                        {order.customer_company ?? "—"}
                      </td>
                      <td className="px-3 py-3">
                        <ChannelBadge channel={order.channel} />
                      </td>
                      <td className="px-3 py-3 text-right font-medium text-gray-900">
                        {formatMoney(Number(order.total ?? 0))}
                      </td>
                      <td className="px-3 py-3 text-right text-gray-600">
                        {formatMoney(paid)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <PaymentStatusBadge status={order.payment_status} />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <StatusBadge status={order.status} color={statusRow?.color} />
                      </td>
                      <td className="px-3 py-3 text-gray-500 text-xs">
                        {order.seller_user_id ? sellerMap[order.seller_user_id] ?? "—" : "—"}
                      </td>
                      <td
                        className="px-3 py-3 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button size="xs" variant="outline" onClick={() => openOrder(order)}>
                          Ver
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail sheet */}
      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent
          side="right"
          className="w-full sm:!max-w-xl overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {selected?.order_number ? `Pedido #${selected.order_number}` : "Pedido"}
              {selected && (
                <>
                  <span className="text-gray-300">·</span>
                  <ChannelBadge channel={selected.channel} />
                </>
              )}
            </SheetTitle>
          </SheetHeader>

          {selected && (
            <div className="px-4 pb-6 space-y-5">
              {/* Header */}
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge
                  status={selected.status}
                  color={statusesByName[selected.status]?.color}
                />
                <PaymentStatusBadge status={selected.payment_status} />
                <span className="text-xs text-gray-400 ml-auto">
                  {formatDate(selected.created_at)}
                </span>
              </div>

              {/* Customer */}
              <section className="bg-gray-50 rounded-lg p-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900 text-sm">Cliente</h3>
                  {selected.customer_id && (
                    <Link
                      href={`/admin/clientes?id=${selected.customer_id}`}
                      className="text-xs text-orange-600 hover:underline inline-flex items-center gap-1"
                    >
                      Ver ficha <ExternalLink size={11} />
                    </Link>
                  )}
                </div>
                <p className="text-sm font-medium text-gray-900">
                  {selected.customer_name}
                </p>
                {selected.customer_company && (
                  <p className="text-xs text-gray-600">{selected.customer_company}</p>
                )}
                {selected.customer_phone && (
                  <p className="text-xs text-gray-600">{selected.customer_phone}</p>
                )}
                {selected.customer_email && (
                  <p className="text-xs text-gray-600">{selected.customer_email}</p>
                )}
              </section>

              {/* Seller */}
              {selected.seller_name && (
                <section className="text-xs text-gray-500">
                  Vendedor: <span className="font-medium text-gray-700">{selected.seller_name}</span>
                </section>
              )}

              {selected.notes && (
                <section className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
                  <p className="text-xs font-medium text-blue-900 mb-1">Nota del cliente</p>
                  <p className="text-sm text-blue-950 whitespace-pre-wrap">{selected.notes}</p>
                </section>
              )}

              {/* Items */}
              <section>
                <h3 className="font-semibold text-gray-900 text-sm mb-3">Productos</h3>
                {detailLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {(selected.order_items ?? []).map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0"
                      >
                        {item.product_image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={item.product_image_url}
                            alt={item.product_name}
                            className="h-10 w-10 rounded-md object-cover border border-gray-200 shrink-0"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-md bg-gray-100 border border-gray-200 shrink-0 flex items-center justify-center">
                            <Package size={16} className="text-gray-400" />
                          </div>
                        )}
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
                            {formatMoney(Number(item.subtotal ?? 0))}
                          </p>
                          <p className="text-xs text-gray-400">
                            {item.quantity} × {formatMoney(Number(item.unit_price ?? 0))}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Totals */}
              <section className="rounded-lg border border-gray-200 p-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatMoney(Number(selected.subtotal ?? selected.total ?? 0))}</span>
                </div>
                {Number(selected.discount_total ?? 0) > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Descuento</span>
                    <span>− {formatMoney(Number(selected.discount_total))}</span>
                  </div>
                )}
                {Number(selected.shipping_total ?? 0) > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Envío</span>
                    <span>{formatMoney(Number(selected.shipping_total))}</span>
                  </div>
                )}
                {Number(selected.tax_total ?? 0) > 0 && (
                  <div className="flex justify-between text-gray-600">
                    <span>Impuestos</span>
                    <span>{formatMoney(Number(selected.tax_total))}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-gray-200 font-semibold text-gray-900">
                  <span>Total</span>
                  <span className="text-base">{formatMoney(Number(selected.total ?? 0))}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Pagado</span>
                  <span>{formatMoney(totalPaidSelected)}</span>
                </div>
                {balanceSelected > 0 && (
                  <div className="flex justify-between text-xs font-medium text-red-600">
                    <span>Saldo pendiente</span>
                    <span>{formatMoney(balanceSelected)}</span>
                  </div>
                )}
              </section>

              {/* Payments */}
              <section className="rounded-lg border border-gray-200 p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Wallet size={14} className="text-gray-500" />
                  <h3 className="font-semibold text-gray-900 text-sm">Pagos</h3>
                </div>

                {payments.length === 0 ? (
                  <p className="text-xs text-gray-400">Sin pagos registrados</p>
                ) : (
                  <div className="space-y-1">
                    {payments.map((p) => (
                      <div
                        key={p.id}
                        className="flex justify-between text-xs border-b border-gray-100 py-1.5 last:border-0"
                      >
                        <div>
                          <p className="font-medium text-gray-800">
                            {PAYMENT_METHOD_LABEL[p.method]}
                          </p>
                          <p className="text-gray-400">
                            {formatDate(p.paid_at)}
                            {p.reference ? ` · ${p.reference}` : ""}
                          </p>
                          {p.notes && <p className="text-gray-500">{p.notes}</p>}
                        </div>
                        <p className="font-semibold text-gray-900">
                          {formatMoney(Number(p.amount))}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {balanceSelected > 0 && (
                  <div className="rounded-lg bg-gray-50 p-3 space-y-2">
                    <p className="text-xs font-medium text-gray-700">
                      Registrar pago — saldo {formatMoney(balanceSelected)}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={payMethod}
                        onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                        className="h-8 rounded-lg border border-input bg-white px-2.5 text-sm"
                      >
                        {PAYMENT_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {PAYMENT_METHOD_LABEL[m]}
                          </option>
                        ))}
                      </select>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Monto"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                      />
                    </div>
                    <Input
                      placeholder="Referencia (opcional)"
                      value={payReference}
                      onChange={(e) => setPayReference(e.target.value)}
                    />
                    <Input
                      placeholder="Notas (opcional)"
                      value={payNotes}
                      onChange={(e) => setPayNotes(e.target.value)}
                    />
                    <Button
                      onClick={registerPayment}
                      disabled={savingPayment || !payAmount}
                      className="w-full bg-orange-500 hover:bg-orange-600 text-white border-0"
                    >
                      {savingPayment ? "Registrando..." : "Registrar pago"}
                    </Button>
                  </div>
                )}
              </section>

              {/* Status change */}
              <section className="rounded-lg border border-gray-200 p-3 space-y-2">
                <h3 className="font-semibold text-gray-900 text-sm">Cambiar estado</h3>
                <div className="flex gap-2">
                  <select
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="h-9 flex-1 rounded-lg border border-input bg-white px-3 text-sm"
                  >
                    {statuses.map((s) => (
                      <option key={s.id} value={s.name}>
                        {STATUS_LABEL[s.name] ?? s.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    onClick={applyStatus}
                    disabled={updatingStatus || newStatus === selected.status}
                    className="bg-orange-500 hover:bg-orange-600 text-white border-0"
                  >
                    Aplicar
                  </Button>
                </div>
              </section>

              {/* Status history */}
              <section>
                <div className="flex items-center gap-2 mb-2">
                  <History size={14} className="text-gray-500" />
                  <h3 className="font-semibold text-gray-900 text-sm">Historial de estado</h3>
                </div>
                {statusHistory.length === 0 ? (
                  <p className="text-xs text-gray-400">Sin cambios registrados</p>
                ) : (
                  <div className="relative border-l-2 border-gray-200 pl-4 space-y-3">
                    {statusHistory.map((h) => (
                      <div key={h.id} className="relative">
                        <div
                          className="absolute -left-[21px] top-1 h-3 w-3 rounded-full border-2 border-white"
                          style={{
                            backgroundColor:
                              statusesByName[h.status]?.color ?? "#9ca3af",
                          }}
                        />
                        <div className="flex items-center gap-2 flex-wrap">
                          <StatusBadge
                            status={h.status}
                            color={statusesByName[h.status]?.color}
                          />
                          <span className="text-xs text-gray-500">
                            {formatDate(h.changed_at)}
                          </span>
                        </div>
                        {(h.changed_by_name || h.notes) && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {h.changed_by_name && (
                              <span className="font-medium">{h.changed_by_name}</span>
                            )}
                            {h.changed_by_name && h.notes ? " · " : ""}
                            {h.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Internal notes */}
              <section>
                <h3 className="font-semibold text-gray-900 text-sm mb-1">Notas internas</h3>
                <p className="text-xs text-gray-400 mb-2">
                  No son visibles para el cliente. Se guardan automáticamente.
                </p>
                <textarea
                  value={internalNotes}
                  onChange={(e) => onInternalNotesChange(e.target.value)}
                  rows={3}
                  placeholder="Notas internas del pedido..."
                  className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm"
                />
              </section>

              {/* Actions */}
              <section className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                <a
                  href={`/api/admin/orders/${selected.id}/receipt/pdf`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm hover:border-gray-300 hover:bg-gray-50"
                >
                  <FileText size={14} /> Recibo PDF
                </a>
                <Link
                  href={`/admin/vender/ticket/${selected.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-sm hover:border-gray-300 hover:bg-gray-50"
                >
                  <Printer size={14} /> Imprimir ticket
                </Link>
                {selected.customer_phone && (
                  <a
                    href={
                      whatsappLink(
                        selected.customer_phone,
                        selected.customer_name,
                        selected.order_number
                      ) ?? "#"
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-green-200 bg-green-50 text-green-700 text-sm hover:bg-green-100"
                  >
                    <MessageCircle size={14} /> WhatsApp
                  </a>
                )}
                {selected.status !== "cancelled" && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={cancelOrder}
                    disabled={updatingStatus}
                    className="ml-auto"
                  >
                    <XCircle size={14} /> Cancelar pedido
                  </Button>
                )}
              </section>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
