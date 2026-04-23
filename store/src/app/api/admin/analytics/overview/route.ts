import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/rbac-server";

type OrderRow = {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  seller_user_id: string | null;
  channel: string | null;
  subtotal: number | null;
  discount_total: number | null;
  total: number;
  status: string;
  payment_status: string | null;
  created_at: string;
};

type OrderItemRow = {
  order_id: string;
  product_id: string | null;
  product_name: string;
  product_code: string | null;
  unit_price: number;
  quantity: number;
  cost_snapshot: number | null;
  subtotal: number;
};

type OrderPaymentRow = {
  order_id: string;
  method: string;
  amount: number;
};

type ProfileRow = { id: string; full_name: string | null };
type UserPermRow = { user_id: string; commission_rate: number | null };

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ["admin"]);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  // Default: last 30 days
  const now = new Date();
  const to = toParam ? new Date(toParam) : now;
  const from = fromParam
    ? new Date(fromParam)
    : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const supabase = createServiceClient();

  // Fetch all non-cancelled orders in range
  const { data: ordersData, error: ordersErr } = await supabase
    .from("orders")
    .select(
      "id, customer_id, customer_name, seller_user_id, channel, subtotal, discount_total, total, status, payment_status, created_at"
    )
    .neq("status", "cancelled")
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString())
    .order("created_at", { ascending: true });

  if (ordersErr) {
    return Response.json({ error: ordersErr.message }, { status: 500 });
  }

  const orders = (ordersData ?? []) as OrderRow[];
  const orderIds = orders.map((o) => o.id);

  // Fetch items for those orders
  let items: OrderItemRow[] = [];
  if (orderIds.length > 0) {
    const { data: itemsData, error: itemsErr } = await supabase
      .from("order_items")
      .select(
        "order_id, product_id, product_name, product_code, unit_price, quantity, cost_snapshot, subtotal"
      )
      .in("order_id", orderIds);
    if (itemsErr) {
      return Response.json({ error: itemsErr.message }, { status: 500 });
    }
    items = (itemsData ?? []) as OrderItemRow[];
  }

  // Fetch payments for those orders
  let payments: OrderPaymentRow[] = [];
  if (orderIds.length > 0) {
    const { data: paymentsData } = await supabase
      .from("order_payments")
      .select("order_id, method, amount")
      .in("order_id", orderIds);
    payments = (paymentsData ?? []) as OrderPaymentRow[];
  }

  // ---------- KPIs ----------
  const total = orders.reduce((s, o) => s + Number(o.total || 0), 0);
  const count = orders.length;

  let subtotalSum = 0;
  let costSum = 0;
  for (const it of items) {
    subtotalSum += Number(it.subtotal ?? it.unit_price * it.quantity);
    if (it.cost_snapshot != null) {
      costSum += Number(it.cost_snapshot) * Number(it.quantity);
    }
  }
  const margin = subtotalSum - costSum;
  const avgTicket = count > 0 ? total / count : 0;

  const uniqueCustomersSet = new Set<string>();
  for (const o of orders) {
    const key = o.customer_id ?? (o.customer_name ? `n:${o.customer_name}` : null);
    if (key) uniqueCustomersSet.add(key);
  }
  const uniqueCustomers = uniqueCustomersSet.size;

  const uniqueProductsSet = new Set<string>();
  for (const it of items) {
    uniqueProductsSet.add(it.product_id ?? `n:${it.product_name}`);
  }
  const uniqueProducts = uniqueProductsSet.size;

  // ---------- Timeseries ----------
  const tsHora = new Array<number>(24).fill(0);
  const diaMap = new Map<string, number>();
  const semanaMap = new Map<string, number>();
  const mesMap = new Map<string, number>();

  for (const o of orders) {
    const d = new Date(o.created_at);
    const amt = Number(o.total || 0);
    tsHora[d.getHours()] += amt;

    const dayKey = d.toISOString().slice(0, 10);
    diaMap.set(dayKey, (diaMap.get(dayKey) ?? 0) + amt);

    // ISO week start (Monday)
    const wd = new Date(d);
    const dow = (wd.getDay() + 6) % 7; // 0 = Monday
    wd.setDate(wd.getDate() - dow);
    const weekKey = wd.toISOString().slice(0, 10);
    semanaMap.set(weekKey, (semanaMap.get(weekKey) ?? 0) + amt);

    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    mesMap.set(monthKey, (mesMap.get(monthKey) ?? 0) + amt);
  }

  const hora = tsHora.map((v, i) => ({ label: `${String(i).padStart(2, "0")}:00`, value: v }));
  const dia = [...diaMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([label, value]) => ({ label, value }));
  const semana = [...semanaMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([label, value]) => ({ label, value }));
  const mes = [...mesMap.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([label, value]) => ({ label, value }));

  // ---------- Top products ----------
  type ProdAgg = {
    key: string;
    name: string;
    code: string | null;
    qty: number;
    total: number;
    margin: number;
  };
  const prodMap = new Map<string, ProdAgg>();
  for (const it of items) {
    const key = it.product_id ?? `n:${it.product_name}`;
    const itemSubtotal = Number(it.subtotal ?? it.unit_price * it.quantity);
    const itemCost = it.cost_snapshot != null ? Number(it.cost_snapshot) * Number(it.quantity) : 0;
    const itemMargin = itemSubtotal - itemCost;
    const existing = prodMap.get(key);
    if (existing) {
      existing.qty += Number(it.quantity);
      existing.total += itemSubtotal;
      existing.margin += itemMargin;
    } else {
      prodMap.set(key, {
        key,
        name: it.product_name,
        code: it.product_code,
        qty: Number(it.quantity),
        total: itemSubtotal,
        margin: itemMargin,
      });
    }
  }
  const topProducts = [...prodMap.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
    .map(({ name, code, qty, total, margin }) => ({ name, code, qty, total, margin }));

  // ---------- Top customers ----------
  type CustAgg = { key: string; name: string; orders: number; total: number };
  const custMap = new Map<string, CustAgg>();
  for (const o of orders) {
    const key = o.customer_id ?? (o.customer_name ? `n:${o.customer_name}` : "n:anónimo");
    const name = o.customer_name ?? "Sin nombre";
    const existing = custMap.get(key);
    const amt = Number(o.total || 0);
    if (existing) {
      existing.orders += 1;
      existing.total += amt;
    } else {
      custMap.set(key, { key, name, orders: 1, total: amt });
    }
  }
  const topCustomers = [...custMap.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
    .map(({ name, orders: o, total: t }) => ({ name, orders: o, total: t }));

  // ---------- Sellers ----------
  type SellerAgg = { id: string; orders: number; total: number };
  const sellerMap = new Map<string, SellerAgg>();
  for (const o of orders) {
    if (!o.seller_user_id) continue;
    const existing = sellerMap.get(o.seller_user_id);
    const amt = Number(o.total || 0);
    if (existing) {
      existing.orders += 1;
      existing.total += amt;
    } else {
      sellerMap.set(o.seller_user_id, { id: o.seller_user_id, orders: 1, total: amt });
    }
  }

  let profiles: ProfileRow[] = [];
  let perms: UserPermRow[] = [];
  const sellerIds = [...sellerMap.keys()];
  if (sellerIds.length > 0) {
    const [{ data: profs }, { data: up }] = await Promise.all([
      supabase.from("profiles").select("id, full_name").in("id", sellerIds),
      supabase.from("user_permissions").select("user_id, commission_rate").in("user_id", sellerIds),
    ]);
    profiles = (profs ?? []) as ProfileRow[];
    perms = (up ?? []) as UserPermRow[];
  }
  const nameById = new Map(profiles.map((p) => [p.id, p.full_name ?? "Sin nombre"]));
  const rateById = new Map(perms.map((p) => [p.user_id, Number(p.commission_rate ?? 0)]));

  const sellers = [...sellerMap.values()]
    .map((s) => {
      const commissionRate = rateById.get(s.id) ?? 0;
      return {
        id: s.id,
        name: nameById.get(s.id) ?? "Sin nombre",
        orders: s.orders,
        total: s.total,
        avgTicket: s.orders > 0 ? s.total / s.orders : 0,
        commissionRate,
        commission: (s.total * commissionRate) / 100,
      };
    })
    .sort((a, b) => b.total - a.total);

  // ---------- By channel ----------
  type ChannelAgg = { channel: string; total: number; count: number };
  const channelMap = new Map<string, ChannelAgg>();
  for (const o of orders) {
    const ch = o.channel ?? "manual";
    const existing = channelMap.get(ch);
    const amt = Number(o.total || 0);
    if (existing) {
      existing.total += amt;
      existing.count += 1;
    } else {
      channelMap.set(ch, { channel: ch, total: amt, count: 1 });
    }
  }
  const byChannel = [...channelMap.values()].sort((a, b) => b.total - a.total);

  // ---------- By payment method ----------
  type MethodAgg = { method: string; total: number; count: number };
  const methodMap = new Map<string, MethodAgg>();
  for (const p of payments) {
    const existing = methodMap.get(p.method);
    const amt = Number(p.amount || 0);
    if (existing) {
      existing.total += amt;
      existing.count += 1;
    } else {
      methodMap.set(p.method, { method: p.method, total: amt, count: 1 });
    }
  }
  const byPaymentMethod = [...methodMap.values()].sort((a, b) => b.total - a.total);

  return Response.json({
    kpis: { total, count, margin, avgTicket, uniqueCustomers, uniqueProducts },
    timeseries: { hora, dia, semana, mes },
    topProducts,
    topCustomers,
    sellers,
    byChannel,
    byPaymentMethod,
    range: { from: from.toISOString(), to: to.toISOString() },
  });
}
