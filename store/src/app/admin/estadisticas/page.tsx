"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  CalendarIcon,
  TrendingUpIcon,
  UsersIcon,
  PackageIcon,
  DollarSignIcon,
  PercentIcon,
  ShoppingBagIcon,
} from "lucide-react";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Granularity = "hora" | "dia" | "semana" | "mes";
type RangePreset = "7d" | "30d" | "90d" | "thisMonth" | "lastMonth" | "thisYear" | "custom";

type SeriesPoint = { label: string; value: number };

type Overview = {
  kpis: {
    total: number;
    count: number;
    margin: number;
    avgTicket: number;
    uniqueCustomers: number;
    uniqueProducts: number;
  };
  timeseries: {
    hora: SeriesPoint[];
    dia: SeriesPoint[];
    semana: SeriesPoint[];
    mes: SeriesPoint[];
  };
  topProducts: {
    name: string;
    code: string | null;
    qty: number;
    total: number;
    margin: number;
  }[];
  topCustomers: { name: string; orders: number; total: number }[];
  sellers: {
    id: string;
    name: string;
    orders: number;
    total: number;
    avgTicket: number;
    commissionRate: number;
    commission: number;
  }[];
  byChannel: { channel: string; total: number; count: number }[];
  byPaymentMethod: { method: string; total: number; count: number }[];
};

type ProductSortKey = "total" | "qty" | "margin" | "name";

const CHANNEL_LABEL: Record<string, string> = {
  pos: "Punto de venta",
  catalog: "Catálogo",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  manual: "Manual",
};

const METHOD_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
  mercadopago: "MercadoPago",
  credito_cliente: "Crédito de cliente",
  otro: "Otro",
};

const DONUT_COLORS = [
  "#f97316",
  "#3b82f6",
  "#10b981",
  "#a855f7",
  "#ec4899",
  "#eab308",
  "#64748b",
];

