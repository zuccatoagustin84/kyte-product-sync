import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/rbac-server";
import { hasPermission } from "@/lib/rbac";
import { getCurrentTenant } from "@/lib/tenant";

type TransactionRow = {
  id: string;
  created_at: string;
  total: number;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  seller_user_id: string | null;
  seller_name: string | null;
  channel: string;
  status: string;
  payment_status: string;
  items_count: number;
  paid_amount: number;
  order_number: number | null;
};

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ["admin", "operador", "superadmin"]);
  if (auth instanceof Response) return auth;
  const { id: companyId } = await getCurrentTenant();

  if (!hasPermission(auth.role, "transactions")) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const sellerId = url.searchParams.get("seller_id");
  const channel = url.searchParams.get("channel");
  const paymentStatus = url.searchParams.get("payment_status");
  const q = url.searchParams.get("q")?.trim().toLowerCase() ?? "";
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 200), 1000);

  const supabase = createServiceClient();

  // Enforce per-user visibility for operadores without the granular permission
  let effectiveSellerId: string | null = sellerId;
  if (auth.role === "operador") {
    const { data: perms } = await supabase
      .from("user_permissions")
      .select("view_other_users_transactions")
      .eq("user_id", auth.userId)
      .maybeSingle();
    if (!perms?.view_other_users_transactions) {
      effectiveSellerId = auth.userId;
    }
  }

  // Main list query
  let query = supabase
    .from("orders")
    .select(
      "id, created_at, total, customer_id, customer_name, customer_phone, seller_user_id, channel, status, payment_status, order_number"
    )
    .eq("company_id", companyId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", to);
  if (effectiveSellerId) query = query.eq("seller_user_id", effectiveSellerId);
  if (channel && channel !== "all") query = query.eq("channel", channel);
  if (paymentStatus && paymentStatus !== "all") query = query.eq("payment_status", paymentStatus);
  if (q) {
    const asNumber = Number(q);
    if (Number.isFinite(asNumber) && !Number.isNaN(asNumber) && q !== "") {
      query = query.or(`customer_name.ilike.%${q}%,order_number.eq.${asNumber}`);
    } else {
      query = query.ilike("customer_name", `%${q}%`);
    }
  }

  const { data: orders, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const orderIds = (orders ?? []).map((o) => o.id);
  const sellerIds = Array.from(
    new Set((orders ?? []).map((o) => o.seller_user_id).filter(Boolean) as string[])
  );

  // Payments sums per order
  const paidByOrder: Record<string, number> = {};
  if (orderIds.length > 0) {
    const { data: pays } = await supabase
      .from("order_payments")
      .select("order_id, amount")
      .eq("company_id", companyId)
      .in("order_id", orderIds);
    for (const p of pays ?? []) {
      paidByOrder[p.order_id] = (paidByOrder[p.order_id] ?? 0) + Number(p.amount ?? 0);
    }
  }

  // Items counts per order
  const itemsByOrder: Record<string, number> = {};
  if (orderIds.length > 0) {
    const { data: items } = await supabase
      .from("order_items")
      .select("order_id")
      .eq("company_id", companyId)
      .in("order_id", orderIds);
    for (const it of items ?? []) {
      itemsByOrder[it.order_id] = (itemsByOrder[it.order_id] ?? 0) + 1;
    }
  }

  // Seller names
  const sellerNameById: Record<string, string> = {};
  if (sellerIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("company_id", companyId)
      .in("id", sellerIds);
    for (const p of profiles ?? []) {
      sellerNameById[p.id] = p.full_name ?? "";
    }
  }

  const rows: TransactionRow[] = (orders ?? []).map((o) => ({
    id: o.id,
    created_at: o.created_at,
    total: Number(o.total ?? 0),
    customer_id: o.customer_id,
    customer_name: o.customer_name,
    customer_phone: o.customer_phone ?? null,
    seller_user_id: o.seller_user_id,
    seller_name: o.seller_user_id ? sellerNameById[o.seller_user_id] ?? null : null,
    channel: o.channel ?? "catalog",
    status: o.status,
    payment_status: o.payment_status ?? "pending",
    items_count: itemsByOrder[o.id] ?? 0,
    paid_amount: paidByOrder[o.id] ?? 0,
    order_number: o.order_number,
  }));

  // KPIs — independent of filters (but respect seller scope)
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const buildKpi = (since?: string, pendingOnly = false) => {
    let k = supabase
      .from("orders")
      .select("total", { count: "exact" })
      .eq("company_id", companyId)
      .neq("status", "cancelled");
    if (since) k = k.gte("created_at", since);
    if (pendingOnly) k = k.neq("payment_status", "paid");
    if (effectiveSellerId) k = k.eq("seller_user_id", effectiveSellerId);
    return k;
  };

  const [todayRes, weekRes, pendingRes] = await Promise.all([
    buildKpi(todayStart),
    buildKpi(weekStart),
    buildKpi(undefined, true),
  ]);

  const todayList = todayRes.data ?? [];
  const weekList = weekRes.data ?? [];
  const pendingList = pendingRes.data ?? [];

  const todayTotal = todayList.reduce((s, o) => s + Number(o.total ?? 0), 0);
  const weekTotal = weekList.reduce((s, o) => s + Number(o.total ?? 0), 0);
  const avgTicket = weekList.length > 0 ? weekTotal / weekList.length : 0;
  const pendingTotal = pendingList.reduce((s, o) => s + Number(o.total ?? 0), 0);

  return Response.json({
    kpis: {
      today: { count: todayList.length, total: todayTotal },
      week: { count: weekList.length, total: weekTotal },
      avgTicket,
      pendingPayments: { count: pendingList.length, total: pendingTotal },
    },
    rows,
  });
}
