"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/format";
import type { SyncPreviewItem } from "@/app/api/admin/sync/route";

type Summary = {
  total: number;
  toUpdate: number;
  noChange: number;
  notFound: number;
  zeroPrice: number;
};

type ActionResult = {
  success: number;
  failed: number;
  errors: Array<{ code: string; error: string }>;
};

type SyncResponse = {
  preview: SyncPreviewItem[];
  summary: Summary;
  applied?: ActionResult;
  created?: ActionResult;
  error?: string;
};

export default function SyncPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<SyncPreviewItem[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [applyResult, setApplyResult] = useState<ActionResult | null>(null);
  const [createResult, setCreateResult] = useState<ActionResult | null>(null);
  const [filterMode, setFilterMode] = useState<"all" | "update" | "skip">("all");

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setPreview(null);
    setSummary(null);
    setApplyResult(null);
    setCreateResult(null);
    setError("");
  }

  async function callSync(action: "preview" | "apply" | "create") {
    if (!file) { setError("Seleccioná un archivo Excel primero."); return; }
    setError("");

    if (action === "apply") setApplying(true);
    else if (action === "create") setCreating(true);
    else { setLoading(true); setPreview(null); setSummary(null); setApplyResult(null); setCreateResult(null); }

    try {
      const form = new FormData();
      form.append("file", file);
      const url = action === "apply" ? "/api/admin/sync?apply=true"
                : action === "create" ? "/api/admin/sync?create=true"
                : "/api/admin/sync";
      const res = await fetch(url, { method: "POST", body: form });
      const data: SyncResponse = await res.json();
      if (!res.ok || data.error) { setError(data.error ?? `Error ${res.status}`); return; }
      setPreview(data.preview);
      setSummary(data.summary);
      if (data.applied) setApplyResult(data.applied);
      if (data.created) setCreateResult(data.created);
    } catch (e) {
      setError(`Error de red: ${(e as Error).message}`);
    } finally {
      setLoading(false); setApplying(false); setCreating(false);
    }
  }

  const filteredPreview = preview?.filter((item) => {
    if (filterMode === "update") return item.willUpdate;
    if (filterMode === "skip") return !item.willUpdate;
    return true;
  });

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Actualización masiva de precios</h1>
        <p className="text-gray-500 mt-1">
          Subí la lista de precios Excel y actualizá los precios de la tienda en bulk.
        </p>
      </div>

      {/* Upload card */}
      <div className="bg-white rounded-xl ring-1 ring-foreground/10 p-6 mb-6 space-y-5">
        {/* File input */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Archivo de precios <span className="text-gray-400 font-normal">(.xls, .xlsx)</span>
          </label>
          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".xls,.xlsx"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              className="shrink-0"
            >
              Seleccionar archivo
            </Button>
            {file ? (
              <span className="text-sm text-gray-700 truncate max-w-xs font-medium">
                {file.name}
              </span>
            ) : (
              <span className="text-sm text-gray-400">Ningún archivo seleccionado</span>
            )}
          </div>
          <p className="mt-1.5 text-xs text-gray-400">
            El archivo debe tener columnas &quot;Articulo&quot; y &quot;Precio&quot; (se detectan automáticamente).
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <Button
            onClick={() => callSync("preview")}
            disabled={!file || loading || applying || creating}
            className="bg-[#1a1a2e] hover:bg-[#16213e] text-white border-0"
          >
            {loading ? <span className="flex items-center gap-2"><Spinner /> Procesando...</span> : "Vista previa"}
          </Button>

          {preview && summary && summary.toUpdate > 0 && !applyResult && (
            <Button
              onClick={() => callSync("apply")}
              disabled={applying || loading || creating}
              className="bg-orange-500 hover:bg-orange-600 text-white border-0"
            >
              {applying
                ? <span className="flex items-center gap-2"><Spinner /> Aplicando {summary.toUpdate} cambios...</span>
                : `Actualizar ${summary.toUpdate} precios`}
            </Button>
          )}

          {preview && summary && summary.notFound > 0 && !createResult && (
            <Button
              onClick={() => callSync("create")}
              disabled={creating || loading || applying}
              variant="outline"
              className="border-blue-300 text-blue-700 hover:bg-blue-50"
            >
              {creating
                ? <span className="flex items-center gap-2"><Spinner /> Creando productos...</span>
                : `Crear ${summary.notFound} productos nuevos`}
            </Button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      {/* Create result banner */}
      {createResult && (
        <div className={`rounded-xl p-4 mb-4 border ${createResult.failed === 0 ? "bg-blue-50 border-blue-200" : "bg-yellow-50 border-yellow-200"}`}>
          <p className="font-semibold text-gray-900 mb-1">
            {createResult.failed === 0 ? "Productos creados correctamente" : "Creación con errores"}
          </p>
          <p className="text-sm text-gray-600">
            {createResult.success} productos creados{createResult.failed > 0 && `, ${createResult.failed} con error`}.
          </p>
          {createResult.errors.length > 0 && (
            <ul className="mt-2 text-xs text-red-700 space-y-1">
              {createResult.errors.map((e, i) => (
                <li key={i}><span className="font-mono">{e.code}</span> — {e.error}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Apply result banner */}
      {applyResult && (
        <div
          className={`rounded-xl p-4 mb-6 border ${
            applyResult.failed === 0
              ? "bg-green-50 border-green-200"
              : "bg-yellow-50 border-yellow-200"
          }`}
        >
          <p className="font-semibold text-gray-900 mb-1">
            {applyResult.failed === 0 ? "Actualización completada" : "Actualización con errores"}
          </p>
          <p className="text-sm text-gray-600">
            {applyResult.success} productos actualizados correctamente
            {applyResult.failed > 0 && `, ${applyResult.failed} con error`}.
          </p>
          {applyResult.errors.length > 0 && (
            <ul className="mt-2 text-xs text-red-700 space-y-1">
              {applyResult.errors.map((e, i) => (
                <li key={i}>
                  <span className="font-mono">{e.code}</span> — {e.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Summary + preview table */}
      {summary && preview && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <SummaryCard
              label="En archivo"
              value={summary.total}
              color="gray"
            />
            <SummaryCard
              label="A actualizar"
              value={summary.toUpdate}
              color="orange"
            />
            <SummaryCard
              label="Sin cambio"
              value={summary.noChange}
              color="gray"
            />
            <SummaryCard
              label="No encontrados"
              value={summary.notFound}
              color="red"
            />
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2 mb-3">
            {(["all", "update", "skip"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                  filterMode === mode
                    ? "bg-[#1a1a2e] text-white border-[#1a1a2e]"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                }`}
              >
                {mode === "all"
                  ? `Todos (${preview.length})`
                  : mode === "update"
                  ? `A actualizar (${summary.toUpdate})`
                  : `Sin cambio (${preview.length - summary.toUpdate})`}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl ring-1 ring-foreground/10 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="px-4 py-3 text-left font-medium text-gray-600 w-28">
                      Código
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">
                      Nombre (fuente)
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-gray-600">
                      Nombre en tienda
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">
                      Precio actual
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">
                      Precio nuevo
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600">
                      Diferencia
                    </th>
                    <th className="px-4 py-3 text-center font-medium text-gray-600">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPreview && filteredPreview.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-10 text-center text-gray-400"
                      >
                        No hay filas en esta vista
                      </td>
                    </tr>
                  ) : (
                    filteredPreview?.map((item, i) => {
                      const diff = item.willUpdate
                        ? item.newPrice - item.currentPrice
                        : null;
                      const diffPct =
                        diff !== null && item.currentPrice > 0
                          ? ((diff / item.currentPrice) * 100).toFixed(1)
                          : null;
                      return (
                        <tr
                          key={i}
                          className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors"
                        >
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-500">
                            {item.code || "—"}
                          </td>
                          <td className="px-4 py-2.5 text-gray-700 max-w-[180px] truncate">
                            {item.name || "—"}
                          </td>
                          <td className="px-4 py-2.5 text-gray-700 max-w-[180px] truncate">
                            {item.storeName || <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-500">
                            {item.currentPrice > 0
                              ? formatPrice(item.currentPrice)
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right font-medium text-gray-900">
                            {item.newPrice > 0 ? formatPrice(item.newPrice) : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs">
                            {diff !== null && diffPct !== null ? (
                              <span
                                className={
                                  diff > 0
                                    ? "text-orange-600 font-medium"
                                    : "text-green-600 font-medium"
                                }
                              >
                                {diff > 0 ? "+" : ""}
                                {formatPrice(diff)} ({diff > 0 ? "+" : ""}
                                {diffPct}%)
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <StatusBadge item={item} />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Productos no encontrados — para crear */}
          {summary.notFound > 0 && (
            <div className="mt-6">
              <h2 className="text-base font-semibold text-gray-800 mb-2">
                Productos sin match en la tienda ({summary.notFound})
              </h2>
              <p className="text-xs text-gray-500 mb-3">
                Estos códigos están en el Excel pero no existen en la tienda. Habría que crearlos manualmente.
              </p>
              <div className="bg-white rounded-xl ring-1 ring-foreground/10 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-4 py-3 text-left font-medium text-gray-600 w-36">Código</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Nombre (Excel)</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">Precio lista</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview
                      .filter((item) => item.reason === "No encontrado en la tienda")
                      .map((item, i) => (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{item.code}</td>
                          <td className="px-4 py-2.5 text-gray-700">{item.name}</td>
                          <td className="px-4 py-2.5 text-right text-gray-900 font-medium">
                            {formatPrice(item.newPrice)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

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

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "gray" | "orange" | "red" | "green";
}) {
  const colorMap = {
    gray: "text-gray-900",
    orange: "text-orange-600",
    red: "text-red-600",
    green: "text-green-600",
  };
  return (
    <div className="bg-white rounded-xl ring-1 ring-foreground/10 px-4 py-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colorMap[color]}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ item }: { item: SyncPreviewItem }) {
  if (item.willUpdate) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700 border border-orange-200">
        Actualizar
      </span>
    );
  }
  if (item.reason === "No encontrado en la tienda") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">
        Sin match
      </span>
    );
  }
  if (item.reason === "Precio cero (ignorado)") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">
        Precio $0
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
      Sin cambio
    </span>
  );
}
