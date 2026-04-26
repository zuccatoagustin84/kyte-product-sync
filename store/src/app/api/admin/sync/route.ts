import { NextRequest } from "next/server";
import { requireRole } from "@/lib/rbac-server";
import { createServiceClient } from "@/lib/supabase";
import { getCurrentTenant } from "@/lib/tenant";

// Sync masivo de productos a partir de filas parseadas client-side desde el
// Excel del distribuidor.  El cliente decide qué columna mapea a qué campo
// (ver `excel-parser.ts` + UI en `/admin/sync`) y manda el array `rows` ya
// normalizado.

// ── Types ─────────────────────────────────────────────────────────────────────

type SourceRow = {
  code: string;
  name: string;
  price: number;
  costPrice?: number | null;
  rubro?: string | null;
  description?: string | null;
};

type CreateInstruction = {
  code: string;
  categoryId?: string | null;
};

type ApplyOptions = {
  // Qué cambios pisar al actualizar.  Si todos están en false, sólo se
  // actualiza el precio (modo histórico).
  updateName?: boolean;
  updateCostPrice?: boolean;
  updateDescription?: boolean;
};

type RequestBody = {
  rows: SourceRow[];
  action?: "preview" | "apply" | "create";
  applyCodes?: string[];
  createList?: CreateInstruction[];
  options?: ApplyOptions;
};

export type SyncPreviewItem = {
  code: string;
  name: string;
  storeName: string;
  storeId: string | null;
  storeCategoryName: string | null;
  currentPrice: number;
  newPrice: number;
  currentCostPrice: number | null;
  newCostPrice: number | null;
  diff: number;
  diffPct: number;
  rubro: string | null;
  suggestedCategoryId: string | null;
  suggestedCategoryName: string | null;
  willUpdate: boolean;
  reason?: string;
};

