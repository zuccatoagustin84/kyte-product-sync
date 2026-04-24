import { createServiceClient } from "@/lib/supabase";
import { getCurrentTenant } from "@/lib/tenant";
import { formatPrice } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

async function getDashboardStats() {
  const supabase = createServiceClient();
  const { id: companyId } = await getCurrentTenant();

  const [
    { count: totalProducts },
    { count: totalOrders },
    { count: pendingOrders },
    { data: revenueData },
  ] = await Promise.all([
    supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("active", true),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("status", "pending"),
    supabase.from("orders").select("total").eq("company_id", companyId),
  ]);

  const totalRevenue = (revenueData ?? []).reduce(
    (sum, row) => sum + (row.total ?? 0),
    0
  );

  return {
    totalProducts: totalProducts ?? 0,
    totalOrders: totalOrders ?? 0,
    pendingOrders: pendingOrders ?? 0,
    totalRevenue,
  };
}

export default async function AdminDashboard() {
  const stats = await getDashboardStats();

  const cards = [
    {
      title: "Productos activos",
      value: stats.totalProducts.toLocaleString("es-AR"),
      icon: "📦",
      description: "En el catálogo",
    },
    {
      title: "Pedidos totales",
      value: stats.totalOrders.toLocaleString("es-AR"),
      icon: "🛒",
      description: "Histórico completo",
    },
    {
      title: "Pedidos pendientes",
      value: stats.pendingOrders.toLocaleString("es-AR"),
      icon: "⏳",
      description: "Esperando confirmación",
    },
    {
      title: "Ingresos totales",
      value: formatPrice(stats.totalRevenue),
      icon: "💰",
      description: "Suma de todos los pedidos",
    },
  ];

  return (
    <div className="p-6 md:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Resumen general de la tienda</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-500">
                  {card.title}
                </CardTitle>
                <span className="text-2xl">{card.icon}</span>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-gray-900">{card.value}</p>
              <p className="text-xs text-gray-400 mt-1">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
