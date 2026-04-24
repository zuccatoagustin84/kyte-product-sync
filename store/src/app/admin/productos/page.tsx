"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useTenantId } from "@/components/TenantProvider";
import type { Product, Category } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ImageManager } from "@/components/admin/ImageManager";
import { TagInput } from "@/components/admin/TagInput";

const DEFAULT_TAG_SUGGESTIONS = [
  "Ofertas",
  "Ingresos",
  "ConDescuento",
  "Destacado",
  "Nuevo",
  "Liquidación",
];

const PAGE_SIZE = 50;

type EditForm = {
  name: string;
  code: string;
  sale_price: string;
  cost_price: string;
  stock: string;
  min_order: string;
  active: boolean;
  category_id: string;
  description: string;
  tags: string[];
};

function emptyForm(p?: Product): EditForm {
  return {
    name: p?.name ?? "",
    code: p?.code ?? "",
    sale_price: p?.sale_price?.toString() ?? "",
    cost_price: p?.cost_price?.toString() ?? "",
    stock: (p as any)?.stock?.toString() ?? "",
    min_order: (p as any)?.min_order?.toString() ?? "",
    active: p?.active ?? true,
    category_id: p?.category_id ?? "",
    description: p?.description ?? "",
    tags: p?.tags ?? [],
  };
}

