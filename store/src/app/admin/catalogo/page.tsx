"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CatalogDataResponse, CatalogProductRow } from "@/app/api/admin/catalog/data/route";

// ── localStorage keys ────────────────────────────────────────────────────────
const LS_FORMAT = "catalog-format-v1";
const LS_PRICES = "catalog-show-prices-v1";
const LS_ORDER = "catalog-order-v1";
const LS_SELECTED = "catalog-selected-v1";

const NO_CATEGORY_ID = "__none";

type Format = "grid" | "list";

type CategoryGroup = {
  id: string;
  name: string;
  count: number;
  preview: CatalogProductRow[];
};

export default function CatalogoPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CatalogDataResponse | null>(null);

  const [format, setFormat] = useState<Format>("grid");
  const [showPrices, setShowPrices] = useState(true);
  const [companyName, setCompanyName] = useState("");
  const [order, setOrder] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [generating, setGenerating] = useState<"html" | "pdf" | "excel" | null>(null);

  // Carga inicial
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/catalog/data")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as CatalogDataResponse;
      })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setCompanyName(d.companyName);
        // Restaurar persistencia
        try {
          const fmt = localStorage.getItem(LS_FORMAT);
          if (fmt === "grid" || fmt === "list") setFormat(fmt);
          const sp = localStorage.getItem(LS_PRICES);
          if (sp != null) setShowPrices(sp === "1");
        } catch {}
        const groups = computeGroups(d);
        const allIds = groups.map((g) => g.id);
        let initialOrder: string[] = allIds;
        let initialSelected: Set<string> = new Set(allIds);
        try {
          const savedOrder = JSON.parse(localStorage.getItem(LS_ORDER) || "null") as string[] | null;
          if (Array.isArray(savedOrder)) {
            const known = new Set(allIds);
            const filtered = savedOrder.filter((id) => known.has(id));
            const missing = allIds.filter((id) => !filtered.includes(id));
            initialOrder = [...filtered, ...missing];
          }
          const savedSel = JSON.parse(localStorage.getItem(LS_SELECTED) || "null") as string[] | null;
          if (Array.isArray(savedSel)) {
            const known = new Set(allIds);
            initialSelected = new Set(savedSel.filter((id) => known.has(id)));
            // Si todos quedaron deseleccionados, mejor seleccionar todo por default
            if (initialSelected.size === 0) initialSelected = new Set(allIds);
          }
        } catch {}
        setOrder(initialOrder);
        setSelected(initialSelected);
      })
      .catch((err: any) => {
        if (cancelled) return;
        setError(err?.message || "Error cargando datos");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persistir cambios
  useEffect(() => {
    try { localStorage.setItem(LS_FORMAT, format); } catch {}
  }, [format]);
  useEffect(() => {
    try { localStorage.setItem(LS_PRICES, showPrices ? "1" : "0"); } catch {}
  }, [showPrices]);
  useEffect(() => {
    if (order.length > 0) {
      try { localStorage.setItem(LS_ORDER, JSON.stringify(order)); } catch {}
    }
  }, [order]);
  useEffect(() => {
    try { localStorage.setItem(LS_SELECTED, JSON.stringify([...selected])); } catch {}
  }, [selected]);

  const groups = useMemo(() => {
    if (!data) return [] as CategoryGroup[];
    const all = computeGroups(data);
    const byId = new Map(all.map((g) => [g.id, g]));
    return order.map((id) => byId.get(id)).filter((g): g is CategoryGroup => !!g);
  }, [data, order]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrder((curr) => {
      const oldIdx = curr.indexOf(String(active.id));
      const newIdx = curr.indexOf(String(over.id));
      if (oldIdx < 0 || newIdx < 0) return curr;
      return arrayMove(curr, oldIdx, newIdx);
    });
  }

  function toggleAll() {
    if (selected.size === groups.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(groups.map((g) => g.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((curr) => {
      const next = new Set(curr);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedOrder = order.filter((id) => selected.has(id));
  const selectedCount = selectedOrder.length;
  const selectedProducts = groups
    .filter((g) => selected.has(g.id))
    .reduce((sum, g) => sum + g.count, 0);

  async function generateHtml() {
    if (!data) return;
    setGenerating("html");
    try {
      const res = await fetch("/api/admin/catalog/html", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          showPrices,
          categoryOrder: selectedOrder,
          companyName: companyName || data.companyName,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      const html = await res.text();
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      downloadBlob(blob, fileName("html"));
    } catch (err: any) {
      alert(`Error generando HTML: ${err?.message || err}`);
    } finally {
      setGenerating(null);
    }
  }

  async function generatePdf() {
    if (!data) return;
    setGenerating("pdf");
    try {
      const res = await fetch("/api/admin/catalog/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format,
          showPrices,
          categoryOrder: selectedOrder,
          companyName: companyName || data.companyName,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      downloadBlob(blob, fileName("pdf"));
    } catch (err: any) {
      alert(`Error generando PDF: ${err?.message || err}`);
    } finally {
      setGenerating(null);
    }
  }

  async function generateExcel() {
    if (!data) return;
    setGenerating("excel");
    try {
      const res = await fetch("/api/admin/catalog/excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          showPrices,
          categoryOrder: selectedOrder,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      downloadBlob(blob, fileName("xlsx"));
    } catch (err: any) {
      alert(`Error generando Excel: ${err?.message || err}`);
    } finally {
      setGenerating(null);
    }
  }

  function fileName(ext: string): string {
    const ts = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const fmtSuffix = ext === "xlsx" ? "productos" : (format === "grid" ? "catalogo" : "lista");
    const priceSuffix = showPrices ? "" : "_sin_precios";
    return `${fmtSuffix}${priceSuffix}_${ts}.${ext}`;
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Catálogo</h1>
        <p className="text-gray-500">Cargando productos…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Catálogo</h1>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-6 max-w-5xl mx-auto pb-24">
      <h1 className="text-2xl font-bold mb-2">Catálogo</h1>
      <p className="text-gray-500 mb-6">
        Generá una lista de precios o catálogo visual en PDF/HTML/Excel para
        compartir con tus clientes. Arrastrá para reordenar las categorías.
      </p>

      {/* Opciones */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 mb-6 shadow-sm">
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Formato
            </label>
            <div className="flex gap-2">
              <FormatButton
                active={format === "grid"}
                onClick={() => setFormat("grid")}
                label="Grilla (3 col.)"
                desc="Catálogo visual con imagen grande"
              />
              <FormatButton
                active={format === "list"}
                onClick={() => setFormat("list")}
                label="Lista"
                desc="Lista densa con foto chica"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Opciones
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={showPrices}
                  onChange={(e) => setShowPrices(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Mostrar precios
              </label>
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Nombre en el catálogo
                </label>
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder={data.companyName}
                  className="text-sm"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Categorías */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden mb-6">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-gray-50">
          <div>
            <h2 className="font-semibold text-gray-900">Categorías</h2>
            <p className="text-xs text-gray-500">
              {selectedCount} de {groups.length} seleccionadas · {selectedProducts} productos
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={toggleAll}>
            {selected.size === groups.length ? "Deseleccionar todo" : "Seleccionar todo"}
          </Button>
        </div>

        {groups.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">
            No hay productos cargados todavía.
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              <ul className="divide-y divide-gray-100">
                {groups.map((g) => (
                  <SortableCategoryRow
                    key={g.id}
                    group={g}
                    checked={selected.has(g.id)}
                    onToggle={() => toggleOne(g.id)}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Generar */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-gray-900 mb-1">Generar</h2>
        <p className="text-sm text-gray-500 mb-4">
          {selectedCount === 0
            ? "Seleccioná al menos una categoría."
            : `${selectedProducts} productos en ${selectedCount} categorías`}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={generateHtml}
            disabled={selectedCount === 0 || !!generating}
            variant="outline"
          >
            {generating === "html" ? "Generando…" : "📄 HTML"}
          </Button>
          <Button
            onClick={generatePdf}
            disabled={selectedCount === 0 || !!generating}
          >
            {generating === "pdf" ? "Generando PDF…" : "📕 PDF"}
          </Button>
          <Button
            onClick={generateExcel}
            disabled={selectedCount === 0 || !!generating}
            variant="outline"
          >
            {generating === "excel" ? "Generando…" : "📊 Excel"}
          </Button>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          El HTML es liviano y se puede imprimir desde el navegador. El PDF se
          genera en el servidor (puede tardar 10-60s con muchas imágenes). El
          Excel es una planilla simple con código, nombre, precio y categoría.
        </p>
      </div>
    </div>
  );
}

// ── Sortable row ─────────────────────────────────────────────────────────────

function SortableCategoryRow({
  group,
  checked,
  onToggle,
}: {
  group: CategoryGroup;
  checked: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: group.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 text-gray-400 hover:text-gray-600"
        aria-label="Reordenar"
      >
        <DragHandleIcon />
      </button>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-4 w-4 rounded border-gray-300"
      />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-900 truncate">{group.name}</div>
        <div className="text-xs text-gray-500">
          {group.count} producto{group.count !== 1 ? "s" : ""}
        </div>
      </div>
      <div className="hidden sm:flex gap-1 max-w-[180px]">
        {group.preview.slice(0, 3).map((p) => (
          <div
            key={p.id}
            className="w-9 h-9 rounded border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center"
          >
            {p.thumb_image_url || p.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.thumb_image_url || p.image_url || ""}
                alt=""
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="text-gray-300 text-[10px]">—</span>
            )}
          </div>
        ))}
      </div>
    </li>
  );
}

function FormatButton({
  active,
  onClick,
  label,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg border px-3 py-2 text-left transition ${
        active
          ? "border-orange-500 bg-orange-50 ring-1 ring-orange-200"
          : "border-gray-200 hover:border-gray-300"
      }`}
    >
      <div className="text-sm font-semibold text-gray-900">{label}</div>
      <div className="text-xs text-gray-500">{desc}</div>
    </button>
  );
}

function DragHandleIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="9" cy="6" r="1.2" />
      <circle cx="15" cy="6" r="1.2" />
      <circle cx="9" cy="12" r="1.2" />
      <circle cx="15" cy="12" r="1.2" />
      <circle cx="9" cy="18" r="1.2" />
      <circle cx="15" cy="18" r="1.2" />
    </svg>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function computeGroups(data: CatalogDataResponse): CategoryGroup[] {
  const byId = new Map<string, { name: string; products: CatalogProductRow[] }>();
  for (const c of data.categories) {
    byId.set(c.id, { name: c.name, products: [] });
  }
  byId.set(NO_CATEGORY_ID, { name: "Sin categoría", products: [] });

  for (const p of data.products) {
    const id = p.category_id ?? NO_CATEGORY_ID;
    let bucket = byId.get(id);
    if (!bucket) {
      bucket = { name: p.category_name ?? "Sin categoría", products: [] };
      byId.set(id, bucket);
    }
    bucket.products.push(p);
  }

  const result: CategoryGroup[] = [];
  for (const [id, bucket] of byId.entries()) {
    if (bucket.products.length === 0) continue;
    result.push({
      id,
      name: bucket.name,
      count: bucket.products.length,
      preview: bucket.products.slice(0, 3),
    });
  }
  result.sort((a, b) => a.name.localeCompare(b.name, "es"));
  return result;
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
