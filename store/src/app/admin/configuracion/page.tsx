"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SettingsIcon, PaletteIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type Settings = {
  allow_public_signup: boolean;
  require_login_for_orders: boolean;
  require_login_for_catalog: boolean;
};

export default function ConfiguracionPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((b) => setSettings(b.settings))
      .catch(() => setError("No se pudo cargar la configuración"))
      .finally(() => setLoading(false));
  }, []);

  async function toggle(key: keyof Settings, value: boolean) {
    if (!settings) return;
    setSaving(key);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "No se pudo guardar");
        return;
      }
      setSettings(body.settings);
      if (body.warnings?.length) {
        setMsg(`Guardado con advertencia: ${body.warnings.join(" · ")}`);
      } else {
        setMsg("Guardado");
        setTimeout(() => setMsg(null), 2500);
      }
    } catch {
      setError("Error de red");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      <div className="flex items-center gap-2 mb-6">
        <SettingsIcon size={24} className="text-gray-500" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
          <p className="text-gray-500 text-sm">Flags de la tienda</p>
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

      {loading || !settings ? (
        <div className="space-y-3">
          <div className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          <div className="h-20 bg-gray-100 rounded-xl animate-pulse" />
        </div>
      ) : (
        <div className="space-y-3">
          <Link
            href="/admin/configuracion/branding"
            className="block bg-white rounded-xl ring-1 ring-foreground/10 p-5 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <PaletteIcon size={20} className="text-orange-500" />
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">Branding</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Logo, paleta de colores y estilo de bordes
                </p>
              </div>
              <ChevronRightIcon size={18} className="text-gray-400" />
            </div>
          </Link>
          <ToggleRow
            title="Registro público abierto"
            description="Si está apagado, la página /registro queda bloqueada y sólo se puede crear usuarios desde el panel admin. Además, Supabase rechaza signups directos."
            checked={settings.allow_public_signup}
            saving={saving === "allow_public_signup"}
            onChange={(v) => toggle("allow_public_signup", v)}
            onLabel="Cualquiera puede registrarse"
            offLabel="Sólo por invitación del admin"
          />
          <ToggleRow
            title="Checkout requiere sesión"
            description="Si está encendido, los pedidos sólo pueden hacerlos usuarios logueados. El carrito redirige al login."
            checked={settings.require_login_for_orders}
            saving={saving === "require_login_for_orders"}
            onChange={(v) => toggle("require_login_for_orders", v)}
            onLabel="Hace falta iniciar sesión"
            offLabel="Checkout abierto como invitado"
          />
          <ToggleRow
            title="Catálogo privado"
            description="Si está encendido, sólo los usuarios logueados pueden ver el catálogo. Las páginas públicas redirigen al login."
            checked={settings.require_login_for_catalog}
            saving={saving === "require_login_for_catalog"}
            onChange={(v) => toggle("require_login_for_catalog", v)}
            onLabel="Catálogo privado, sólo logueados"
            offLabel="Catálogo público, abierto a todos"
          />
        </div>
      )}
    </div>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  saving,
  onChange,
  onLabel,
  offLabel,
}: {
  title: string;
  description: string;
  checked: boolean;
  saving: boolean;
  onChange: (v: boolean) => void;
  onLabel: string;
  offLabel: string;
}) {
  return (
    <div className="bg-white rounded-xl ring-1 ring-foreground/10 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500 mt-1">{description}</p>
          <p className={`text-xs mt-2 font-medium ${checked ? "text-green-700" : "text-gray-500"}`}>
            Estado actual: {checked ? onLabel : offLabel}
          </p>
        </div>
        <Button
          variant={checked ? "default" : "outline"}
          disabled={saving}
          onClick={() => onChange(!checked)}
          className={
            checked
              ? "bg-orange-500 hover:bg-orange-600 text-white border-0"
              : ""
          }
        >
          {saving ? "..." : checked ? "Activo" : "Apagado"}
        </Button>
      </div>
    </div>
  );
}