export type KyteOnlyItem = {
  id: string;
  code: string;
  name: string;
  price: number;
  category: string;
};

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ["admin", "superadmin"]);
  if (auth instanceof Response) return auth;
  const { id: companyId } = await getCurrentTenant();

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return Response.json({ error: "No se recibieron filas" }, { status: 400 });
  }

  const action = body.action ?? "preview";
  const options: ApplyOptions = body.options ?? {};

  const supabase = createServiceClient();
  const [{ data: storeProducts, error: fetchError }, { data: cats }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, code, sale_price, cost_price, description, category_id, category:categories(id,name)")
      .eq("company_id", companyId),
    supabase
      .from("categories")
      .select("id, name")
      .eq("company_id", companyId),
  ]);

  if (fetchError) {
    return Response.json({ error: `Error obteniendo productos: ${fetchError.message}` }, { status: 500 });
  }

  type StoreProductRow = {
    id: string;
    name: string;
    code: string | null;
    sale_price: number;
    cost_price: number | null;
    description: string | null;
    category_id: string | null;
    category?: { id: string; name: string } | { id: string; name: string }[] | null;
  };
  const products = (storeProducts as unknown as StoreProductRow[]) ?? [];
  const categories = (cats as Array<{ id: string; name: string }>) ?? [];

  const storeByCode = new Map<string, StoreProductRow>();
  for (const p of products) {
    if (!p.code) continue;
    storeByCode.set(p.code.trim().toLowerCase(), p);
  }

  // Map de categorías por nombre normalizado para sugerir match contra el rubro
  // del Excel.  Si "Rubro = Wadfow" y existe la categoría "Wadfow" en la
  // tienda, la pre-seleccionamos al crear.
  const catByLowerName = new Map<string, { id: string; name: string }>();
  for (const c of categories) {
    catByLowerName.set(c.name.trim().toLowerCase(), c);
  }

  // ── Build preview ───────────────────────────────────────────────────────────
  const preview: SyncPreviewItem[] = [];
  const updatesByCode = new Map<
    string,
    { id: string; newPrice: number; newName: string; newCost: number | null; newDesc: string | null }
  >();

  for (const src of body.rows) {
    const codeKey = (src.code ?? "").toString().trim().toLowerCase();
    const cleanName = (src.name ?? "").toString().trim();
    const cleanRubro = src.rubro != null ? String(src.rubro).trim() : null;
    const cleanDesc = src.description != null ? String(src.description).trim() : null;
    const newPrice = Number(src.price) || 0;
    const newCost = src.costPrice != null ? (Number(src.costPrice) || 0) : null;

    const suggestedCat = cleanRubro
      ? catByLowerName.get(cleanRubro.toLowerCase()) ?? null
      : null;

    if (!codeKey) {
      preview.push({
        code: "",
        name: cleanName,
        storeName: "",
        storeId: null,
        storeCategoryName: null,
        currentPrice: 0,
        newPrice,
        currentCostPrice: null,
        newCostPrice: newCost,
        diff: 0,
        diffPct: 0,
        rubro: cleanRubro,
        suggestedCategoryId: suggestedCat?.id ?? null,
        suggestedCategoryName: suggestedCat?.name ?? null,
        willUpdate: false,
        reason: "Sin código",
      });
      continue;
    }

    const match = storeByCode.get(codeKey);

    if (!match) {
      preview.push({
        code: codeKey,
        name: cleanName,
        storeName: "",
        storeId: null,
        storeCategoryName: null,
        currentPrice: 0,
        newPrice,
        currentCostPrice: null,
        newCostPrice: newCost,
        diff: 0,
        diffPct: 0,
        rubro: cleanRubro,
        suggestedCategoryId: suggestedCat?.id ?? null,
        suggestedCategoryName: suggestedCat?.name ?? null,
        willUpdate: false,
        reason: "No encontrado en la tienda",
      });
      continue;
    }

    const cat = Array.isArray(match.category) ? match.category[0] : match.category;
    const storeCategoryName = cat?.name ?? null;

    if (newPrice <= 0) {
      preview.push({
        code: codeKey,
        name: cleanName,
        storeName: match.name,
        storeId: match.id,
        storeCategoryName,
        currentPrice: match.sale_price,
        newPrice,
        currentCostPrice: match.cost_price,
        newCostPrice: newCost,
        diff: 0,
        diffPct: 0,
        rubro: cleanRubro,
        suggestedCategoryId: null,
        suggestedCategoryName: null,
        willUpdate: false,
        reason: "Precio cero (ignorado)",
      });
      continue;
    }

    const priceChanged = Math.abs(match.sale_price - newPrice) > 0.001;
    const nameChanged =
      Boolean(options.updateName) && cleanName && cleanName !== (match.name ?? "");
    const costChanged =
      Boolean(options.updateCostPrice) &&
      newCost != null &&
      Math.abs((match.cost_price ?? 0) - newCost) > 0.001;
    const descChanged =
      Boolean(options.updateDescription) &&
      cleanDesc != null &&
      cleanDesc.length > 0 &&
      cleanDesc !== (match.description ?? "");

    const willUpdate = priceChanged || nameChanged || costChanged || descChanged;
    const diff = newPrice - match.sale_price;
    const diffPct = match.sale_price > 0 ? (diff / match.sale_price) * 100 : 0;

    preview.push({
      code: codeKey,
      name: cleanName,
      storeName: match.name,
      storeId: match.id,
      storeCategoryName,
      currentPrice: match.sale_price,
      newPrice,
      currentCostPrice: match.cost_price,
      newCostPrice: newCost,
      diff,
      diffPct,
      rubro: cleanRubro,
      suggestedCategoryId: null,
      suggestedCategoryName: null,
      willUpdate,
      reason: willUpdate ? undefined : "Sin cambio",
    });

    if (willUpdate) {
      updatesByCode.set(codeKey, {
        id: match.id,
        newPrice,
        newName: nameChanged ? cleanName : match.name,
        newCost: costChanged ? newCost : (match.cost_price ?? null),
        newDesc: descChanged ? cleanDesc : (match.description ?? null),
      });
    }
  }

  // ── Productos solo en la tienda (no aparecen en el Excel) ───────────────────
  const sourceCodes = new Set(
    body.rows
      .map((r) => (r.code ?? "").toString().trim().toLowerCase())
      .filter((c) => c)
  );
  const kyteOnly: KyteOnlyItem[] = [];
  for (const p of products) {
    if (!p.code) continue;
    const ck = p.code.trim().toLowerCase();
    if (sourceCodes.has(ck)) continue;
    const cat = Array.isArray(p.category) ? p.category[0] : p.category;
    kyteOnly.push({
      id: p.id,
      code: p.code,
      name: p.name,
      price: p.sale_price,
      category: cat?.name ?? "",
    });
  }
  kyteOnly.sort((a, b) => a.name.localeCompare(b.name, "es"));

  const summary = {
    total: body.rows.length,
    toUpdate: updatesByCode.size,
    noChange: preview.filter((r) => r.reason === "Sin cambio").length,
    notFound: preview.filter((r) => r.reason === "No encontrado en la tienda").length,
    zeroPrice: preview.filter((r) => r.reason === "Precio cero (ignorado)").length,
    noCode: preview.filter((r) => r.reason === "Sin código").length,
    onlyInStore: kyteOnly.length,
  };

  if (action === "preview") {
    return Response.json({ preview, summary, kyteOnly });
  }

  // ── Aplicar updates ─────────────────────────────────────────────────────────
  if (action === "apply") {
    const filterCodes =
      Array.isArray(body.applyCodes) && body.applyCodes.length
        ? new Set(body.applyCodes.map((c) => c.toLowerCase()))
        : null;

    const updateErrors: Array<{ code: string; error: string }> = [];
    let updateSuccess = 0;

    for (const [code, payload] of updatesByCode) {
      if (filterCodes && !filterCodes.has(code)) continue;
      const update: Record<string, unknown> = {
        sale_price: payload.newPrice,
        updated_at: new Date().toISOString(),
      };
      if (options.updateName) update.name = payload.newName;
      if (options.updateCostPrice && payload.newCost != null) update.cost_price = payload.newCost;
      if (options.updateDescription && payload.newDesc != null) update.description = payload.newDesc;

      const { error } = await supabase
        .from("products")
        .update(update)
        .eq("id", payload.id)
        .eq("company_id", companyId);
      if (error) updateErrors.push({ code, error: error.message });
      else updateSuccess++;
    }

    return Response.json({
      preview,
      summary,
      kyteOnly,
      applied: {
        success: updateSuccess,
        failed: updateErrors.length,
        errors: updateErrors,
      },
    });
  }

  // ── Crear productos nuevos ──────────────────────────────────────────────────
  if (action === "create") {
    const createMap = new Map<string, CreateInstruction>();
    for (const c of body.createList ?? []) {
      createMap.set(c.code.toLowerCase(), c);
    }

    const createErrors: Array<{ code: string; error: string }> = [];
    let createSuccess = 0;

    const toCreate = preview.filter(
      (r) =>
        r.reason === "No encontrado en la tienda" &&
        r.newPrice > 0 &&
        r.code &&
        (createMap.size === 0 || createMap.has(r.code))
    );

    // Mapeamos rows del body para encontrar costPrice + description del nuevo
    // producto.  Sólo los que están en createMap (o todos si createMap vacío).
    const rowByCode = new Map<string, SourceRow>();
    for (const r of body.rows) {
      rowByCode.set((r.code ?? "").toString().trim().toLowerCase(), r);
    }

    for (const item of toCreate) {
      const slug = item.name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const slugSuffix = Math.random().toString(36).slice(2, 6);

      const instruction = createMap.get(item.code);
      const categoryId =
        instruction?.categoryId ?? item.suggestedCategoryId ?? null;

      const row = rowByCode.get(item.code);
      const costPrice = row?.costPrice != null ? Number(row.costPrice) : item.newPrice;
      const description = row?.description?.toString().trim() || null;

      const { error } = await supabase.from("products").insert({
        id,
        company_id: companyId,
        name: item.name || item.code,
        code: item.code,
        sale_price: item.newPrice,
        cost_price: costPrice,
        active: true,
        slug: `${slug || "producto"}-${slugSuffix}`,
        sort_order: 9999,
        category_id: categoryId,
        description,
      });
      if (error) createErrors.push({ code: item.code, error: error.message });
      else createSuccess++;
    }

    return Response.json({
      preview,
      summary,
      kyteOnly,
      created: {
        success: createSuccess,
        failed: createErrors.length,
        errors: createErrors,
      },
    });
  }

  return Response.json({ error: `Acción desconocida: ${action}` }, { status: 400 });
}
