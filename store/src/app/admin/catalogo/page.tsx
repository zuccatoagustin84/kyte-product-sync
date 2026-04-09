"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Category } from "@/lib/types";

export default function CatalogoPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCat, setSelectedCat] = useState<string>("__all__");
  const [showPrices, setShowPrices] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingCats, setLoadingCats] = useState(true);
  const [status, setStatus] = useState<{ kind: "info" | "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/categories");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
        setCategories(data.categories ?? []);
      } catch (e) {
        setStatus({ kind: "error", text: `Error cargando categorías: ${(e as Error).message}` });
      } finally {
        setLoadingCats(false);
      }
    })();
  }, []);

  async function generateCatalog() {
    setLoading(true);
    setStatus({ kind: "info", text: "Generando catálogo..." });

    try {
      const selected = categories.find((c) => c.id === selectedCat);
      const res = await fetch("/api/admin/catalogo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filterCategory: selectedCat === "__all__" ? undefined : selected?.name,
          showPrices,
          companyName: "MP.TOOLS MAYORISTA",
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `Error ${res.status}` }));
        throw new Error(data.error ?? `Error ${res.status}`);
      }

      const html = await res.text();
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const catSlug =
        selectedCat === "__all__"
          ? "completo"
          : (selected?.name ?? "catalogo")
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/[^a-z0-9]+/g, "_")
              .replace(/^_|_$/g, "");
      a.download = `catalogo_${catSlug}_${new Date().toISOString().slice(0, 10)}.html`;
      a.click();
      URL.revokeObjectURL(url);

      setStatus({
        kind: "success",
        text: "Catálogo descargado. Abrilo en Chrome y usá Ctrl+P para guardarlo como PDF.",
      });
    } catch (e) {
      setStatus({ kind: "error", text: `Error: ${(e as Error).message}` });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Generar catálogo</h1>
        <p className="text-gray-500 mt-1">
          Generá un catálogo HTML imprimible con los productos de la tienda.
        </p>
      </div>

      {/* Form card */}
      <div className="bg-white rounded-xl ring-1 ring-foreground/10 p-6 mb-6 space-y-5">
        {/* Category selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Categoría
          </label>
          <select
            value={selectedCat}
            onChange={(e) => setSelectedCat(e.target.value)}
            disabled={loadingCats || loading}
            className="w-full md:w-72 h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 disabled:opacity-50"
          >
            <option value="__all__">
              {loadingCats ? "Cargando categorías..." : "Todas las categorías"}
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-gray-400">
            Elegí una categoría para generar un catálogo filtrado, o dejá &quot;Todas&quot;
            para un catálogo completo.
          </p>
        </div>

        {/* Show prices */}
        <label className="flex items-center gap-2 text-sm text-gray-700 select-none cursor-pointer">
          <input
            type="checkbox"
            checked={showPrices}
            onChange={(e) => setShowPrices(e.target.checked)}
            disabled={loading}
            className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
          />
          Mostrar precios
        </label>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <Button
            onClick={generateCatalog}
            disabled={loading || loadingCats}
            className="bg-[#1a1a2e] hover:bg-[#16213e] text-white border-0"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <Spinner /> Generando...
              </span>
            ) : (
              "Generar y descargar catálogo HTML"
            )}
          </Button>
        </div>

        {/* Status */}
        {status && (
          <div
            className={`rounded-lg border p-3 text-sm ${
              status.kind === "error"
                ? "bg-red-50 border-red-200 text-red-700"
                : status.kind === "success"
                ? "bg-green-50 border-green-200 text-green-700"
                : "bg-gray-50 border-gray-200 text-gray-600"
            }`}
          >
            {status.text}
          </div>
        )}
      </div>

      {/* Help card */}
      <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-xs text-gray-600 space-y-1">
        <p className="font-medium text-gray-800 mb-1">
          Para imprimir o guardar como PDF:
        </p>
        <p>1. Abrir el HTML descargado en Chrome.</p>
        <p>2. Ctrl+P (⌘+P en Mac) → Guardar como PDF.</p>
        <p>
          3. En configuración: activar &quot;Gráficos de fondo&quot; para conservar los
          colores y fondos.
        </p>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
