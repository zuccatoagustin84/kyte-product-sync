import { redirect } from "next/navigation";
import { getUser, createSupabaseServer } from "@/lib/supabase-server";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import SignOutButton from "./SignOutButton";
import ProfileEditForm from "./ProfileEditForm";

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
                <li
                  key={order.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 px-4 py-3"
                >
                  <div className="flex flex-col gap-0.5">
                    <span className="text-xs text-gray-400">
                      {formatDate(order.created_at)}
                    </span>
                    <span className="text-sm font-medium text-gray-800">
                      {formatCurrency(order.total)}
                    </span>
                  </div>
                  <Badge variant={statusVariant(order.status)}>
                    {statusLabel(order.status)}
                  </Badge>
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
