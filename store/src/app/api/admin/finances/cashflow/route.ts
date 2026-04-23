import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { requireRole } from "@/lib/rbac-server";

// Aggregate daily cashflow in JS — the `cash_flow_daily` view lumps sales and
// customer payments together as "inflow"; we want ingresos from orders +
// customer payments, egresos from paid expenses, and balance.
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ["admin"]);
  if (auth instanceof Response) return auth;

  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to) {
    return Response.json(
      { error: "Parámetros from/to requeridos" },
      { status: 400 }
    );
  }

  const supabase = createServiceClient();

  const fromIso = `${from}T00:00:00Z`;
  const toIso = `${to}T23:59:59Z`;

  const [ordersRes, expensesRes] = await Promise.all([
    supabase
      .from("orders")
      .select("created_at, total, payment_status, status")
      .eq("payment_status", "paid")
      .neq("status", "cancelled")
      .gte("created_at", fromIso)
      .lte("created_at", toIso),
    supabase
      .from("expenses")
      .select("paid_at, amount, status")
      .not("paid_at", "is", null)
      .neq("status", "cancelled")
      .gte("paid_at", fromIso)
      .lte("paid_at", toIso),
  ]);

  if (ordersRes.error)
    return Response.json({ error: ordersRes.error.message }, { status: 500 });
  if (expensesRes.error)
    return Response.json({ error: expensesRes.error.message }, { status: 500 });

  const byDay = new Map<string, { income: number; expense: number }>();

  const add = (day: string, key: "income" | "expense", amount: number) => {
    const cur = byDay.get(day) ?? { income: 0, expense: 0 };
    cur[key] += amount;
    byDay.set(day, cur);
  };

  for (const o of ordersRes.data ?? []) {
    const day = String(o.created_at).slice(0, 10);
    add(day, "income", Number(o.total) || 0);
  }
  for (const e of expensesRes.data ?? []) {
    const day = String(e.paid_at).slice(0, 10);
    add(day, "expense", Number(e.amount) || 0);
  }

  // Fill missing days with zeros so the chart has a continuous axis
  const days: string[] = [];
  const start = new Date(from);
  const end = new Date(to);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    days.push(d.toISOString().slice(0, 10));
  }

  const series = days.map((day) => {
    const { income, expense } = byDay.get(day) ?? { income: 0, expense: 0 };
    return { date: day, income, expense, balance: income - expense };
  });

  const totals = series.reduce(
    (acc, r) => {
      acc.income += r.income;
      acc.expense += r.expense;
      acc.balance += r.balance;
      return acc;
    },
    { income: 0, expense: 0, balance: 0 }
  );

  return Response.json({ series, totals });
}
