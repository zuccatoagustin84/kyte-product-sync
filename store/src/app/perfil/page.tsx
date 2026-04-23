import { redirect } from "next/navigation";
import Link from "next/link";
import { getUser, createSupabaseServer } from "@/lib/supabase-server";
import { createServiceClient } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import SignOutButton from "./SignOutButton";
import ProfileEditForm from "./ProfileEditForm";
import type { Customer, CustomerLedgerEntry } from "@/lib/types";

interface Order {
  id: string;
  created_at: string;
  total: number;
  status: string;
}

interface Profile {
  id: string;
  full_name: string | null;
  company: string | null;
  phone: string | null;
  role: string;
}

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
    month: "short",
    year: "numeric",
  }).format(new Date(dateStr));
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
  }).format(amount);
}

function ledgerLabel(t: CustomerLedgerEntry["entry_type"]): string {
  const map: Record<CustomerLedgerEntry["entry_type"], string> = {
    sale: "Compra a crédito",
    payment: "Pago registrado",
    credit_add: "Crédito a favor",
    credit_sub: "Crédito consumido",
    refund: "Reembolso",
    adjust: "Ajuste",
  };
  return map[t];
}

export default async function PerfilPage() {
  const user = await getUser();

  if (!user) {
    redirect("/login?next=/perfil");
  }

  const supabase = await createSupabaseServer();

  // Fetch profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, company, phone, role")
    .eq("id", user.id)
    .single<Profile>();

  // Fetch orders
  const { data: orders } = await supabase
    .from("orders")
    .select("id, created_at, total, status")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  // Fetch customer linkeado + ledger (via service, bypass RLS)
  const service = createServiceClient();
  const { data: linkedCustomer } = await service
    .from("customers")
    .select("*")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle<Customer>();

  let ledger: CustomerLedgerEntry[] = [];
  if (linkedCustomer) {
    const { data: entries } = await service
      .from("customer_ledger")
      .select("*")
      .eq("customer_id", linkedCustomer.id)
      .order("created_at", { ascending: false })
      .limit(10);
    ledger = (entries ?? []) as CustomerLedgerEntry[];
  }

  const displayName =
    profile?.full_name ?? user.email?.split("@")[0] ?? "Usuario";
  const initials = displayName
    .split(" ")
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header
        className="sticky top-0 z-50 h-14 flex items-center px-4 shadow-md"
        style={{ backgroundColor: "var(--navy)" }}
      >
        <span
          className="text-lg font-extrabold tracking-wide"
          style={{ color: "var(--brand)" }}
        >
          MP TOOLS
        </span>
        <span className="text-xs text-white/70 font-medium ml-1.5">
          Mayorista
        </span>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
        {/* Profile card */}
        <section className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-100 p-6">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div
              className="size-14 rounded-full flex items-center justify-center text-white text-xl font-bold shrink-0"
              style={{ backgroundColor: "var(--brand)" }}
            >
              {initials || "?"}
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-gray-900 truncate">
                {displayName}
              </h1>
              <p className="text-sm text-gray-500 truncate">{user.email}</p>
              {profile?.role === "admin" && (
                <Badge variant="default" className="mt-1">
                  Admin
                </Badge>
              )}
            </div>
          </div>

          <Separator className="my-5" />

          <ProfileEditForm
            userId={user.id}
            initialName={profile?.full_name ?? null}
            initialCompany={profile?.company ?? null}
            initialPhone={profile?.phone ?? null}
          />
        </section>

        {/* Mi cuenta (saldo + ledger) — sólo si hay customer linkeado */}
        {linkedCustomer && (
          <section className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-100 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900">Mi cuenta</h2>
              {linkedCustomer.allow_pay_later && (
                <Badge variant="secondary">Cuenta corriente</Badge>
              )}
            </div>

            <div className="rounded-xl bg-gray-50 p-4 mb-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider">
                Saldo actual
              </p>
              <p
                className={`text-2xl font-bold mt-1 ${
                  Number(linkedCustomer.balance) < 0
                    ? "text-red-600"
                    : Number(linkedCustomer.balance) > 0
                    ? "text-green-700"
                    : "text-gray-700"
                }`}
              >
                {formatCurrency(Number(linkedCustomer.balance))}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {Number(linkedCustomer.balance) < 0
                  ? "Debe"
                  : Number(linkedCustomer.balance) > 0
                  ? "A favor"
                  : "Sin saldo"}
                {linkedCustomer.credit_limit &&
                  ` · Límite ${formatCurrency(Number(linkedCustomer.credit_limit))}`}
              </p>
            </div>

            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Últimos movimientos
            </h3>
            {ledger.length === 0 ? (
              <p className="text-sm text-gray-400">Sin movimientos</p>
            ) : (
              <ul className="space-y-2">
                {ledger.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between text-sm border-b border-gray-100 pb-2 last:border-0"
                  >
                    <div>
                      <p className="font-medium text-gray-800">
                        {ledgerLabel(e.entry_type)}
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatDate(e.created_at)}
                        {e.payment_method && ` · ${e.payment_method}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-semibold ${
                          e.amount > 0 ? "text-green-700" : "text-red-600"
                        }`}
                      >
                        {e.amount > 0 ? "+" : "−"}
                        {formatCurrency(Math.abs(Number(e.amount)))}
                      </p>
                      <p className="text-xs text-gray-400">
                        Saldo: {formatCurrency(Number(e.balance_after))}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Order history */}
        <section className="bg-white rounded-2xl shadow-sm ring-1 ring-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-4">
            Historial de pedidos
          </h2>

          {!orders || orders.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              Todavía no realizaste ningún pedido.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {(orders as Order[]).map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/pedido/${order.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3 hover:bg-gray-100 transition-colors group"
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs text-gray-400">
                        {formatDate(order.created_at)}
                      </span>
                      <span className="text-sm font-medium text-gray-800">
                        {formatCurrency(order.total)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={statusVariant(order.status)}>
                        {statusLabel(order.status)}
                      </Badge>
                      <svg
                        className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Sign out */}
        <div className="flex justify-center pb-4">
          <SignOutButton />
        </div>
      </main>
    </div>
  );
}
