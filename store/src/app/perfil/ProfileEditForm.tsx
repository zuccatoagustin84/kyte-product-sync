"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import type { Customer } from "@/lib/types";

interface Props {
  initialName: string | null;
  initialCompany: string | null;
  initialPhone: string | null;
  customer: Customer | null;
}

const TAX_CONDITIONS = [
  "Consumidor Final",
  "Responsable Inscripto",
  "Monotributista",
  "Exento",
];

export default function ProfileEditForm({
  initialName,
  initialCompany,
  initialPhone,
  customer,
}: Props) {
  const [editing, setEditing] = useState(false);

  // Profile fields
  const [name, setName] = useState(initialName ?? "");
  const [company, setCompany] = useState(initialCompany ?? "");
  const [phone, setPhone] = useState(initialPhone ?? "");

  // Customer fields (sólo si hay customer linkeado)
  const [docId, setDocId] = useState(customer?.doc_id ?? "");
  const [phoneAlt, setPhoneAlt] = useState(customer?.phone_alt ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [addressComplement, setAddressComplement] = useState(
    customer?.address_complement ?? ""
  );
  const [city, setCity] = useState(customer?.city ?? "");
  const [state, setState] = useState(customer?.state ?? "");
  const [taxCondition, setTaxCondition] = useState(customer?.tax_condition ?? "");

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setLoading(true);
    setError(null);
    setSuccess(false);

    const payload: {
      profile?: Record<string, string | null>;
      customer?: Record<string, string | null>;
    } = {
      profile: {
        full_name: name.trim() || null,
        company: company.trim() || null,
        phone: phone.trim() || null,
      },
    };

    if (customer) {
      payload.customer = {
        // El cliente puede actualizar su razón social desde acá
        name: company.trim() || name.trim() || null,
        doc_id: docId.trim() || null,
        phone: phone.trim() || null,
        phone_alt: phoneAlt.trim() || null,
        address: address.trim() || null,
        address_complement: addressComplement.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        tax_condition: taxCondition.trim() || null,
      };
    }

    try {
      const res = await fetch("/api/me/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "No se pudo guardar. Intentá de nuevo.");
      } else {
        setSuccess(true);
        setEditing(false);
      }
    } catch {
      setError("Error de red");
    } finally {
      setLoading(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <ReadField label="Empresa / Razón social" value={initialCompany} />
          <ReadField label="Teléfono" value={initialPhone} />
          {customer && (
            <>
              <ReadField label="CUIT / DNI" value={customer.doc_id} />
              <ReadField label="Tel. alternativo" value={customer.phone_alt} />
              <ReadField label="Dirección" value={customer.address} />
              <ReadField label="Dpto / Piso" value={customer.address_complement} />
              <ReadField label="Ciudad" value={customer.city} />
              <ReadField label="Provincia" value={customer.state} />
              <ReadField
                label="Condición frente al IVA"
                value={customer.tax_condition}
              />
            </>
          )}
        </div>

        {success && (
          <p className="text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            Datos guardados correctamente.
          </p>
        )}

        <button
          onClick={() => {
            setSuccess(false);
            setEditing(true);
          }}
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
        <EditField label="Nombre completo">
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Juan Pérez"
          />
        </EditField>
        <EditField label="Empresa / Razón social">
          <Input
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Nombre del negocio"
          />
        </EditField>
        <EditField label="Teléfono">
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+54 9 11 1234-5678"
          />
        </EditField>

        {customer && (
          <>
            <div className="h-px bg-gray-200 my-2" />
            <p className="text-xs text-gray-400 uppercase font-medium">
              Datos de facturación
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <EditField label="CUIT / DNI">
                <Input
                  type="text"
                  value={docId}
                  onChange={(e) => setDocId(e.target.value)}
                  placeholder="20-12345678-9"
                />
              </EditField>
              <EditField label="Tel. alternativo">
                <Input
                  type="tel"
                  value={phoneAlt}
                  onChange={(e) => setPhoneAlt(e.target.value)}
                  placeholder="Otro contacto"
                />
              </EditField>
            </div>

            <EditField label="Dirección">
              <Input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Av. Siempreviva 742"
              />
            </EditField>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <EditField label="Dpto / Piso">
                <Input
                  type="text"
                  value={addressComplement}
                  onChange={(e) => setAddressComplement(e.target.value)}
                  placeholder="2°B"
                />
              </EditField>
              <EditField label="Ciudad">
                <Input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Buenos Aires"
                />
              </EditField>
              <EditField label="Provincia">
                <Input
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="CABA"
                />
              </EditField>
            </div>

            <EditField label="Condición frente al IVA">
              <select
                value={taxCondition}
                onChange={(e) => setTaxCondition(e.target.value)}
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm focus-visible:border-ring outline-none"
              >
                <option value="">Sin especificar</option>
                {TAX_CONDITIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </EditField>
          </>
        )}
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

function ReadField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase font-medium mb-0.5">
        {label}
      </p>
      <p className="text-gray-800">
        {value ?? <span className="text-gray-400 italic">No especificado</span>}
      </p>
    </div>
  );
}

function EditField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs text-gray-400 uppercase font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}
