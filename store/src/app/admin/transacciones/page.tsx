"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  SearchIcon,
  DownloadIcon,
  ShoppingCart,
  Package,
  MessageCircle,
  Camera as InstagramIcon,
  User as UserIcon,
  CalendarIcon,
  FilterIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatMoney, formatDate } from "@/lib/format";
import type {
  OrderChannel,
  OrderItem,
  OrderPayment,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "@/lib/types";

type TransactionRow = {
  id: string;
  created_at: string;
  total: number;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  seller_user_id: string | null;
  seller_name: string | null;
  channel: OrderChannel;
  status: OrderStatus;
  payment_status: PaymentStatus;
  items_count: number;
  paid_amount: number;
  order_number: number | null;
};

type Kpis = {
  today: { count: number; total: number };
  week: { count: number; total: number };
  avgTicket: number;
  pendingPayments: { count: number; total: number };
};

type Preset = "today" | "yesterday" | "7d" | "30d" | "month" | "custom";

type StatusHistoryEntry = {
  id: string;
  order_id: string;
  status: string;
  changed_at: string;
  notes: string | null;
};

type FullOrderResponse = {
  order: {
    id: string;
    order_number: number | null;
    customer_name: string;
    customer_phone: string | null;
    customer_email: string | null;
    customer_company: string | null;
    customer_id: string | null;
    seller_user_id: string | null;
    seller_name: string | null;
    channel: OrderChannel;
    subtotal: number | null;
    discount_total: number;
    shipping_total: number;
    tax_total: number;
    total: number;
    status: OrderStatus;
    payment_status: PaymentStatus;
    notes: string | null;
    notes_internal: string | null;
    created_at: string;
  };
  items: OrderItem[];
  payments: OrderPayment[];
  status_history: StatusHistoryEntry[];
  customer: Record<string, unknown> | null;
  total_paid: number;
  balance_due: number;
};

type Seller = { id: string; full_name: string | null };

const PAYMENT_METHODS: PaymentMethod[] = [
  "efectivo",
  "tarjeta",
  "transferencia",
  "mercadopago",
  "credito_cliente",
  "otro",
];

const METHOD_LABEL: Record<PaymentMethod, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  mercadopago: "MercadoPago",
  credito_cliente: "Crédito cliente",
  otro: "Otro",
};

function ChannelIcon({ channel }: { channel: OrderChannel }) {
  const cls = "text-gray-500";
  switch (channel) {
    case "pos":
      return <ShoppingCart size={14} className={cls} />;
    case "catalog":
      return <Package size={14} className={cls} />;
    case "whatsapp":
      return <MessageCircle size={14} className={cls} />;
    case "instagram":
      return <InstagramIcon size={14} className={cls} />;
    case "manual":
    default:
      return <UserIcon size={14} className={cls} />;
  }
}

function channelLabel(c: OrderChannel): string {
  const map: Record<OrderChannel, string> = {
    pos: "POS",
    catalog: "Catálogo",
    whatsapp: "WhatsApp",
    instagram: "Instagram",
    manual: "Manual",
  };
  return map[c] ?? c;
}

function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const map: Record<PaymentStatus, { label: string; className: string }> = {
    paid: { label: "Pagado", className: "bg-green-100 text-green-800 border-green-200" },
    partial: { label: "Parcial", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
    pending: { label: "Pendiente", className: "bg-orange-100 text-orange-800 border-orange-200" },
  };
  const cfg = map[status] ?? map.pending;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const map: Record<OrderStatus, { label: string; className: string }> = {
    pending: { label: "Pendiente", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
    confirmed: { label: "Confirmado", className: "bg-green-100 text-green-800 border-green-200" },
    preparing: { label: "Preparando", className: "bg-blue-100 text-blue-800 border-blue-200" },
    shipped: { label: "Enviado", className: "bg-purple-100 text-purple-800 border-purple-200" },
    delivered: { label: "Entregado", className: "bg-emerald-100 text-emerald-800 border-emerald-200" },
    cancelled: { label: "Cancelado", className: "bg-red-100 text-red-800 border-red-200" },
  };
  const cfg = map[status] ?? map.pending;
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}

function presetRange(p: Preset): { from: string | null; to: string | null } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
  const endOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString();

  if (p === "today") return { from: startOfDay(now), to: endOfDay(now) };
  if (p === "yesterday") {
    const y = new Date(now);
    y.setDate(now.getDate() - 1);
    return { from: startOfDay(y), to: endOfDay(y) };
  }
  if (p === "7d") {
    const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { from: startOfDay(d), to: endOfDay(now) };
  }
  if (p === "30d") {
    const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { from: startOfDay(d), to: endOfDay(now) };
  }
  if (p === "month") {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: startOfDay(d), to: endOfDay(now) };
  }
  return { from: null, to: null };
}

