"use client";

import { useEffect, useRef, useState } from "react";
import { PaletteIcon, UploadIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Branding, BrandingStyle } from "@/lib/branding";

type State = {
  name: string;
  logo_url: string | null;
  branding: Branding;
  presets: Record<string, Branding>;
};

const STYLE_LABELS: Record<BrandingStyle, string> = {
  rounded: "Redondeado",
  square: "Cuadrado",
  modern: "Moderno",
};

const STYLE_DESC: Record<BrandingStyle, string> = {
  rounded: "Bordes amables, look clásico (default)",
  square: "Bordes mínimos, look industrial / técnico",
  modern: "Bordes generosos, look juvenil / app móvil",
};

const PRESET_LABELS: Record<string, string> = {
  mptools: "Naranja Mayorista",
  ocean: "Océano",
  forest: "Selva",
  midnight: "Medianoche",
  carbon: "Carbono",
  sunset: "Atardecer",
};

export default function BrandingPage() {
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/admin/branding")
      .then((r) => r.json())
      .then((b) => {
        if (b.error) setError(b.error);
        else setState(b);
      })
      .catch(() => setError("No se pudo cargar branding"))
      .finally(() => setLoading(false));
  }, []);

  function applyPreset(presetId: string) {
    if (!state) return;
    const p = state.presets[presetId];
    if (!p) return;
    setState({ ...state, branding: { ...p, preset: presetId } });
  }

  function patchBranding(patch: Partial<Branding>) {
    if (!state) return;
    setState({
      ...state,
      branding: { ...state.branding, ...patch, preset: "custom" },
    });
  }

  async function handleSave() {
    if (!state) return;
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: state.name,
          branding: state.branding,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "No se pudo guardar");
        return;
      }
      setMsg("Branding guardado. Recargá la página para ver los cambios completos.");
      setTimeout(() => setMsg(null), 5000);
    } catch {
      setError("Error de red");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(file: File) {
    if (!state) return;
    setUploading(true);
    setError(null);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/branding/logo", {
        method: "POST",
        body: fd,
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "No se pudo subir el logo");
        return;
      }
      setState({ ...state, logo_url: body.logo_url });
      setMsg("Logo actualizado");
      setTimeout(() => setMsg(null), 3000);
    } catch {
      setError("Error de red");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleLogoDelete() {
    if (!state) return;
    if (!confirm("¿Eliminar el logo actual?")) return;
    setUploading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/branding/logo", { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "No se pudo eliminar");
        return;
      }
      setState({ ...state, logo_url: null });
      setMsg("Logo eliminado");
      setTimeout(() => setMsg(null), 3000);
    } finally {
      setUploading(false);
    }
  }

  if (loading || !state) {
    return (
      <div className="p-6 md:p-8 max-w-4xl">
        <div className="h-8 w-40 bg-gray-100 rounded animate-pulse mb-4" />
        <div className="h-40 bg-gray-100 rounded-xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <div className="flex items-center gap-2 mb-6">
        <PaletteIcon size={24} className="text-gray-500" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Branding</h1>
          <p className="text-gray-500 text-sm">
            Logo, colores y estilo de tu tienda
          </p>
        </div>
      </div>

      {msg && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 text-green-700 text-sm px-3 py-2">
          {msg}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Nombre + logo */}
        <section className="bg-white rounded-xl ring-1 ring-foreground/10 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Identidad</h2>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-gray-500 uppercase tracking-wider font-medium">
              Nombre comercial
            </label>
            <Input
              type="text"
              value={state.name}
              onChange={(e) => setState({ ...state, name: e.target.value })}
              placeholder="MP Tools Mayorista"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs text-gray-500 uppercase tracking-wider font-medium">
              Logo
            </label>
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 flex items-center justify-center min-h-[100px]">
              {state.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={state.logo_url}
                  alt="Logo actual"
                  className="max-h-20 w-auto object-contain"
                />
              ) : (
                <p className="text-xs text-gray-400">Sin logo (se muestra el nombre)</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                <UploadIcon size={14} />
                {state.logo_url ? "Reemplazar" : "Subir logo"}
              </Button>
              {state.logo_url && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogoDelete}
                  disabled={uploading}
                  className="text-red-600 hover:bg-red-50"
                >
                  <Trash2Icon size={14} />
                  Quitar
                </Button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleLogoUpload(f);
                }}
              />
            </div>
            <p className="text-[11px] text-gray-400">
              Formato PNG/SVG con fondo transparente. Máx 2MB.
            </p>
          </div>
        </section>

        {/* Preview */}
        <section className="bg-white rounded-xl ring-1 ring-foreground/10 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Vista previa</h2>
          <BrandingPreview branding={state.branding} name={state.name} logoUrl={state.logo_url} />
        </section>
      </div>

      {/* Presets */}
      <section className="bg-white rounded-xl ring-1 ring-foreground/10 p-5 mt-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Paleta predefinida</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Object.entries(state.presets).map(([id, p]) => (
            <button
              key={id}
              type="button"
              onClick={() => applyPreset(id)}
              className={`text-left p-3 rounded-lg border transition-colors ${
                state.branding.preset === id
                  ? "border-orange-300 bg-orange-50/50 ring-2 ring-orange-100"
                  : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <Swatch color={p.brand} />
                <Swatch color={p.brand_dark} />
                <Swatch color={p.navy} />
                <Swatch color={p.navy_light} />
              </div>
              <p className="text-sm font-semibold text-gray-900">
                {PRESET_LABELS[id] ?? id}
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Estilo {STYLE_LABELS[p.style].toLowerCase()}
              </p>
            </button>
          ))}
        </div>
      </section>

      {/* Colores custom */}
      <section className="bg-white rounded-xl ring-1 ring-foreground/10 p-5 mt-4 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Personalizar colores</h2>
          <p className="text-xs text-gray-500 mt-1">
            Tocá un preset arriba o ajustá los valores acá. Cualquier cambio
            convierte el preset en &quot;custom&quot;.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ColorField
            label="Color principal (botones, badges)"
            value={state.branding.brand}
            onChange={(v) => patchBranding({ brand: v })}
          />
          <ColorField
            label="Variante oscura (hover)"
            value={state.branding.brand_dark}
            onChange={(v) => patchBranding({ brand_dark: v })}
          />
          <ColorField
            label="Header / sidebar"
            value={state.branding.navy}
            onChange={(v) => patchBranding({ navy: v })}
          />
          <ColorField
            label="Header secundario"
            value={state.branding.navy_light}
            onChange={(v) => patchBranding({ navy_light: v })}
          />
        </div>
      </section>

      {/* Estilo */}
      <section className="bg-white rounded-xl ring-1 ring-foreground/10 p-5 mt-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Estilo de bordes</h2>
        <div className="grid grid-cols-3 gap-3">
          {(["rounded", "modern", "square"] as BrandingStyle[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => patchBranding({ style: s })}
              className={`text-left p-3 border transition-colors ${
                state.branding.style === s
                  ? "border-orange-300 bg-orange-50/50"
                  : "border-gray-200 hover:bg-gray-50"
              } ${
                s === "rounded"
                  ? "rounded-lg"
                  : s === "modern"
                  ? "rounded-2xl"
                  : "rounded-sm"
              }`}
            >
              <p className="text-sm font-semibold text-gray-900">
                {STYLE_LABELS[s]}
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">{STYLE_DESC[s]}</p>
            </button>
          ))}
        </div>
      </section>

      {/* Save */}
      <div className="sticky bottom-0 mt-6 -mx-6 md:-mx-8 px-6 md:px-8 pt-4 pb-4 bg-gradient-to-t from-gray-100 via-gray-100/90 to-transparent">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-orange-500 hover:bg-orange-600 text-white border-0"
        >
          {saving ? "Guardando..." : "Guardar branding"}
        </Button>
      </div>
    </div>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <span
      className="inline-block size-5 rounded-full ring-1 ring-black/10"
      style={{ backgroundColor: color }}
    />
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-gray-500 uppercase tracking-wider font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="size-9 rounded-lg border border-gray-200 cursor-pointer"
        />
        <Input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono"
          maxLength={7}
        />
      </div>
    </div>
  );
}

function BrandingPreview({
  branding,
  name,
  logoUrl,
}: {
  branding: Branding;
  name: string;
  logoUrl: string | null;
}) {
  const radius =
    branding.style === "rounded"
      ? "10px"
      : branding.style === "modern"
      ? "16px"
      : "4px";
  return (
    <div
      className="overflow-hidden border border-gray-200"
      style={{ borderRadius: radius }}
    >
      <div
        className="h-12 flex items-center px-4 border-b-2"
        style={{
          backgroundColor: branding.navy,
          borderBottomColor: branding.brand,
        }}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={name} className="h-7 w-auto object-contain" />
        ) : (
          <span
            className="text-base font-extrabold tracking-wide"
            style={{ color: branding.brand }}
          >
            {name.toUpperCase()}
          </span>
        )}
      </div>
      <div className="p-4 bg-white space-y-3">
        <button
          type="button"
          className="px-3 py-2 text-white text-sm font-semibold border-0"
          style={{ backgroundColor: branding.brand, borderRadius: radius }}
        >
          Botón principal
        </button>
        <span
          className="inline-block ml-2 px-2 py-0.5 text-white text-xs font-bold"
          style={{ backgroundColor: branding.brand_dark, borderRadius: radius }}
        >
          BADGE
        </span>
        <p className="text-xs text-gray-500 mt-2">
          Tarjetas, inputs y todo el resto adoptan {branding.style === "rounded" ? "estos bordes redondeados" : branding.style === "modern" ? "estos bordes generosos" : "estos bordes mínimos"}.
        </p>
      </div>
    </div>
  );
}