export default function ProductosAdmin() {
  const tenantId = useTenantId();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  // Edit sheet
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<EditForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [deleting, setDeleting] = useState(false);

  // New product sheet
  const [creatingOpen, setCreatingOpen] = useState(false);
  const [createForm, setCreateForm] = useState<EditForm>(emptyForm());
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Load categories once
  useEffect(() => {
    supabase
      .from("categories")
      .select("*")
      .eq("company_id", tenantId)
      .order("sort_order")
      .then(({ data }) => {
        if (data) setCategories(data as Category[]);
      });
  }, [tenantId]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("products")
      .select("*, category:categories(id,name)", { count: "exact" })
      .eq("company_id", tenantId);

    if (search.trim()) {
      query = query.or(
        `name.ilike.%${search.trim()}%,code.ilike.%${search.trim()}%`
      );
    }
    if (filterCategory) {
      query = query.eq("category_id", filterCategory);
    }
    if (filterActive === "active") {
      query = query.eq("active", true);
    } else if (filterActive === "inactive") {
      query = query.eq("active", false);
    }

    const { data, count } = await query
      .order("name")
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    setProducts((data as Product[]) ?? []);
    setTotal(count ?? 0);
    setLoading(false);
    setSelected(new Set());
  }, [search, filterCategory, filterActive, page, tenantId]);

  useEffect(() => {
    setPage(0);
  }, [search, filterCategory, filterActive]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  function openEdit(product: Product) {
    setEditing(product);
    setForm(emptyForm(product));
    setSaveError("");
  }

  function openCreate() {
    setCreateForm(emptyForm());
    setCreateError("");
    setCreatingOpen(true);
  }

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    setSaveError("");
    try {
      const res = await fetch(`/api/admin/products/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          code: form.code || null,
          sale_price: parseFloat(form.sale_price) || 0,
          cost_price: parseFloat(form.cost_price) || null,
          stock: parseInt(form.stock) || null,
          min_order: parseInt(form.min_order) || null,
          active: form.active,
          category_id: form.category_id || null,
          description: form.description || null,
          tags: form.tags,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        setSaveError(body.error ?? "Error al guardar");
        return;
      }
      setEditing(null);
      fetchProducts();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!editing) return;
    if (!window.confirm("¿Eliminar este producto?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/products/${editing.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json();
        setSaveError(body.error ?? "Error al eliminar");
        return;
      }
      setEditing(null);
      fetchProducts();
    } finally {
      setDeleting(false);
    }
  }

  async function handleCreate() {
    setCreating(true);
    setCreateError("");
    try {
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createForm.name,
          code: createForm.code || null,
          sale_price: parseFloat(createForm.sale_price) || 0,
          cost_price: parseFloat(createForm.cost_price) || null,
          stock: parseInt(createForm.stock) || null,
          min_order: parseInt(createForm.min_order) || null,
          active: createForm.active,
          category_id: createForm.category_id || null,
          description: createForm.description || null,
          tags: createForm.tags,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        setCreateError(body.error ?? "Error al crear");
        return;
      }
      setCreatingOpen(false);
      fetchProducts();
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(product: Product) {
    await fetch(`/api/admin/products/${product.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !product.active }),
    });
    fetchProducts();
  }

  async function bulkSetActive(active: boolean) {
    await Promise.all(
      Array.from(selected).map((id) =>
        fetch(`/api/admin/products/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ active }),
        })
      )
    );
    fetchProducts();
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Reusable form fields component (rendered inline for both sheets)
  function renderFormFields(
    f: EditForm,
    setF: (v: EditForm) => void,
    error: string,
    prefix: "edit" | "create" = "edit"
  ) {
    const fid = (k: string) => `${prefix}-${k}`;
    return (
      <div className="px-4 py-4 space-y-4">
        <div>
          <label htmlFor={fid("name")} className="block text-sm font-medium text-gray-700 mb-1">
            Nombre
          </label>
          <Input
            id={fid("name")}
            value={f.name}
            onChange={(e) => setF({ ...f, name: e.target.value })}
          />
        </div>

        <div>
          <label htmlFor={fid("code")} className="block text-sm font-medium text-gray-700 mb-1">
            Código
          </label>
          <Input
            id={fid("code")}
            value={f.code}
            onChange={(e) => setF({ ...f, code: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={fid("sale_price")} className="block text-sm font-medium text-gray-700 mb-1">
              Precio venta
            </label>
            <Input
              id={fid("sale_price")}
              type="number"
              value={f.sale_price}
              onChange={(e) => setF({ ...f, sale_price: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor={fid("cost_price")} className="block text-sm font-medium text-gray-700 mb-1">
              Precio costo
            </label>
            <Input
              id={fid("cost_price")}
              type="number"
              value={f.cost_price}
              onChange={(e) => setF({ ...f, cost_price: e.target.value })}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={fid("stock")} className="block text-sm font-medium text-gray-700 mb-1">
              Stock
            </label>
            <Input
              id={fid("stock")}
              type="number"
              value={f.stock}
              onChange={(e) => setF({ ...f, stock: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor={fid("min_order")} className="block text-sm font-medium text-gray-700 mb-1">
              Pedido mínimo
            </label>
            <Input
              id={fid("min_order")}
              type="number"
              value={f.min_order}
              onChange={(e) => setF({ ...f, min_order: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label htmlFor={fid("category")} className="block text-sm font-medium text-gray-700 mb-1">
            Categoría
          </label>
          <select
            id={fid("category")}
            value={f.category_id}
            onChange={(e) => setF({ ...f, category_id: e.target.value })}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm focus-visible:border-ring outline-none"
          >
            <option value="">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={fid("description")} className="block text-sm font-medium text-gray-700 mb-1">
            Descripción
          </label>
          <textarea
            id={fid("description")}
            value={f.description}
            onChange={(e) => setF({ ...f, description: e.target.value })}
            rows={5}
            placeholder="Características, dimensiones, materiales..."
            className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm focus-visible:border-ring outline-none resize-y"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tags
          </label>
          <TagInput
            value={f.tags}
            onChange={(tags) => setF({ ...f, tags })}
            suggestions={DEFAULT_TAG_SUGGESTIONS}
          />
          <p className="text-xs text-gray-400 mt-1">
            Etiquetas libres (se ven como badges en el catálogo). Enter o coma para agregar.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setF({ ...f, active: !f.active })}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
              f.active ? "bg-orange-500" : "bg-gray-200"
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                f.active ? "translate-x-4" : "translate-x-1"
              }`}
            />
          </button>
          <span className="text-sm font-medium text-gray-700">
            {f.active ? "Activo" : "Inactivo"}
          </span>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Productos</h1>
          <p className="text-gray-500 mt-1">{total} productos en total</p>
        </div>
        <Button
          onClick={openCreate}
          className="bg-orange-500 hover:bg-orange-600 text-white border-0"
        >
          Nuevo producto
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Input
          placeholder="Buscar por nombre o código..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
        >
          <option value="">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={filterActive}
          onChange={(e) => setFilterActive(e.target.value as "all" | "active" | "inactive")}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
        >
          <option value="all">Todos</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </select>
      </div>

      {/* Bulk actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-orange-50 rounded-lg border border-orange-200">
          <span className="text-sm text-orange-700 font-medium">
            {selected.size} seleccionados
          </span>
          <Button size="sm" variant="outline" onClick={() => bulkSetActive(true)}>
            Activar
          </Button>
          <Button size="sm" variant="outline" onClick={() => bulkSetActive(false)}>
            Desactivar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Deseleccionar
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl ring-1 ring-foreground/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={selected.size === products.length && products.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelected(new Set(products.map((p) => p.id)));
                      } else {
                        setSelected(new Set());
                      }
                    }}
                  />
                </th>
                <th className="px-3 py-3 text-left font-medium text-gray-600 w-14">Img</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">Nombre</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">Código</th>
                <th className="px-3 py-3 text-left font-medium text-gray-600">Categoría</th>
                <th className="px-3 py-3 text-right font-medium text-gray-600">Precio</th>
                <th className="px-3 py-3 text-right font-medium text-gray-600">Stock</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600">Activo</th>
                <th className="px-3 py-3 text-center font-medium text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-3 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-gray-400">
                    No se encontraron productos
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr
                    key={product.id}
                    className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
                  >
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={selected.has(product.id)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(product.id);
                          else next.delete(product.id);
                          setSelected(next);
                        }}
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-10 h-10 object-cover rounded-md bg-gray-100"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-md bg-gray-100 flex items-center justify-center text-gray-300 text-lg">
                          📦
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-gray-900 max-w-[200px] truncate">
                      {product.name}
                    </td>
                    <td className="px-3 py-2.5 text-gray-500 font-mono text-xs">
                      {product.code ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-gray-500">
                      {product.category?.name ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-gray-900">
                      {formatPrice(product.sale_price)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-500">
                      {(product as any).stock ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button
                        onClick={() => toggleActive(product)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                          product.active ? "bg-orange-500" : "bg-gray-200"
                        }`}
                        aria-label={product.active ? "Desactivar" : "Activar"}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                            product.active ? "translate-x-4" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => openEdit(product)}
                      >
                        Editar
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-sm text-gray-500">
              Página {page + 1} de {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Sheet */}
      <Sheet open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Editar producto</SheetTitle>
          </SheetHeader>

          {editing && renderFormFields(form, setForm, saveError)}

          {editing && (
            <div className="px-4 pb-4">
              <ImageManager productId={editing.id} />
            </div>
          )}

          <SheetFooter>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting || saving}
            >
              {deleting ? "Eliminando..." : "Eliminar"}
            </Button>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || deleting}
              className="bg-orange-500 hover:bg-orange-600 text-white border-0"
            >
              {saving ? "Guardando..." : "Guardar cambios"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* New Product Sheet */}
      <Sheet open={creatingOpen} onOpenChange={(open) => { if (!open) setCreatingOpen(false); }}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Nuevo producto</SheetTitle>
          </SheetHeader>

          {renderFormFields(createForm, setCreateForm, createError, "create")}

          <SheetFooter>
            <Button variant="outline" onClick={() => setCreatingOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating}
              className="bg-orange-500 hover:bg-orange-600 text-white border-0"
            >
              {creating ? "Creando..." : "Crear producto"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