export default function TransaccionesAdmin() {
  const [rows, setRows] = useState<TransactionRow[]>([]);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [sellers, setSellers] = useState<Seller[]>([]);

  const [preset, setPreset] = useState<Preset>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [sellerId, setSellerId] = useState<string>("");
  const [channel, setChannel] = useState<string>("all");
  const [paymentStatus, setPaymentStatus] = useState<string>("all");
  const [q, setQ] = useState("");

  const [selected, setSelected] = useState<FullOrderResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Add payment form
  const [payOpen, setPayOpen] = useState(false);
  const [payMethod, setPayMethod] = useState<PaymentMethod>("efectivo");
  const [payAmount, setPayAmount] = useState("");
  const [payReference, setPayReference] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [paySaving, setPaySaving] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  // Load sellers once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/users");
        if (!res.ok) return;
        const body = await res.json();
        if (cancelled) return;
        const list: Seller[] = (body.users ?? body.profiles ?? []).map(
          (u: { id: string; full_name: string | null }) => ({
            id: u.id,
            full_name: u.full_name,
          })
        );
        setSellers(list);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    let from: string | null = null;
    let to: string | null = null;
    if (preset === "custom") {
      if (customFrom) from = new Date(customFrom).toISOString();
      if (customTo) {
        const d = new Date(customTo);
        d.setHours(23, 59, 59, 999);
        to = d.toISOString();
      }
    } else {
      const r = presetRange(preset);
      from = r.from;
      to = r.to;
    }
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (sellerId) params.set("seller_id", sellerId);
    if (channel !== "all") params.set("channel", channel);
    if (paymentStatus !== "all") params.set("payment_status", paymentStatus);
    if (q.trim()) params.set("q", q.trim());

    try {
      const res = await fetch(`/api/admin/transactions?${params.toString()}`);
      const body = await res.json();
      if (res.ok) {
        setRows(body.rows ?? []);
        setKpis(body.kpis ?? null);
      } else {
        setRows([]);
        setKpis(null);
      }
    } finally {
      setLoading(false);
    }
  }, [preset, customFrom, customTo, sellerId, channel, paymentStatus, q]);

  useEffect(() => {
    const t = setTimeout(fetchData, 250);
    return () => clearTimeout(t);
  }, [fetchData]);

  async function openDetail(row: TransactionRow) {
    setDetailLoading(true);
    setSelected({
      order: {
        id: row.id,
        order_number: row.order_number,
        customer_name: row.customer_name ?? "",
        customer_phone: row.customer_phone,
        customer_email: null,
        customer_company: null,
        customer_id: row.customer_id,
        seller_user_id: row.seller_user_id,
        seller_name: row.seller_name,
        channel: row.channel,
        subtotal: null,
        discount_total: 0,
        shipping_total: 0,
        tax_total: 0,
        total: row.total,
        status: row.status,
        payment_status: row.payment_status,
        notes: null,
        notes_internal: null,
        created_at: row.created_at,
      },
      items: [],
      payments: [],
      status_history: [],
      customer: null,
      total_paid: row.paid_amount,
      balance_due: Math.max(0, row.total - row.paid_amount),
    });
    try {
      const res = await fetch(`/api/admin/orders/${row.id}/full`);
      const body = await res.json();
      if (res.ok) setSelected(body as FullOrderResponse);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setSelected(null);
    setPayOpen(false);
    setPayAmount("");
    setPayReference("");
    setPayNotes("");
    setPayError(null);
  }

  async function submitPayment() {
    if (!selected) return;
    const amt = Number(payAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setPayError("Monto inválido");
      return;
    }
    setPaySaving(true);
    setPayError(null);
    try {
      const res = await fetch(
        `/api/admin/orders/${selected.order.id}/payments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            method: payMethod,
            amount: amt,
            reference: payReference || null,
            notes: payNotes || null,
          }),
        }
      );
      const body = await res.json();
      if (!res.ok) {
        setPayError(body.error ?? "Error al registrar pago");
        return;
      }
      // Refresh detail and list
      const refresh = await fetch(`/api/admin/orders/${selected.order.id}/full`);
      const refreshBody = await refresh.json();
      if (refresh.ok) setSelected(refreshBody as FullOrderResponse);
      setPayAmount("");
      setPayReference("");
      setPayNotes("");
      setPayOpen(false);
      fetchData();
    } finally {
      setPaySaving(false);
    }
  }

  function exportCsv() {
    const headers = [
      "Fecha",
      "# Orden",
      "Cliente",
      "Vendedor",
      "Canal",
      "Items",
      "Total",
      "Pagado",
      "Estado pago",
      "Estado pedido",
    ];
    const csvRows = [headers.join(",")];
    for (const r of rows) {
      csvRows.push(
        [
          `"${formatDate(r.created_at, true)}"`,
          r.order_number ?? "",
          `"${(r.customer_name ?? "").replace(/"/g, '""')}"`,
          `"${(r.seller_name ?? "").replace(/"/g, '""')}"`,
          channelLabel(r.channel),
          r.items_count,
          r.total.toFixed(2),
          r.paid_amount.toFixed(2),
          r.payment_status,
          r.status,
        ].join(",")
      );
    }
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transacciones_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const presets: { key: Preset; label: string }[] = [
    { key: "today", label: "Hoy" },
    { key: "yesterday", label: "Ayer" },
    { key: "7d", label: "7 días" },
    { key: "30d", label: "30 días" },
    { key: "month", label: "Este mes" },
    { key: "custom", label: "Custom" },
  ];

  const balanceDue = useMemo(
    () => (selected ? Math.max(0, Number(selected.order.total) - selected.total_paid) : 0),
    [selected]
  );

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transacciones</h1>
          <p className="text-gray-500 mt-1">Historial de ventas, cobros y saldos pendientes</p>
        </div>
        <Button
          onClick={exportCsv}
          variant="outline"
          className="border-gray-200"
          disabled={rows.length === 0}
        >
          <DownloadIcon size={14} /> Exportar CSV
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiCard
          label="Ventas hoy"
          value={kpis ? formatMoney(kpis.today.total) : "—"}
          sub={kpis ? `${kpis.today.count} ventas` : undefined}
        />
        <KpiCard
          label="Ventas 7 días"
          value={kpis ? formatMoney(kpis.week.total) : "—"}
          sub={kpis ? `${kpis.week.count} ventas` : undefined}
        />
        <KpiCard
          label="Ticket promedio"
          value={kpis ? formatMoney(kpis.avgTicket) : "—"}
          sub="Últimos 7 días"
        />
        <KpiCard
          label="Cobros pendientes"
          value={kpis ? formatMoney(kpis.pendingPayments.total) : "—"}
          sub={kpis ? `${kpis.pendingPayments.count} pedidos` : undefined}
          tone="pending"
        />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl ring-1 ring-foreground/10 p-4 mb-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <CalendarIcon size={14} className="text-gray-400" />
          {presets.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors border ${
                preset === p.key
                  ? "bg-orange-500 text-white border-orange-500"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
            >
              {p.label}
            </button>
          ))}
          {preset === "custom" && (
            <>
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="max-w-[160px]"
              />
              <span className="text-xs text-gray-400">→</span>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="max-w-[160px]"
              />
            </>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <FilterIcon size={14} className="text-gray-400" />
          <select
            value={sellerId}
            onChange={(e) => setSellerId(e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="">Todos los vendedores</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name ?? s.id.slice(0, 8)}
              </option>
            ))}
          </select>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="all">Todos los canales</option>
            <option value="pos">POS</option>
            <option value="catalog">Catálogo</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="instagram">Instagram</option>
            <option value="manual">Manual</option>
          </select>
          <select
            value={paymentStatus}
            onChange={(e) => setPaymentStatus(e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="all">Todos los pagos</option>
            <option value="paid">Pagado</option>
            <option value="partial">Parcial</option>
            <option value="pending">Pendiente</option>
          </select>

          <div className="relative flex-1 min-w-[200px]">
            <SearchIcon
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por # de orden o cliente"
              className="pl-8"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl ring-1 ring-foreground/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-3 py-3 text-left font-medium text-gray-600">Fecha</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600"># Orden</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">Cliente</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">Vendedor</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">Canal</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600">Items</th>
                <th className="px-3 py-3 text-right font-medium text-gray-600">Total</th>
                <th className="px-3 py-3 text-right font-medium text-gray-600">Pagado</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600">Pago</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600">Pedido</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-3 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-gray-400">
                    No hay transacciones para los filtros seleccionados
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => openDetail(r)}
                    className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer"
                  >
                    <td className="px-3 py-3 text-gray-500 whitespace-nowrap">
                      {formatDate(r.created_at, true)}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-gray-700">
                      #{r.order_number ?? r.id.slice(0, 6)}
                    </td>
                    <td className="px-3 py-3 font-medium text-gray-900">
                      {r.customer_name ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-gray-500">{r.seller_name ?? "—"}</td>
                    <td className="px-3 py-3 text-gray-500">
                      <div className="inline-flex items-center gap-1.5">
                        <ChannelIcon channel={r.channel} />
                        {channelLabel(r.channel)}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center text-gray-500">{r.items_count}</td>
                    <td className="px-3 py-3 text-right font-semibold text-gray-900">
                      {formatMoney(r.total)}
                    </td>
                    <td
                      className={`px-3 py-3 text-right ${
                        r.paid_amount >= r.total
                          ? "text-green-700"
                          : r.paid_amount > 0
                          ? "text-yellow-700"
                          : "text-gray-400"
                      }`}
                    >
                      {formatMoney(r.paid_amount)}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <PaymentStatusBadge status={r.payment_status} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <OrderStatusBadge status={r.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail sheet */}
      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {selected
                ? `Venta #${selected.order.order_number ?? selected.order.id.slice(0, 6)}`
                : "Detalle"}
            </SheetTitle>
          </SheetHeader>

          {selected && (
            <div className="px-4 py-4 space-y-5">
              {/* Header info */}
              <div className="bg-gray-50 rounded-lg p-4 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Fecha</span>
                  <span className="text-sm font-medium">
                    {formatDate(selected.order.created_at, true)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Canal</span>
                  <span className="text-sm font-medium inline-flex items-center gap-1.5">
                    <ChannelIcon channel={selected.order.channel} />
                    {channelLabel(selected.order.channel)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Vendedor</span>
                  <span className="text-sm font-medium">
                    {selected.order.seller_name ?? "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Estado pedido</span>
                  <OrderStatusBadge status={selected.order.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Estado pago</span>
                  <PaymentStatusBadge status={selected.order.payment_status} />
                </div>
              </div>

              {/* Customer */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Cliente</h3>
                <div className="rounded-lg border border-gray-100 p-3 text-sm space-y-1">
                  <p className="font-medium">{selected.order.customer_name || "—"}</p>
                  {selected.order.customer_phone && (
                    <p className="text-gray-500">{selected.order.customer_phone}</p>
                  )}
                  {selected.order.customer_email && (
                    <p className="text-gray-500">{selected.order.customer_email}</p>
                  )}
                  {selected.order.customer_company && (
                    <p className="text-gray-500">{selected.order.customer_company}</p>
                  )}
                </div>
              </div>

              {/* Items */}
              <div>
                <h3 className="font-semibold text-gray-900 mb-2">
                  Items ({selected.items.length})
                </h3>
                {detailLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
                    ))}
                  </div>
                ) : selected.items.length === 0 ? (
                  <p className="text-sm text-gray-400">Sin items</p>
                ) : (
                  <div className="space-y-1">
                    {selected.items.map((it) => (
                      <div
                        key={it.id}
                        className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {it.product_name}
                          </p>
                          {it.product_code && (
                            <p className="text-xs text-gray-400 font-mono">
                              {it.product_code}
                            </p>
                          )}
                        </div>
                        <div className="text-right ml-3 shrink-0">
                          <p className="text-sm font-medium">{formatMoney(it.subtotal)}</p>
                          <p className="text-xs text-gray-400">
                            {it.quantity} × {formatMoney(it.unit_price)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Totals */}
              <div className="rounded-lg bg-gray-50 p-4 space-y-1.5 text-sm">
                {selected.order.subtotal !== null && (
                  <div className="flex justify-between text-gray-500">
                    <span>Subtotal</span>
                    <span>{formatMoney(Number(selected.order.subtotal))}</span>
                  </div>
                )}
                {Number(selected.order.discount_total) > 0 && (
                  <div className="flex justify-between text-gray-500">
                    <span>Descuento</span>
                    <span>− {formatMoney(Number(selected.order.discount_total))}</span>
                  </div>
                )}
                {Number(selected.order.shipping_total) > 0 && (
                  <div className="flex justify-between text-gray-500">
                    <span>Envío</span>
                    <span>{formatMoney(Number(selected.order.shipping_total))}</span>
                  </div>
                )}
                {Number(selected.order.tax_total) > 0 && (
                  <div className="flex justify-between text-gray-500">
                    <span>Impuestos</span>
                    <span>{formatMoney(Number(selected.order.tax_total))}</span>
                  </div>
                )}
                <div className="flex justify-between pt-1 border-t border-gray-200 font-semibold text-gray-900">
                  <span>Total</span>
                  <span>{formatMoney(Number(selected.order.total))}</span>
                </div>
                <div className="flex justify-between text-green-700">
                  <span>Pagado</span>
                  <span>{formatMoney(selected.total_paid)}</span>
                </div>
                {balanceDue > 0 && (
                  <div className="flex justify-between text-orange-600 font-semibold">
                    <span>Saldo pendiente</span>
                    <span>{formatMoney(balanceDue)}</span>
                  </div>
                )}
              </div>

              {/* Payments */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-900">
                    Pagos ({selected.payments.length})
                  </h3>
                  {balanceDue > 0 && !payOpen && (
                    <Button
                      size="xs"
                      onClick={() => {
                        setPayAmount(balanceDue.toFixed(2));
                        setPayOpen(true);
                      }}
                      className="bg-orange-500 hover:bg-orange-600 text-white border-0"
                    >
                      <PlusIcon size={12} /> Registrar pago
                    </Button>
                  )}
                </div>

                {payOpen && (
                  <div className="rounded-lg border border-orange-200 bg-orange-50/40 p-3 mb-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold">Nuevo pago</h4>
                      <button
                        onClick={() => {
                          setPayOpen(false);
                          setPayError(null);
                        }}
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <XIcon size={14} />
                      </button>
                    </div>
                    {payError && (
                      <div className="p-2 rounded bg-red-50 text-red-700 text-xs border border-red-200">
                        {payError}
                      </div>
                    )}
                    <select
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                      className="h-8 w-full rounded-lg border border-input bg-white px-2.5 text-sm"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {METHOD_LABEL[m]}
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
                      onClick={submitPayment}
                      disabled={paySaving || !payAmount}
                      className="w-full bg-orange-500 hover:bg-orange-600 text-white border-0"
                    >
                      {paySaving ? "Registrando..." : "Registrar pago"}
                    </Button>
                  </div>
                )}

                {selected.payments.length === 0 ? (
                  <p className="text-sm text-gray-400">Sin pagos registrados</p>
                ) : (
                  <div className="space-y-1">
                    {selected.payments.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 text-sm"
                      >
                        <div>
                          <p className="font-medium">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-gray-100 border border-gray-200">
                              {METHOD_LABEL[p.method as PaymentMethod] ?? p.method}
                            </span>
                          </p>
                          <p className="text-xs text-gray-400">
                            {formatDate(p.paid_at, true)}
                            {p.reference && ` · Ref: ${p.reference}`}
                          </p>
                          {p.notes && <p className="text-xs text-gray-500">{p.notes}</p>}
                        </div>
                        <p className="font-semibold text-green-700">
                          {formatMoney(Number(p.amount))}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Status history */}
              {selected.status_history.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Historial de estados</h3>
                  <div className="space-y-1">
                    {selected.status_history.map((h) => (
                      <div
                        key={h.id}
                        className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0 text-xs"
                      >
                        <div>
                          <OrderStatusBadge status={h.status as OrderStatus} />
                          {h.notes && <p className="text-gray-500 mt-1">{h.notes}</p>}
                        </div>
                        <span className="text-gray-400">{formatDate(h.changed_at, true)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {(selected.order.notes || selected.order.notes_internal) && (
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Notas</h3>
                  {selected.order.notes && (
                    <p className="text-sm text-gray-600">{selected.order.notes}</p>
                  )}
                  {selected.order.notes_internal && (
                    <p className="text-sm text-gray-500 italic mt-1">
                      Interno: {selected.order.notes_internal}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "pending" | "positive";
}) {
  const valueColor =
    tone === "pending"
      ? "text-orange-600"
      : tone === "positive"
      ? "text-green-700"
      : "text-gray-900";
  return (
    <div className="rounded-xl bg-white ring-1 ring-foreground/10 p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${valueColor}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
