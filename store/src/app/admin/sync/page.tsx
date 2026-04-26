"use client";

import { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPrice } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { useTenantId } from "@/components/TenantProvider";
import type { Category } from "@/lib/types";
import {
  parseExcelFile,
  guessColumns,
  toNumber,
  toString as toStr,
  type ParsedExcel,
  type ColumnGuess,
} from "@/lib/excel-parser";
import type { SyncPreviewItem, KyteOnlyItem } from "@/app/api/admin/sync/route";

// ── Tipos del backend ────────────────────────────────────────────────────────

type Summary = {
  total: number;
  toUpdate: number;
  noChange: number;
  notFound: number;
  zeroPrice: number;
  noCode: number;
  onlyInStore: number;
};

type ActionResult = {
  success: number;
  failed: number;
  errors: Array<{ code: string; error: string }>;
};

type SyncResponse = {
  preview: SyncPreviewItem[];
  summary: Summary;
  kyteOnly: KyteOnlyItem[];
  applied?: ActionResult;
  created?: ActionResult;
  error?: string;
};

type Tab = "update" | "create" | "only-store" | "all";

// ── localStorage para persistir mapeo entre cargas del mismo distribuidor ────

const MAPPING_KEY = "sync-column-mapping-v1";

function loadSavedMapping(): Partial<ColumnGuess> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(MAPPING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveMapping(m: ColumnGuess) {
  try {
    localStorage.setItem(MAPPING_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

// ── Componente principal ────────────────────────────────────────────────────

export default function SyncPage() {
  const tenantId = useTenantId();

  // Categorías (para el tab "Crear nuevos")
  const [categories, setCategories] = useState<Category[]>([]);
  useEffect(() => {
    supabase
      .from("categories")
      .select("*")
      .eq("company_id", tenantId)
      .order("name")
      .then(({ data }) => setCategories((data as Category[]) ?? []));
  }, [tenantId]);

  // Archivo + parseo
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedExcel | null>(null);
  const [parseError, setParseError] = useState("");

  // Mapeo de columnas
  const [mapping, setMapping] = useState<ColumnGuess>({
    code: null,
    name: null,
    price: null,
    costPrice: null,
    category: null,
    description: null,
    stock: null,
  });

  // Filtros del Excel
  const [filterRubroZ, setFilterRubroZ] = useState(true);
  // Opciones de update (qué pisar)
  const [updateName, setUpdateName] = useState(false);
  const [updateCostPrice, setUpdateCostPrice] = useState(false);
  const [updateDescription, setUpdateDescription] = useState(false);

  // Estado de la API
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<SyncPreviewItem[] | null>(null);
  const [kyteOnly, setKyteOnly] = useState<KyteOnlyItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [applyResult, setApplyResult] = useState<ActionResult | null>(null);
  const [createResult, setCreateResult] = useState<ActionResult | null>(null);

  // UI
  const [tab, setTab] = useState<Tab>("update");
  const [searchFilter, setSearchFilter] = useState("");

  // Selección por código (para apply / create selectivos)
  const [selectedUpdate, setSelectedUpdate] = useState<Set<string>>(new Set());
  const [selectedCreate, setSelectedCreate] = useState<Set<string>>(new Set());
  const [createCategoryByCode, setCreateCategoryByCode] = useState<Record<string, string>>({});

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setParsed(null);
    setParseError("");
    setPreview(null);
    setSummary(null);
    setKyteOnly([]);
    setApplyResult(null);
    setCreateResult(null);
    setError("");
    setSelectedUpdate(new Set());
    setSelectedCreate(new Set());
    setCreateCategoryByCode({});

    if (!f) return;
    try {
      const result = await parseExcelFile(f);
      setParsed(result);

      // Auto-detect columnas, pero priorizamos lo que el user usó la última vez
      // si el mapping guardado todavía existe en los headers actuales.
      const guessed = guessColumns(result.headers);
      const saved = loadSavedMapping();
      const finalMapping: ColumnGuess = { ...guessed };
      if (saved) {
        for (const k of Object.keys(saved) as Array<keyof ColumnGuess>) {
          const v = saved[k];
          if (v && result.headers.includes(v)) {
            finalMapping[k] = v;
          }
        }
      }
      setMapping(finalMapping);
    } catch (err) {
      setParseError(`No se pudo leer el archivo: ${(err as Error).message}`);
    }
  }

  // Filas del Excel ya filtradas por Rubro Z (según toggle).
  const filteredParsedRows = useMemo(() => {
    if (!parsed) return [];
    if (!filterRubroZ || !mapping.category) return parsed.rows;
    return parsed.rows.filter((row) => {
      const v = String(row[mapping.category!] ?? "").trim().toLowerCase();
      return v !== "z";
    });
  }, [parsed, mapping.category, filterRubroZ]);

  // Construye el payload `rows` para el backend.
  const buildRows = useCallback(() => {
    if (!parsed || !mapping.code || !mapping.price) return [];
    return filteredParsedRows.map((row) => ({
      code: toStr(row[mapping.code!]),
      name: mapping.name ? toStr(row[mapping.name]) : "",
      price: toNumber(row[mapping.price!]),
      costPrice: mapping.costPrice ? toNumber(row[mapping.costPrice]) : null,
      rubro: mapping.category ? toStr(row[mapping.category]) : null,
      description: mapping.description ? toStr(row[mapping.description]) : null,
    }));
  }, [parsed, mapping, filteredParsedRows]);

  async function callSync(action: "preview" | "apply" | "create") {
    setError("");
    if (!parsed) {
      setError("Cargá un Excel primero.");
      return;
    }
    if (!mapping.code || !mapping.price) {
      setError("Asigná las columnas de Código y Precio.");
      return;
    }

    if (action === "apply") setApplying(true);
    else if (action === "create") setCreating(true);
    else {
      setLoading(true);
      setPreview(null);
      setSummary(null);
      setKyteOnly([]);
      setApplyResult(null);
      setCreateResult(null);
    }

    saveMapping(mapping);

    try {
      const rows = buildRows();
      const payload: Record<string, unknown> = {
        rows,
        action,
        options: {
          updateName,
          updateCostPrice,
          updateDescription,
        },
      };
      if (action === "apply") {
        // Si hay selección, mandamos sólo esas; si no, todos los `willUpdate`.
        if (selectedUpdate.size > 0) {
          payload.applyCodes = Array.from(selectedUpdate);
        }
      }
      if (action === "create") {
        const list = Array.from(selectedCreate).map((code) => ({
          code,
          categoryId: createCategoryByCode[code] || null,
        }));
        payload.createList = list;
      }

      const res = await fetch("/api/admin/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data: SyncResponse = await res.json();
      if (!res.ok || data.error) {
        setError(data.error ?? `Error ${res.status}`);
        return;
      }

      setPreview(data.preview);
      setSummary(data.summary);
      setKyteOnly(data.kyteOnly ?? []);
      if (data.applied) setApplyResult(data.applied);
      if (data.created) setCreateResult(data.created);

      if (action === "preview") {
        // Por defecto, marcar todos los "willUpdate" y todos los "no encontrados" con suggestion.
        const willUpdateCodes = data.preview.filter((p) => p.willUpdate).map((p) => p.code);
        setSelectedUpdate(new Set(willUpdateCodes));
        const notFound = data.preview.filter((p) => p.reason === "No encontrado en la tienda" && p.newPrice > 0);
        // No los marcamos por defecto para crear — el user debe optar in
        setSelectedCreate(new Set());
        const catMap: Record<string, string> = {};
        for (const r of notFound) {
          if (r.suggestedCategoryId) catMap[r.code] = r.suggestedCategoryId;
        }
        setCreateCategoryByCode(catMap);
      }
    } catch (e) {
      setError(`Error de red: ${(e as Error).message}`);
    } finally {
      setLoading(false);
      setApplying(false);
      setCreating(false);
    }
  }

  // ── Tabs / filtrado ──────────────────────────────────────────────────────

  const tabRows = useMemo(() => {
    if (!preview) return [];
    let base: SyncPreviewItem[];
    switch (tab) {
      case "update":
        base = preview.filter((p) => p.willUpdate);
        break;
      case "create":
        base = preview.filter((p) => p.reason === "No encontrado en la tienda" && p.newPrice > 0);
        break;
      case "only-store":
        base = []; // se renderiza distinto
        break;
      case "all":
      default:
        base = preview;
        break;
    }
    if (searchFilter.trim()) {
      const q = searchFilter.trim().toLowerCase();
      base = base.filter(
        (p) =>
          p.code.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          p.storeName.toLowerCase().includes(q)
      );
    }
    return base;
  }, [preview, tab, searchFilter]);

  const onlyStoreFiltered = useMemo(() => {
    if (!searchFilter.trim()) return kyteOnly;
    const q = searchFilter.trim().toLowerCase();
    return kyteOnly.filter(
      (p) =>
        p.code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }, [kyteOnly, searchFilter]);

  // ── Render ───────────────────────────────────────────────────────────────

  const mappingMissing = !mapping.code || !mapping.price;
  const totalSelectedUpdate = selectedUpdate.size;
  const totalSelectedCreate = selectedCreate.size;

  return (
    <div className="p-6 md:p-8 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Importar lista de precios</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Subí el Excel del distribuidor, asigná las columnas y aplicá los cambios.
        </p>
      </div>

      {/* ── Step 1: file input ───────────────────────────────────────────── */}
      <Section title="1. Archivo" subtitle=".xls, .xlsx — se detectan los headers automáticamente">
        <div className="flex items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".xls,.xlsx"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            Seleccionar archivo
          </Button>
          {file ? (
            <span className="text-sm text-gray-700 truncate max-w-md">
              <span className="font-medium">{file.name}</span>
              {parsed && (
                <span className="text-gray-400 ml-2">
                  · {parsed.rows.length} filas · header en fila {parsed.headerRowIndex + 1}
                </span>
              )}
            </span>
          ) : (
            <span className="text-sm text-gray-400">Ningún archivo seleccionado</span>
          )}
        </div>
        {parseError && <ErrorBox>{parseError}</ErrorBox>}
      </Section>

      {/* ── Step 2: column mapping ───────────────────────────────────────── */}
      {parsed && (
        <Section
          title="2. Mapeo de columnas"
          subtitle="Asigná qué columna del Excel corresponde a cada campo. Código y Precio son obligatorios."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <ColumnSelect
              label="Código *"
              value={mapping.code}
              onChange={(v) => setMapping({ ...mapping, code: v })}
              headers={parsed.headers}
              required
            />
            <ColumnSelect
              label="Precio venta *"
              value={mapping.price}
              onChange={(v) => setMapping({ ...mapping, price: v })}
              headers={parsed.headers}
              required
            />
            <ColumnSelect
              label="Nombre / descripción"
              value={mapping.name}
              onChange={(v) => setMapping({ ...mapping, name: v })}
              headers={parsed.headers}
            />
            <ColumnSelect
              label="Precio costo"
              value={mapping.costPrice}
              onChange={(v) => setMapping({ ...mapping, costPrice: v })}
              headers={parsed.headers}
            />
            <ColumnSelect
              label="Rubro / categoría"
              value={mapping.category}
              onChange={(v) => setMapping({ ...mapping, category: v })}
              headers={parsed.headers}
            />
            <ColumnSelect
              label="Descripción larga"
              value={mapping.description}
              onChange={(v) => setMapping({ ...mapping, description: v })}
              headers={parsed.headers}
            />
          </div>

          {/* Filtros */}
          {mapping.category && (
            <label className="flex items-center gap-2 text-sm text-gray-700 mt-4 cursor-pointer">
              <input
                type="checkbox"
                checked={filterRubroZ}
                onChange={(e) => setFilterRubroZ(e.target.checked)}
              />
              Ignorar filas con rubro = <span className="font-mono">Z</span> ({" "}
              {parsed.rows.length - filteredParsedRows.length} filas)
            </label>
          )}

          {/* Opciones de update */}
          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Al actualizar, también pisar:
            </p>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={updateName}
                  onChange={(e) => setUpdateName(e.target.checked)}
                  disabled={!mapping.name}
                />
                <span className={!mapping.name ? "text-gray-300" : ""}>Nombre</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={updateCostPrice}
                  onChange={(e) => setUpdateCostPrice(e.target.checked)}
                  disabled={!mapping.costPrice}
                />
                <span className={!mapping.costPrice ? "text-gray-300" : ""}>Precio costo</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={updateDescription}
                  onChange={(e) => setUpdateDescription(e.target.checked)}
                  disabled={!mapping.description}
                />
                <span className={!mapping.description ? "text-gray-300" : ""}>Descripción</span>
              </label>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Si todo está apagado, sólo se actualiza el precio (modo histórico).
            </p>
          </div>

          {/* Vista previa de las primeras filas */}
          {parsed.rows.length > 0 && (
            <details className="mt-4 group">
              <summary className="cursor-pointer text-sm text-gray-600 hover:text-gray-900 select-none">
                Ver primeras filas del Excel
              </summary>
              <div className="mt-3 bg-gray-50 rounded-lg overflow-x-auto max-h-64">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-100">
                      {parsed.headers.map((h) => (
                        <th key={h} className="px-2 py-1 text-left text-gray-700 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-t border-gray-200">
                        {parsed.headers.map((h) => (
                          <td key={h} className="px-2 py-1 text-gray-600 max-w-[160px] truncate">
                            {row[h] == null ? "—" : String(row[h])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </Section>
      )}

      {/* ── Step 3: actions ──────────────────────────────────────────────── */}
      {parsed && (
        <Section title="3. Comparar con la tienda">
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => callSync("preview")}
              disabled={loading || applying || creating || mappingMissing}
              className="bg-[#1a1a2e] hover:bg-[#16213e] text-white"
            >
              {loading ? "Procesando…" : "Vista previa"}
            </Button>
            {summary && summary.toUpdate > 0 && !applyResult && (
              <Button
                onClick={() => callSync("apply")}
                disabled={applying || loading || creating || totalSelectedUpdate === 0}
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                {applying
                  ? "Aplicando…"
                  : totalSelectedUpdate === summary.toUpdate
                  ? `Actualizar ${summary.toUpdate} cambios`
                  : `Actualizar ${totalSelectedUpdate} seleccionados`}
              </Button>
            )}
            {summary && summary.notFound > 0 && !createResult && totalSelectedCreate > 0 && (
              <Button
                onClick={() => callSync("create")}
                disabled={creating || loading || applying}
                variant="outline"
                className="border-blue-300 text-blue-700 hover:bg-blue-50"
              >
                {creating ? "Creando…" : `Crear ${totalSelectedCreate} productos`}
              </Button>
            )}
          </div>

          {error && <ErrorBox className="mt-3">{error}</ErrorBox>}
        </Section>
      )}

      {/* ── Result banners ───────────────────────────────────────────────── */}
      {applyResult && <ResultBanner kind="apply" result={applyResult} />}
      {createResult && <ResultBanner kind="create" result={createResult} />}

      {/* ── Summary cards + tabs + table ─────────────────────────────────── */}
      {summary && preview && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            <Stat label="En archivo" value={summary.total} />
            <Stat label="A actualizar" value={summary.toUpdate} accent="orange" />
            <Stat label="Sin cambio" value={summary.noChange} />
            <Stat label="A crear" value={summary.notFound} accent="blue" />
            <Stat label="Sólo en tienda" value={summary.onlyInStore} accent="gray" />
            <Stat label="Precio $0" value={summary.zeroPrice} />
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <TabButton active={tab === "update"} onClick={() => setTab("update")}>
              A actualizar ({summary.toUpdate})
            </TabButton>
            <TabButton active={tab === "create"} onClick={() => setTab("create")}>
              A crear ({summary.notFound})
            </TabButton>
            <TabButton active={tab === "only-store"} onClick={() => setTab("only-store")}>
              Sólo en tienda ({summary.onlyInStore})
            </TabButton>
            <TabButton active={tab === "all"} onClick={() => setTab("all")}>
              Todo ({preview.length})
            </TabButton>
            <Input
              placeholder="Filtrar por código o nombre…"
              className="ml-auto w-48"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
            />
          </div>

          {/* Tablas según tab */}
          {tab === "only-store" ? (
            <OnlyStoreTable items={onlyStoreFiltered} />
          ) : tab === "create" ? (
            <CreateTable
              items={tabRows}
              categories={categories}
              selected={selectedCreate}
              onToggle={(code) => {
                const next = new Set(selectedCreate);
                if (next.has(code)) next.delete(code);
                else next.add(code);
                setSelectedCreate(next);
              }}
              onToggleAll={(checked) => {
                if (checked) setSelectedCreate(new Set(tabRows.map((r) => r.code)));
                else setSelectedCreate(new Set());
              }}
              categoryByCode={createCategoryByCode}
              onCategoryChange={(code, catId) =>
                setCreateCategoryByCode({ ...createCategoryByCode, [code]: catId })
              }
            />
          ) : (
            <UpdateTable
              items={tabRows}
              selectable={tab === "update"}
              selected={selectedUpdate}
              onToggle={(code) => {
                const next = new Set(selectedUpdate);
                if (next.has(code)) next.delete(code);
                else next.add(code);
                setSelectedUpdate(next);
              }}
              onToggleAll={(checked) => {
                if (checked) setSelectedUpdate(new Set(tabRows.filter((r) => r.willUpdate).map((r) => r.code)));
                else setSelectedUpdate(new Set());
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

// ── Subcomponentes ───────────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl ring-1 ring-foreground/10 p-5 mb-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function ColumnSelect({
  label,
  value,
  onChange,
  headers,
  required = false,
}: {
  label: string;
  value: string | null;
  onChange: (v: string | null) => void;
  headers: string[];
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 mb-1">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className={`w-full px-2 py-1.5 text-sm border rounded-lg bg-white ${
          required && !value ? "border-orange-300 ring-1 ring-orange-200" : "border-gray-200"
        }`}
      >
        <option value="">— ninguna —</option>
        {headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </label>
  );
}

function ErrorBox({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 ${className}`}>
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "orange" | "blue" | "gray";
}) {
  const colorMap: Record<string, string> = {
    orange: "text-orange-600",
    blue: "text-blue-600",
    gray: "text-gray-500",
  };
  const cls = accent ? colorMap[accent] : "text-gray-900";
  return (
    <div className="bg-white rounded-xl ring-1 ring-foreground/10 px-3 py-2">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className={`text-xl font-bold ${cls}`}>{value}</p>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition border ${
        active
          ? "bg-[#1a1a2e] text-white border-[#1a1a2e]"
          : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
      }`}
    >
      {children}
    </button>
  );
}

function ResultBanner({ kind, result }: { kind: "apply" | "create"; result: ActionResult }) {
  const ok = result.failed === 0;
  const title =
    kind === "apply"
      ? ok ? "Actualización completada" : "Actualización con errores"
      : ok ? "Productos creados correctamente" : "Creación con errores";
  const verb = kind === "apply" ? "actualizados" : "creados";

  return (
    <div
      className={`rounded-xl p-4 mb-4 border ${
        ok ? "bg-green-50 border-green-200" : "bg-yellow-50 border-yellow-200"
      }`}
    >
      <p className="font-semibold text-gray-900 mb-1">{title}</p>
      <p className="text-sm text-gray-600">
        {result.success} productos {verb}
        {result.failed > 0 && `, ${result.failed} con error`}.
      </p>
      {result.errors.length > 0 && (
        <ul className="mt-2 text-xs text-red-700 space-y-1 max-h-32 overflow-y-auto">
          {result.errors.map((e, i) => (
            <li key={i}>
              <span className="font-mono">{e.code}</span> — {e.error}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UpdateTable({
  items,
  selectable,
  selected,
  onToggle,
  onToggleAll,
}: {
  items: SyncPreviewItem[];
  selectable: boolean;
  selected: Set<string>;
  onToggle: (code: string) => void;
  onToggleAll: (checked: boolean) => void;
}) {
  const allSelectable = items.filter((i) => i.willUpdate);
  const allSelected = allSelectable.length > 0 && allSelectable.every((i) => selected.has(i.code));

  return (
    <div className="bg-white rounded-xl ring-1 ring-foreground/10 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {selectable && (
                <th className="px-3 py-2 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => onToggleAll(e.target.checked)}
                  />
                </th>
              )}
              <th className="px-3 py-2 text-left font-medium text-gray-600 w-28">Código</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Nombre tienda</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">Actual</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">Nuevo</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">Diferencia</th>
              <th className="px-3 py-2 text-center font-medium text-gray-600">Estado</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={selectable ? 7 : 6} className="px-3 py-10 text-center text-gray-400">
                  No hay filas en esta vista
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.code + item.name} className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50">
                  {selectable && (
                    <td className="px-3 py-2">
                      {item.willUpdate && (
                        <input
                          type="checkbox"
                          checked={selected.has(item.code)}
                          onChange={() => onToggle(item.code)}
                        />
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{item.code || "—"}</td>
                  <td className="px-3 py-2 text-gray-700 max-w-[260px] truncate">
                    {item.storeName || <span className="text-gray-300">{item.name || "—"}</span>}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-500">
                    {item.currentPrice > 0 ? formatPrice(item.currentPrice) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-gray-900">
                    {item.newPrice > 0 ? formatPrice(item.newPrice) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-xs">
                    {item.willUpdate && item.currentPrice > 0 ? (
                      <span className={item.diff > 0 ? "text-orange-600 font-medium" : "text-green-600 font-medium"}>
                        {item.diff > 0 ? "+" : ""}
                        {formatPrice(item.diff)} ({item.diff > 0 ? "+" : ""}
                        {item.diffPct.toFixed(1)}%)
                      </span>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <StatusBadge item={item} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreateTable({
  items,
  categories,
  selected,
  onToggle,
  onToggleAll,
  categoryByCode,
  onCategoryChange,
}: {
  items: SyncPreviewItem[];
  categories: Category[];
  selected: Set<string>;
  onToggle: (code: string) => void;
  onToggleAll: (checked: boolean) => void;
  categoryByCode: Record<string, string>;
  onCategoryChange: (code: string, categoryId: string) => void;
}) {
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.code));

  return (
    <div className="bg-white rounded-xl ring-1 ring-foreground/10 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-3 py-2 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => onToggleAll(e.target.checked)}
                />
              </th>
              <th className="px-3 py-2 text-left font-medium text-gray-600 w-28">Código</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Nombre</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Rubro</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Categoría tienda</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">Precio</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-gray-400">
                  No hay productos a crear
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.code} className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(item.code)}
                      onChange={() => onToggle(item.code)}
                    />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{item.code}</td>
                  <td className="px-3 py-2 text-gray-700 max-w-[280px] truncate" title={item.name}>
                    {item.name}
                  </td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{item.rubro || "—"}</td>
                  <td className="px-3 py-2">
                    <select
                      value={categoryByCode[item.code] ?? ""}
                      onChange={(e) => onCategoryChange(item.code, e.target.value)}
                      className="px-2 py-1 text-xs border border-gray-200 rounded bg-white"
                    >
                      <option value="">— sin categoría —</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {item.suggestedCategoryId === c.id ? "  · sugerida" : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-gray-900">
                    {formatPrice(item.newPrice)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OnlyStoreTable({ items }: { items: KyteOnlyItem[] }) {
  return (
    <div className="bg-white rounded-xl ring-1 ring-foreground/10 overflow-hidden">
      <p className="px-3 py-2 text-xs text-gray-500 bg-gray-50 border-b border-gray-100">
        Productos que existen en la tienda pero no aparecen en este Excel.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="px-3 py-2 text-left font-medium text-gray-600 w-28">Código</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Nombre</th>
              <th className="px-3 py-2 text-left font-medium text-gray-600">Categoría</th>
              <th className="px-3 py-2 text-right font-medium text-gray-600">Precio actual</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-10 text-center text-gray-400">
                  Todo lo de la tienda está en el Excel
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-b border-gray-50 last:border-b-0 hover:bg-gray-50/50">
                  <td className="px-3 py-2 font-mono text-xs text-gray-500">{item.code}</td>
                  <td className="px-3 py-2 text-gray-700 max-w-[280px] truncate">{item.name}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{item.category || "—"}</td>
                  <td className="px-3 py-2 text-right font-medium text-gray-900">{formatPrice(item.price)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ item }: { item: SyncPreviewItem }) {
  if (item.willUpdate) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-orange-100 text-orange-700 border border-orange-200">
        Actualizar
      </span>
    );
  }
  if (item.reason === "No encontrado en la tienda") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-700 border border-blue-200">
        Crear nuevo
      </span>
    );
  }
  if (item.reason === "Precio cero (ignorado)") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500 border border-gray-200">
        Precio $0
      </span>
    );
  }
  if (item.reason === "Sin código") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-500 border border-gray-200">
        Sin código
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-green-100 text-green-700 border border-green-200">
      Sin cambio
    </span>
  );
}
