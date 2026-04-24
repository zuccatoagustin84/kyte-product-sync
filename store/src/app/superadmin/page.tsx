import Link from "next/link";
import { createServiceClient } from "@/lib/supabase";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2Icon, PackageIcon, ClipboardListIcon, UsersIcon } from "lucide-react";

type Company = {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  created_at: string;
};

async function getStats() {
  const service = createServiceClient();
  const [companies, products, orders, profiles] = await Promise.all([
    service
      .from("companies")
      .select("id, slug, name, is_active, created_at")
      .order("created_at", { ascending: false }),
    service.from("products").select("id", { count: "exact", head: true }),
    service.from("orders").select("id", { count: "exact", head: true }),
    service.from("profiles").select("id", { count: "exact", head: true }),
  ]);

  const list = (companies.data ?? []) as Company[];
  return {
    companies: list,
    totalCompanies: list.length,
    activeCompanies: list.filter((c) => c.is_active).length,
    totalProducts: products.count ?? 0,
    totalOrders: orders.count ?? 0,
    totalProfiles: profiles.count ?? 0,
  };
}

export default async function SuperadminDashboard() {
  const s = await getStats();

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Backoffice</h1>
        <p className="text-gray-500 mt-1">
          Panel global multi-tenant — gestionás todas las companies desde acá.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Companies"
          value={`${s.activeCompanies} / ${s.totalCompanies}`}
          hint="activas / totales"
          Icon={Building2Icon}
        />
        <StatCard label="Productos" value={s.totalProducts} Icon={PackageIcon} />
        <StatCard label="Pedidos" value={s.totalOrders} Icon={ClipboardListIcon} />
        <StatCard label="Usuarios" value={s.totalProfiles} Icon={UsersIcon} />
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-900">
          Companies recientes
        </h2>
        <Link
          href="/superadmin/companies/new"
          className="px-3 py-1.5 rounded-lg bg-purple-600 text-white text-sm font-medium hover:bg-purple-700"
        >
          + Nueva company
        </Link>
      </div>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Nombre</th>
              <th className="text-left px-4 py-3 font-medium">Slug</th>
              <th className="text-left px-4 py-3 font-medium">Estado</th>
              <th className="text-left px-4 py-3 font-medium">Creada</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {s.companies.slice(0, 8).map((c) => (
              <tr key={c.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                <td className="px-4 py-3 text-gray-600 font-mono">{c.slug}</td>
                <td className="px-4 py-3">
                  <Badge variant={c.is_active ? "default" : "secondary"}>
                    {c.is_active ? "Activa" : "Inactiva"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(c.created_at).toLocaleDateString("es-AR")}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/superadmin/companies/${c.id}`}
                    className="text-purple-600 hover:underline text-sm"
                  >
                    Editar
                  </Link>
                </td>
              </tr>
            ))}
            {s.companies.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  Todavía no hay companies. Creá la primera.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wider text-gray-500">
          {label}
        </span>
        <Icon size={16} className="text-purple-600" />
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {hint && <div className="text-xs text-gray-400 mt-0.5">{hint}</div>}
    </Card>
  );
}
