"use client";

import { useState, useRef, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { parseSourceExcel, runMatching, type MatchRow, type UpdateEntry } from "@/lib/excel";
import { parseKyteToken } from "@/lib/kyte";
import type { KyteProduct } from "@/lib/kyte";

// ── Types ────────────────────────────────────────────────────────────────────

interface TokenInfo {
  uid: string;
  aid: string;
  exp?: Date;
}

// ── Token Panel ──────────────────────────────────────────────────────────────

function TokenPanel({
  tokenInfo,
  onTokenChange,
}: {
  tokenInfo: TokenInfo | null;
  onTokenChange: (token: string) => void;
}) {
  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Kyte Token</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          F12 → Console →{" "}
          <code
            className="bg-green-50 text-green-700 px-1 py-0.5 rounded text-xs font-mono cursor-pointer select-all border border-green-200"
            onClick={(e) => {
              const sel = window.getSelection();
              const range = document.createRange();
              range.selectNodeContents(e.currentTarget);
              sel?.removeAllRanges();
              sel?.addRange(range);
              navigator.clipboard.writeText(e.currentTarget.innerText).catch(() => {});
            }}
            title="Click para copiar"
          >
            copy(localStorage.getItem(&apos;kyte_token&apos;))
          </code>
        </p>
        <Textarea
          placeholder="Pegar token acá..."
          className="font-mono text-xs h-20 resize-none"
          onChange={(e) => onTokenChange(e.target.value.trim())}
        />
        {tokenInfo && (
          <div className="flex gap-2 flex-wrap">
            <Badge variant="outline" className="text-xs">
              aid: {tokenInfo.aid.slice(0, 8)}…
            </Badge>
            {tokenInfo.exp && (
              <Badge variant="outline" className="text-xs">
                Expira: {tokenInfo.exp.toLocaleDateString("es-AR")}
              </Badge>
            )}
            <Badge className="text-xs bg-green-600">Conectado</Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-lg border p-3 text-center ${color}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

// ── Match Table ──────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
  ACTUALIZAR: "bg-amber-50 text-amber-800",
  "SIN MATCH": "bg-red-50 text-red-700",
  "SIN CODIGO": "bg-gray-100 text-gray-600",
  "PRECIO 0": "bg-red-50 text-red-700",
  OK: "bg-green-50 text-green-700",
};

function MatchTable({ rows, filter }: { rows: MatchRow[]; filter?: string }) {
  const visible = filter
    ? rows.filter((r) => !filter || r.estado === filter)
    : rows;

  if (!visible.length)
    return <p className="text-sm text-muted-foreground py-4 text-center">Sin resultados</p>;

  const fmt = (v: number | null) =>
    v == null ? "" : "$" + Math.round(v).toLocaleString("es-AR");

  return (
    <div className="overflow-auto max-h-96 text-xs">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-white z-10 shadow-sm">
          <tr className="text-left">
            {["Estado", "Nombre", "Código", "P.Kyte", "P.Nuevo", "Dif", "Dif%", "Categoría"].map(
              (h) => (
                <th key={h} className="px-2 py-1.5 font-semibold border-b whitespace-nowrap">
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {visible.map((r, i) => (
            <tr key={i} className={`border-b ${STATUS_STYLE[r.estado] ?? ""}`}>
              <td className="px-2 py-1 font-medium whitespace-nowrap">{r.estado}</td>
              <td className="px-2 py-1 max-w-48 truncate" title={r.nombre}>{r.nombre}</td>
              <td className="px-2 py-1 font-mono">{r.codigo}</td>
              <td className="px-2 py-1 text-right">{fmt(r.precioKyte)}</td>
              <td className="px-2 py-1 text-right font-semibold">{fmt(r.precioNuevo)}</td>
              <td className="px-2 py-1 text-right">{fmt(r.diferencia)}</td>
              <td className="px-2 py-1 text-right">{r.difPct}</td>
              <td className="px-2 py-1 text-muted-foreground">{r.categoria}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Sync Tab ─────────────────────────────────────────────────────────────────

function SyncTab({ token, tokenInfo }: { token: string; tokenInfo: TokenInfo | null }) {
  const [updateCost, setUpdateCost] = useState(true);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [updates, setUpdates] = useState<UpdateEntry[]>([]);
  const [applyProgress, setApplyProgress] = useState(0);
  const [applying, setApplying] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const nUpdate = rows.filter((r) => r.estado === "ACTUALIZAR").length;
  const nOk = rows.filter((r) => r.estado === "OK").length;
  const nNoMatch = rows.filter((r) => ["SIN MATCH", "SIN CODIGO"].includes(r.estado)).length;
  const nZero = rows.filter((r) => r.estado === "PRECIO 0").length;

  const handleFile = useCallback(
    async (file: File) => {
      if (!token || !tokenInfo) {
        setStatus("Primero pegá el token de Kyte.");
        return;
      }
      setLoading(true);
      setRows([]);
      setUpdates([]);
      setConfirmed(false);
      try {
        // Parse Excel client-side
        setStatus("Leyendo Excel...");
        const buf = await file.arrayBuffer();
        const sourceRows = parseSourceExcel(buf);
        setStatus(`Excel: ${sourceRows.length} filas. Descargando productos de Kyte...`);

        // Fetch products server-side
        const res = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        setStatus(`${data.products.length} productos Kyte. Comparando...`);
        const { rows: matchRows, updates: matchUpdates } = runMatching(
          data.products,
          sourceRows,
          updateCost
        );
        setRows(matchRows);
        setUpdates(matchUpdates);
        setStatus(`Listo. ${matchUpdates.length} a actualizar.`);
      } catch (e) {
        setStatus(`Error: ${e}`);
      } finally {
        setLoading(false);
      }
    },
    [token, tokenInfo, updateCost]
  );

  const applyUpdates = useCallback(async () => {
    if (!updates.length) return;
    setApplying(true);
    setApplyProgress(0);
    let ok = 0;
    let failed = 0;

    for (let i = 0; i < updates.length; i++) {
      const u = updates[i];
      try {
        const res = await fetch("/api/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token,
            product: u.product,
            salePrice: u.salePrice,
            costPrice: u.costPrice,
          }),
        });
        if (res.ok) ok++;
        else failed++;
      } catch {
        failed++;
      }
      setApplyProgress(Math.round(((i + 1) / updates.length) * 100));
    }

    setApplying(false);
    setStatus(
      failed === 0
        ? `${ok} productos actualizados correctamente.`
        : `${ok} OK, ${failed} fallaron.`
    );
    setConfirmed(false);
  }, [updates, token]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button
          onClick={() => fileRef.current?.click()}
          disabled={loading || !tokenInfo}
          variant="outline"
        >
          Elegir Excel...
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={updateCost}
            onCheckedChange={(v) => setUpdateCost(Boolean(v))}
          />
          Actualizar costo también
        </label>
      </div>

      {status && <p className="text-sm text-muted-foreground">{status}</p>}
      {loading && <Progress className="h-1.5" value={null} />}

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-4 gap-3">
            <StatCard label="A actualizar" value={nUpdate} color="border-amber-200" />
            <StatCard label="Sin cambio" value={nOk} color="border-green-200" />
            <StatCard label="Sin match" value={nNoMatch} color="border-red-200" />
            <StatCard label="Precio 0" value={nZero} color="border-gray-200" />
          </div>

          <Tabs defaultValue="update">
            <TabsList>
              <TabsTrigger value="update">A Actualizar ({nUpdate})</TabsTrigger>
              <TabsTrigger value="nomatch">Sin Match ({nNoMatch})</TabsTrigger>
              <TabsTrigger value="all">Todo ({rows.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="update">
              <MatchTable rows={rows} filter="ACTUALIZAR" />
            </TabsContent>
            <TabsContent value="nomatch">
              <MatchTable
                rows={rows.filter((r) =>
                  ["SIN MATCH", "SIN CODIGO", "PRECIO 0"].includes(r.estado)
                )}
              />
            </TabsContent>
            <TabsContent value="all">
              <MatchTable rows={rows} />
            </TabsContent>
          </Tabs>

          <Separator />

          {nUpdate > 0 && (
            <div className="space-y-3">
              {applying && (
                <Progress value={applyProgress} className="h-2" />
              )}
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={confirmed}
                    onCheckedChange={(v) => setConfirmed(Boolean(v))}
                    disabled={applying}
                  />
                  Confirmo que quiero actualizar {nUpdate} productos en Kyte
                </label>
              </div>
              <Button
                onClick={applyUpdates}
                disabled={!confirmed || applying}
                className="bg-[#1a1a2e] hover:bg-[#16213e]"
              >
                {applying
                  ? `Actualizando... ${applyProgress}%`
                  : `APLICAR ${nUpdate} ACTUALIZACIONES`}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Catalog Tab ──────────────────────────────────────────────────────────────

function CatalogTab({ token, tokenInfo }: { token: string; tokenInfo: TokenInfo | null }) {
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCat, setSelectedCat] = useState<string>("__all__");
  const [showPrices, setShowPrices] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingCats, setLoadingCats] = useState(false);
  const [status, setStatus] = useState("");
  const [products, setProducts] = useState<KyteProduct[]>([]);

  const loadCategories = useCallback(async () => {
    if (!token) return;
    setLoadingCats(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const names = data.categories
        .map((c: { name: string }) => c.name)
        .filter(Boolean)
        .sort();
      setCategories(names);
      setStatus(`${names.length} categorías cargadas.`);
    } catch (e) {
      setStatus(`Error cargando categorías: ${e}`);
    } finally {
      setLoadingCats(false);
    }
  }, [token]);

  const generateCatalog = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setStatus("Descargando productos...");

    try {
      let prods = products;
      if (!prods.length) {
        const res = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        prods = data.products;
        setProducts(prods);
      }

      setStatus("Generando catálogo...");
      const res = await fetch("/api/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          products: prods,
          filterCategory: selectedCat === "__all__" ? undefined : selectedCat,
          showPrices,
          companyName: "MP.TOOLS MAYORISTA",
        }),
      });
      if (!res.ok) throw new Error(await res.text());

      const html = await res.text();
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const catSlug = selectedCat === "__all__" ? "completo" : selectedCat.replace(/\s+/g, "_");
      a.download = `catalogo_${catSlug}_${new Date().toISOString().slice(0, 10)}.html`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus("Catálogo descargado. Abrilo en Chrome y usá Ctrl+P para PDF.");
    } catch (e) {
      setStatus(`Error: ${e}`);
    } finally {
      setLoading(false);
    }
  }, [token, products, selectedCat, showPrices]);

  return (
    <div className="space-y-5">
      <div className="flex items-end gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Categoría</label>
          <div className="flex items-center gap-2">
            <Select value={selectedCat} onValueChange={(v) => setSelectedCat(v ?? "__all__")}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="Todas las categorías" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas las categorías</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={loadCategories}
              disabled={loadingCats || !tokenInfo}
            >
              {loadingCats ? "Cargando..." : "Cargar"}
            </Button>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm pb-0.5">
          <Checkbox
            checked={showPrices}
            onCheckedChange={(v) => setShowPrices(Boolean(v))}
          />
          Mostrar precios
        </label>
      </div>

      <Button
        onClick={generateCatalog}
        disabled={loading || !tokenInfo}
        className="bg-[#1a1a2e] hover:bg-[#16213e]"
      >
        {loading ? "Generando..." : "Generar y descargar catálogo HTML"}
      </Button>

      {loading && <Progress className="h-1.5" value={null} />}

      {status && (
        <p className="text-sm text-muted-foreground">{status}</p>
      )}

      <div className="rounded-lg bg-muted/40 border p-3 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Para imprimir / guardar como PDF:</p>
        <p>1. Abrir el HTML descargado en Chrome</p>
        <p>2. Ctrl+P → Guardar como PDF</p>
        <p>3. En configuración: activar &quot;Gráficos de fondo&quot; para conservar los colores</p>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [token, setToken] = useState("");
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);

  const handleTokenChange = useCallback((raw: string) => {
    setToken(raw);
    if (!raw) {
      setTokenInfo(null);
      return;
    }
    try {
      const { uid, aid, exp } = parseKyteToken(raw);
      setTokenInfo({ uid, aid, exp });
    } catch {
      setTokenInfo(null);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#f4f4f8]">
      {/* Header */}
      <header className="bg-[#1a1a2e] text-white px-6 py-4 flex items-center gap-3 shadow-md">
        <svg className="w-7 h-7 text-[#e94560]" viewBox="0 0 64 64" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 50l22-22"/>
          <path d="M36 28a10 10 0 1 0-10-10c0 2 .6 3.8 1.5 5.3L10 41a3 3 0 0 0 4.2 4.2L31.7 27.5A10 10 0 0 0 36 28z"/>
          <circle cx="46" cy="44" r="8"/>
          <path d="M46 38v-3M46 53v-3M40 44h-3M55 44h-3"/>
          <circle cx="46" cy="44" r="3"/>
        </svg>
        <div>
          <h1 className="font-bold text-lg leading-tight">Kyte Price Sync</h1>
          <p className="text-xs text-white/50">MP.TOOLS MAYORISTA</p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <TokenPanel tokenInfo={tokenInfo} onTokenChange={handleTokenChange} />

        <Card>
          <CardContent className="pt-5">
            <Tabs defaultValue="sync">
              <TabsList className="mb-4">
                <TabsTrigger value="sync">Sincronizar Precios</TabsTrigger>
                <TabsTrigger value="catalog">Catálogo de Productos</TabsTrigger>
              </TabsList>
              <TabsContent value="sync">
                <SyncTab token={token} tokenInfo={tokenInfo} />
              </TabsContent>
              <TabsContent value="catalog">
                <CatalogTab token={token} tokenInfo={tokenInfo} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
