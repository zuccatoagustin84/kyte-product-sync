"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type WebImageSearchProps = {
  productId: string;
  defaultCode: string;
  defaultName: string;
  defaultCategory: string;
  onClose: () => void;
  onImported: () => void;
};

type Result = {
  url: string;
  thumb: string;
  title: string;
  source: string | null;
  width: number | null;
  height: number | null;
};

// Modal full-screen para buscar imágenes en la web (Bing) y subir la elegida.
//
// Flujo:
//   1. Se autocompletan checkboxes (Código, Nombre, Categoría) con los datos del
//      producto. La query final es la concatenación de los activados, salvo que
//      el user escriba algo manual.
//   2. Click "Buscar" → POST /api/admin/image-search → grilla de thumbnails.
//   3. Click en una thumb → POST /api/admin/products/:id/images/from-url
//      con la URL elegida. El backend descarga, redimensiona en 3 variantes y
//      la guarda como imagen del producto.
//
// Con respecto al original Streamlit: agregamos multi-query interno (código
// solo, código + nombre, nombre + categoría) en el endpoint para mejorar el
// recall, y permitimos importar varias imágenes en la misma sesión.
export function WebImageSearch({
  productId,
  defaultCode,
  defaultName,
  defaultCategory,
  onClose,
  onImported,
}: WebImageSearchProps) {
  const [useCode, setUseCode] = useState(Boolean(defaultCode));
  const [useName, setUseName] = useState(Boolean(defaultName));
  const [useCategory, setUseCategory] = useState(false);

  const buildQuery = useCallback(() => {
    const parts: string[] = [];
    if (useCode && defaultCode) parts.push(defaultCode);
    if (useName && defaultName) parts.push(defaultName.slice(0, 80));
    if (useCategory && defaultCategory) parts.push(defaultCategory);
    return parts.join(" ").trim();
  }, [useCode, useName, useCategory, defaultCode, defaultName, defaultCategory]);

  const [query, setQuery] = useState(buildQuery());
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState("");
  const [importingUrl, setImportingUrl] = useState<string | null>(null);
  const [importedUrls, setImportedUrls] = useState<Set<string>>(new Set());

  // Cuando cambia algún check, refrescamos la query (sólo si el user no la editó manualmente).
  const [manuallyEdited, setManuallyEdited] = useState(false);
  useEffect(() => {
    if (!manuallyEdited) setQuery(buildQuery());
  }, [buildQuery, manuallyEdited]);

  async function doSearch() {
    setError("");
    setSearching(true);
    setResults([]);
    try {
      const res = await fetch("/api/admin/image-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          code: useCode ? defaultCode : "",
          name: useName ? defaultName : "",
          category: useCategory ? defaultCategory : "",
          limit: 30,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Error ${res.status}`);
        return;
      }
      setResults(data.results ?? []);
    } catch (e) {
      setError(`Error de red: ${(e as Error).message}`);
    } finally {
      setSearching(false);
    }
  }

  // Buscar al abrir si tenemos query.
  useEffect(() => {
    if (query) doSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function importImage(url: string) {
    setImportingUrl(url);
    setError("");
    try {
      const res = await fetch(`/api/admin/products/${productId}/images/from-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, source: "web-search" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Error ${res.status}`);
        return;
      }
      setImportedUrls((prev) => new Set(prev).add(url));
      onImported();
    } catch (e) {
      setError(`Error de red: ${(e as Error).message}`);
    } finally {
      setImportingUrl(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-5xl my-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Buscar imágenes en la web</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Resultados desde Bing — click para importar (se redimensiona a thumb/medium/large).
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cerrar
          </Button>
        </div>

        {/* Search controls */}
        <div className="px-6 py-4 space-y-3">
          <div className="flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={useCode}
                onChange={(e) => {
                  setUseCode(e.target.checked);
                  setManuallyEdited(false);
                }}
                disabled={!defaultCode}
              />
              <span className={!defaultCode ? "text-gray-300" : ""}>
                Código {defaultCode && <span className="font-mono text-xs text-gray-500">({defaultCode})</span>}
              </span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={useName}
                onChange={(e) => {
                  setUseName(e.target.checked);
                  setManuallyEdited(false);
                }}
                disabled={!defaultName}
              />
              <span>Nombre</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={useCategory}
                onChange={(e) => {
                  setUseCategory(e.target.checked);
                  setManuallyEdited(false);
                }}
                disabled={!defaultCategory}
              />
              <span>
                Categoría {defaultCategory && <span className="text-xs text-gray-500">({defaultCategory})</span>}
              </span>
            </label>
          </div>

          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setManuallyEdited(true);
              }}
              placeholder="Término de búsqueda"
              className="flex-1"
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
            />
            <Button onClick={doSearch} disabled={searching || !query.trim()}>
              {searching ? "Buscando..." : "Buscar"}
            </Button>
            {query && (
              <Button
                variant="outline"
                onClick={() =>
                  window.open(
                    `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`,
                    "_blank"
                  )
                }
                title="Abrir en Google Imágenes"
              >
                Google
              </Button>
            )}
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Results grid */}
        <div className="px-6 pb-6">
          {searching ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="aspect-square bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : results.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">
              {query ? "Sin resultados. Probá otro término." : "Escribí algo y dale a Buscar."}
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {results.map((r, i) => {
                const imported = importedUrls.has(r.url);
                const importing = importingUrl === r.url;
                return (
                  <div
                    key={i}
                    className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all cursor-pointer group ${
                      imported
                        ? "border-green-400"
                        : "border-transparent hover:border-orange-300"
                    }`}
                    title={r.title || ""}
                    onClick={() => !importing && !imported && importImage(r.url)}
                  >
                    <img
                      src={r.thumb}
                      alt={r.title || ""}
                      className="w-full h-full object-cover bg-gray-100"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                    {r.width && r.height && (
                      <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[10px] px-1 rounded">
                        {r.width}×{r.height}
                      </span>
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      {importing ? (
                        <span className="text-xs text-white bg-orange-500 px-2 py-1 rounded">
                          Importando…
                        </span>
                      ) : imported ? (
                        <span className="text-xs text-white bg-green-600 px-2 py-1 rounded">
                          ✓ Importada
                        </span>
                      ) : (
                        <span className="text-xs text-white bg-orange-500 px-2 py-1 rounded font-medium">
                          Usar
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