function computeRange(preset: RangePreset, customFrom?: string, customTo?: string) {
  const now = new Date();
  let from: Date;
  let to: Date = now;
  switch (preset) {
    case "7d":
      from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "90d":
      from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case "thisMonth":
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "lastMonth":
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      to = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      break;
    case "thisYear":
      from = new Date(now.getFullYear(), 0, 1);
      break;
    case "custom":
      from = customFrom ? new Date(customFrom) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      to = customTo ? new Date(customTo + "T23:59:59") : now;
      break;
    default:
      from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
  return { from, to };
}

export default function EstadisticasPage() {
  const [preset, setPreset] = useState<RangePreset>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [granularity, setGranularity] = useState<Granularity>("dia");
  const [productSort, setProductSort] = useState<ProductSortKey>("total");
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { from, to } = computeRange(preset, customFrom, customTo);
      const params = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
      });
      const res = await fetch(`/api/admin/analytics/overview?${params}`);
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Error al cargar estadísticas");
        setData(null);
      } else {
        setData(body as Overview);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setLoading(false);
    }
  }, [preset, customFrom, customTo]);

  useEffect(() => {
    if (preset !== "custom" || (customFrom && customTo)) {
      fetchData();
    }
  }, [fetchData, preset, customFrom, customTo]);

  const series = data?.timeseries[granularity] ?? [];
  const sortedProducts = useMemo(() => {
    if (!data) return [];
    const arr = [...data.topProducts];
    arr.sort((a, b) => {
      if (productSort === "name") return a.name.localeCompare(b.name);
      return (b[productSort] as number) - (a[productSort] as number);
    });
    return arr;
  }, [data, productSort]);

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Estadísticas</h1>
          <p className="text-gray-500 mt-1">KPIs, tendencias y rankings</p>
        </div>
        <DateRangeSelector
          preset={preset}
          setPreset={setPreset}
          customFrom={customFrom}
          customTo={customTo}
          setCustomFrom={setCustomFrom}
          setCustomTo={setCustomTo}
        />
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
          {error}
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <Kpi
          label="Ventas"
          value={data ? formatMoney(data.kpis.total) : "—"}
          sub={data ? `${data.kpis.count} pedidos` : undefined}
          icon={<DollarSignIcon size={16} />}
          loading={loading}
        />
        <Kpi
          label="Margen"
          value={data ? formatMoney(data.kpis.margin) : "—"}
          sub={
            data && data.kpis.total > 0
              ? `${((data.kpis.margin / data.kpis.total) * 100).toFixed(1)}% del total`
              : undefined
          }
          icon={<PercentIcon size={16} />}
          loading={loading}
        />
        <Kpi
          label="Ticket promedio"
          value={data ? formatMoney(data.kpis.avgTicket) : "—"}
          icon={<TrendingUpIcon size={16} />}
          loading={loading}
        />
        <Kpi
          label="Clientes"
          value={data ? data.kpis.uniqueCustomers.toString() : "—"}
          sub="únicos"
          icon={<UsersIcon size={16} />}
          loading={loading}
        />
        <Kpi
          label="Productos"
          value={data ? data.kpis.uniqueProducts.toString() : "—"}
          sub="vendidos"
          icon={<PackageIcon size={16} />}
          loading={loading}
        />
      </div>

      {/* Line chart */}
      <section className="bg-white rounded-xl ring-1 ring-foreground/10 p-5 mb-6">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <div>
            <h2 className="font-semibold text-gray-900">Ventas en el tiempo</h2>
            <p className="text-xs text-gray-500">Monto facturado ($)</p>
          </div>
          <div className="flex gap-1 rounded-lg border border-gray-200 p-0.5">
            {(["hora", "dia", "semana", "mes"] as Granularity[]).map((g) => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={`px-3 py-1 rounded text-xs font-medium transition ${
                  granularity === g
                    ? "bg-orange-500 text-white"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {g === "hora"
                  ? "Hora"
                  : g === "dia"
                  ? "Día"
                  : g === "semana"
                  ? "Semana"
                  : "Mes"}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="h-64 bg-gray-100 rounded animate-pulse" />
        ) : series.length === 0 ? (
          <p className="text-sm text-gray-400 py-16 text-center">Sin datos en este rango</p>
        ) : (
          <LineChart data={series} />
        )}
      </section>

      {/* Top products */}
      <section className="bg-white rounded-xl ring-1 ring-foreground/10 overflow-hidden mb-6">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Top 10 productos</h2>
          <p className="text-xs text-gray-500">Más vendidos en el período</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-2.5 text-left font-medium text-gray-600 w-12">#</th>
                <SortableTh
                  active={productSort === "name"}
                  onClick={() => setProductSort("name")}
                >
                  Producto
                </SortableTh>
                <th className="px-4 py-2.5 text-left font-medium text-gray-600">Código</th>
                <SortableTh
                  active={productSort === "qty"}
                  onClick={() => setProductSort("qty")}
                  align="right"
                >
                  Cantidad
                </SortableTh>
                <SortableTh
                  active={productSort === "total"}
                  onClick={() => setProductSort("total")}
                  align="right"
                >
                  Total
                </SortableTh>
                <SortableTh
                  active={productSort === "margin"}
                  onClick={() => setProductSort("margin")}
                  align="right"
                >
                  Margen
                </SortableTh>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-2.5">
                        <div className="h-3.5 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : sortedProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                    Sin productos vendidos
                  </td>
                </tr>
              ) : (
                sortedProducts.map((p, i) => (
                  <tr key={`${p.code ?? p.name}-${i}`} className="border-b border-gray-50">
                    <td className="px-4 py-2.5 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-900">{p.name}</td>
                    <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">
                      {p.code ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{p.qty}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-900">
                      {formatMoney(p.total)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-medium ${
                        p.margin >= 0 ? "text-green-700" : "text-red-600"
                      }`}
                    >
                      {formatMoney(p.margin)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Top customers */}
      <section className="bg-white rounded-xl ring-1 ring-foreground/10 overflow-hidden mb-6">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Top 10 clientes</h2>
          <p className="text-xs text-gray-500">Mayores compradores del período</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-2.5 text-left font-medium text-gray-600 w-12">#</th>
                <th className="px-4 py-2.5 text-left font-medium text-gray-600">Cliente</th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-600">Compras</th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-600">Total</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 4 }).map((_, j) => (
                      <td key={j} className="px-4 py-2.5">
                        <div className="h-3.5 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : !data || data.topCustomers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-gray-400">
                    Sin clientes
                  </td>
                </tr>
              ) : (
                data.topCustomers.map((c, i) => (
                  <tr key={`${c.name}-${i}`} className="border-b border-gray-50">
                    <td className="px-4 py-2.5 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-900">{c.name}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{c.orders}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-900">
                      {formatMoney(c.total)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Sellers */}
      <section className="bg-white rounded-xl ring-1 ring-foreground/10 overflow-hidden mb-6">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Ventas por vendedor</h2>
          <p className="text-xs text-gray-500">Con comisión calculada</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-2.5 text-left font-medium text-gray-600">Vendedor</th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-600">Ventas</th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-600">Total</th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-600">
                  Ticket prom.
                </th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-600">% com.</th>
                <th className="px-4 py-2.5 text-right font-medium text-gray-600">Comisión</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-2.5">
                        <div className="h-3.5 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : !data || data.sellers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                    Sin ventas asignadas a vendedor
                  </td>
                </tr>
              ) : (
                data.sellers.map((s) => (
                  <tr key={s.id} className="border-b border-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{s.name}</td>
                    <td className="px-4 py-2.5 text-right text-gray-700">{s.orders}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-900">
                      {formatMoney(s.total)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-700">
                      {formatMoney(s.avgTicket)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-gray-500">
                      {s.commissionRate > 0 ? `${s.commissionRate.toFixed(2)}%` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-orange-600">
                      {formatMoney(s.commission)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Channel + payment method */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-white rounded-xl ring-1 ring-foreground/10 p-5">
          <div className="flex items-center gap-2 mb-4">
            <ShoppingBagIcon size={16} className="text-gray-400" />
            <h2 className="font-semibold text-gray-900">Ventas por canal</h2>
          </div>
          {loading ? (
            <div className="h-48 bg-gray-100 rounded animate-pulse" />
          ) : !data || data.byChannel.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">Sin datos</p>
          ) : (
            <DonutWithLegend
              items={data.byChannel.map((c) => ({
                label: CHANNEL_LABEL[c.channel] ?? c.channel,
                value: c.total,
                count: c.count,
              }))}
            />
          )}
        </section>

        <section className="bg-white rounded-xl ring-1 ring-foreground/10 p-5">
          <div className="flex items-center gap-2 mb-4">
            <DollarSignIcon size={16} className="text-gray-400" />
            <h2 className="font-semibold text-gray-900">Ventas por método de pago</h2>
          </div>
          {loading ? (
            <div className="h-48 bg-gray-100 rounded animate-pulse" />
          ) : !data || data.byPaymentMethod.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">Sin pagos registrados</p>
          ) : (
            <BarList
              items={data.byPaymentMethod.map((m) => ({
                label: METHOD_LABEL[m.method] ?? m.method,
                value: m.total,
                count: m.count,
              }))}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function DateRangeSelector({
  preset,
  setPreset,
  customFrom,
  customTo,
  setCustomFrom,
  setCustomTo,
}: {
  preset: RangePreset;
  setPreset: (p: RangePreset) => void;
  customFrom: string;
  customTo: string;
  setCustomFrom: (v: string) => void;
  setCustomTo: (v: string) => void;
}) {
  const presets: { key: RangePreset; label: string }[] = [
    { key: "7d", label: "7 días" },
    { key: "30d", label: "30 días" },
    { key: "90d", label: "90 días" },
    { key: "thisMonth", label: "Este mes" },
    { key: "lastMonth", label: "Mes anterior" },
    { key: "thisYear", label: "Este año" },
    { key: "custom", label: "Personalizado" },
  ];

  return (
    <div className="flex flex-col gap-2 items-end">
      <div className="flex gap-1 rounded-lg border border-gray-200 p-0.5 flex-wrap">
        {presets.map((p) => (
          <button
            key={p.key}
            onClick={() => setPreset(p.key)}
            className={`px-3 py-1.5 rounded text-xs font-medium transition ${
              preset === p.key
                ? "bg-orange-500 text-white"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === "custom" && (
        <div className="flex items-center gap-2">
          <CalendarIcon size={14} className="text-gray-400" />
          <Input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="w-36 h-8 text-xs"
          />
          <span className="text-xs text-gray-400">a</span>
          <Input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="w-36 h-8 text-xs"
          />
        </div>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  icon,
  loading,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <div className="rounded-xl bg-white ring-1 ring-foreground/10 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
        {icon && <span className="text-gray-400">{icon}</span>}
      </div>
      {loading ? (
        <div className="h-7 mt-1.5 bg-gray-100 rounded animate-pulse" />
      ) : (
        <p className="text-2xl font-bold mt-1 text-gray-900">{value}</p>
      )}
      {sub && !loading && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function SortableTh({
  children,
  active,
  onClick,
  align = "left",
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <th className={`px-4 py-2.5 font-medium text-${align}`}>
      <button
        onClick={onClick}
        className={`inline-flex items-center gap-1 transition ${
          active ? "text-orange-600" : "text-gray-600 hover:text-gray-900"
        }`}
      >
        {children}
        {active && <span className="text-xs">▼</span>}
      </button>
    </th>
  );
}

function LineChart({ data }: { data: SeriesPoint[] }) {
  const width = 900;
  const height = 260;
  const padding = { top: 20, right: 20, bottom: 32, left: 60 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const maxV = Math.max(...data.map((d) => d.value), 1);
  const stepX = data.length > 1 ? innerW / (data.length - 1) : innerW;

  const points = data.map((d, i) => {
    const x = padding.left + i * stepX;
    const y = padding.top + innerH - (d.value / maxV) * innerH;
    return { x, y, ...d };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath =
    linePath +
    ` L${padding.left + innerW},${padding.top + innerH}` +
    ` L${padding.left},${padding.top + innerH} Z`;

  const ySteps = 4;
  const yTicks = Array.from({ length: ySteps + 1 }).map((_, i) => {
    const v = (maxV / ySteps) * i;
    const y = padding.top + innerH - (v / maxV) * innerH;
    return { v, y };
  });

  const maxLabels = 10;
  const labelStep = Math.max(1, Math.ceil(data.length / maxLabels));

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ minWidth: data.length > 15 ? 700 : undefined }}
      >
        {/* grid + y axis */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={padding.left}
              x2={padding.left + innerW}
              y1={t.y}
              y2={t.y}
              stroke="#e5e7eb"
              strokeDasharray="2,3"
            />
            <text
              x={padding.left - 8}
              y={t.y + 3}
              textAnchor="end"
              fontSize="10"
              fill="#9ca3af"
            >
              {formatShortMoney(t.v)}
            </text>
          </g>
        ))}

        {/* area */}
        <path d={areaPath} fill="#f97316" fillOpacity="0.08" />
        <path d={linePath} fill="none" stroke="#f97316" strokeWidth="2" />

        {/* points */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="3" fill="#f97316" />
            <title>{`${p.label}: ${formatMoney(p.value)}`}</title>
          </g>
        ))}

        {/* x labels */}
        {points.map((p, i) =>
          i % labelStep === 0 ? (
            <text
              key={i}
              x={p.x}
              y={height - 10}
              textAnchor="middle"
              fontSize="10"
              fill="#6b7280"
            >
              {shortenLabel(p.label)}
            </text>
          ) : null
        )}
      </svg>
    </div>
  );
}

function DonutWithLegend({
  items,
}: {
  items: { label: string; value: number; count: number }[];
}) {
  const total = items.reduce((s, i) => s + i.value, 0);
  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const r = 60;
  const rInner = 38;

  let accum = 0;
  const segments = items.map((it, idx) => {
    const frac = total > 0 ? it.value / total : 0;
    const startAngle = accum * 2 * Math.PI - Math.PI / 2;
    accum += frac;
    const endAngle = accum * 2 * Math.PI - Math.PI / 2;
    const large = frac > 0.5 ? 1 : 0;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const xi2 = cx + rInner * Math.cos(endAngle);
    const yi2 = cy + rInner * Math.sin(endAngle);
    const xi1 = cx + rInner * Math.cos(startAngle);
    const yi1 = cy + rInner * Math.sin(startAngle);
    const path =
      frac >= 0.999
        ? `M${cx - r},${cy} A${r},${r} 0 1 1 ${cx + r},${cy} A${r},${r} 0 1 1 ${cx - r},${cy} M${cx - rInner},${cy} A${rInner},${rInner} 0 1 0 ${cx + rInner},${cy} A${rInner},${rInner} 0 1 0 ${cx - rInner},${cy} Z`
        : `M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} L${xi2},${yi2} A${rInner},${rInner} 0 ${large} 0 ${xi1},${yi1} Z`;
    return {
      path,
      color: DONUT_COLORS[idx % DONUT_COLORS.length],
      ...it,
      frac,
    };
  });

  return (
    <div className="flex items-center gap-5 flex-wrap">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        {segments.map((s, i) => (
          <path key={i} d={s.path} fill={s.color}>
            <title>{`${s.label}: ${formatMoney(s.value)}`}</title>
          </path>
        ))}
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          fontSize="10"
          fill="#9ca3af"
        >
          Total
        </text>
        <text
          x={cx}
          y={cy + 10}
          textAnchor="middle"
          fontSize="12"
          fontWeight="600"
          fill="#111827"
        >
          {formatShortMoney(total)}
        </text>
      </svg>
      <div className="flex-1 min-w-0 space-y-2">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span
              className="inline-block w-3 h-3 rounded-sm shrink-0"
              style={{ backgroundColor: s.color }}
            />
            <span className="flex-1 truncate text-gray-700">{s.label}</span>
            <span className="text-gray-500 tabular-nums">
              {formatMoney(s.value)}
            </span>
            <span className="text-xs text-gray-400 w-10 text-right tabular-nums">
              {(s.frac * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BarList({
  items,
}: {
  items: { label: string; value: number; count: number }[];
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i}>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-gray-700">{it.label}</span>
            <span className="text-gray-500 tabular-nums">
              {formatMoney(it.value)}{" "}
              <span className="text-xs text-gray-400">({it.count})</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-orange-500"
              style={{ width: `${(it.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function formatShortMoney(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${Math.round(v)}`;
}

function shortenLabel(label: string): string {
  // If ISO date (YYYY-MM-DD), show DD/MM
  if (/^\d{4}-\d{2}-\d{2}$/.test(label)) {
    return label.slice(8, 10) + "/" + label.slice(5, 7);
  }
  // If YYYY-MM
  if (/^\d{4}-\d{2}$/.test(label)) {
    return label.slice(5, 7) + "/" + label.slice(2, 4);
  }
  return label;
}
