import { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { requireRole } from "@/lib/rbac-server";
import { createServiceClient } from "@/lib/supabase";
import { getCurrentTenant } from "@/lib/tenant";

// POST /api/admin/catalog/excel
//
// Exporta un xlsx con los productos para mandarle al cliente. Equivalente al
// "Exportar productos a Excel (lista para clientes)" del Streamlit.
//
// Body: { showPrices, categoryOrder?: string[] }
//   - Si categoryOrder se provee, filtra a esas categorías y respeta el orden.
//   - Si no, exporta todos los productos activos ordenados por categoría/nombre.

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  showPrices?: boolean;
  categoryOrder?: string[];
};

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ["admin", "operador", "superadmin"]);
  if (auth instanceof Response) return auth;

  let body: Body = {};
  try {
    body = await request.json();
  } catch {
    // body opcional — usamos defaults
  }

  const { id: companyId } = await getCurrentTenant();
  const supabase = createServiceClient();

  const { data: prods, error } = await supabase
    .from("products")
    .select(
      "code, name, sale_price, cost_price, stock, category_id, category:categories(name)"
    )
    .eq("company_id", companyId)
    .eq("active", true)
    .order("name");

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  let rows = (prods ?? []).map((p: any) => ({
    Codigo: p.code ?? "",
    Nombre: p.name,
    Precio: p.sale_price ?? 0,
    Categoria: p.category?.name ?? "",
    _category_id: p.category_id ?? "__none",
  }));

  if (body.categoryOrder && body.categoryOrder.length > 0) {
    const orderIdx = new Map(body.categoryOrder.map((id, i) => [id, i]));
    rows = rows.filter((r) => orderIdx.has(r._category_id));
    rows.sort((a, b) => {
      const ai = orderIdx.get(a._category_id) ?? 999;
      const bi = orderIdx.get(b._category_id) ?? 999;
      if (ai !== bi) return ai - bi;
      return a.Nombre.localeCompare(b.Nombre, "es");
    });
  } else {
    rows.sort((a, b) => {
      const c = a.Categoria.localeCompare(b.Categoria, "es");
      if (c !== 0) return c;
      return a.Nombre.localeCompare(b.Nombre, "es");
    });
  }

  // Strip helper field
  const exportRows = rows.map(({ _category_id, ...rest }) => {
    if (body.showPrices === false) {
      const { Precio, ...withoutPrice } = rest;
      return withoutPrice;
    }
    return rest;
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(exportRows);

  // Anchos de columna razonables.
  const colWidths = [
    { wch: 14 }, // Codigo
    { wch: 50 }, // Nombre
    { wch: 12 }, // Precio
    { wch: 22 }, // Categoria
  ];
  ws["!cols"] = colWidths;

  XLSX.utils.book_append_sheet(wb, ws, "Productos");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="productos.xlsx"`,
    },
  });
}
