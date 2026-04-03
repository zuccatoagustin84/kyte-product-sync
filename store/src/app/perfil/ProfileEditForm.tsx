"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { updateProfile } from "@/lib/auth-client";

interface Props {
  userId: string;
  initialName: string | null;
  initialCompany: string | null;
  initialPhone: string | null;
}

export default function ProfileEditForm({
  userId,
  initialName,
  initialCompany,
  initialPhone,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName ?? "");
  const [company, setCompany] = useState(initialCompany ?? "");
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setLoading(true);
    setError(null);
    setSuccess(false);

    const { error } = await updateProfile(userId, {
      full_name: name.trim() || null,
      company: company.trim() || null,
      phone: phone.trim() || null,
    });

    if (error) {
      setError("No se pudo guardar. Intentá de nuevo.");
    } else {
      setSuccess(true);
      setEditing(false);
    }
    setLoading(false);
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-400 uppercase font-medium mb-0.5">
              Empresa / Negocio
            </p>
            <p className="text-gray-800">
              {initialCompany ?? (
                <span className="text-gray-400 italic">No especificado</span>
              )}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400 uppercase font-medium mb-0.5">
              Teléfono
            </p>
            <p className="text-gray-800">
              {initialPhone ?? (
                <span className="text-gray-400 italic">No especificado</span>
              )}
            </p>
          </div>
        </div>

        {success && (
          <p className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            Datos guardados correctamente.
          </p>
        )}

        <button
          onClick={() => setEditing(true)}
          className="self-start text-sm font-medium hover:underline"
          style={{ color: "var(--brand)" }}
        >
          Editar datos
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-gray-400 uppercase font-medium">
            Nombre completo
          </label>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Juan Pérez"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-gray-400 uppercase font-medium">
            Empresa / Negocio
          </label>
          <Input
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Nombre del negocio"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs text-gray-400 uppercase font-medium">
            Teléfono
          </label>
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+54 9 11 1234-5678"
          />
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={loading}
          className="px-4 h-9 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-60"
          style={{ backgroundColor: "var(--brand)" }}
        >
          {loading ? "Guardando..." : "Guardar"}
        </button>
        <button
          onClick={() => setEditing(false)}
          disabled={loading}
          className="px-4 h-9 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
