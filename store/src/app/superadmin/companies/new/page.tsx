"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function NewCompanyPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    slug: "",
    name: "",
    primary_domain: "",
    contact_email: "",
    whatsapp_number: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/superadmin/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Error al crear la company");
        return;
      }
      router.push(`/superadmin/companies/${body.company.id}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-2xl">
      <div className="mb-6">
        <Link
          href="/superadmin/companies"
          className="text-sm text-purple-600 hover:underline"
        >
          ← Volver
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">Nueva company</h1>
        <p className="text-gray-500 mt-1">
          Creá un tenant nuevo. El slug será el subdominio (slug.tutienda.com).
        </p>
      </div>

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="company-slug"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Slug <span className="text-red-500">*</span>
            </label>
            <Input
              id="company-slug"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              placeholder="ej: ferreteria-juan"
              required
            />
            <p className="text-xs text-gray-400 mt-1">
              Minúsculas, números y guiones (2-32 chars). Se usa como subdominio.
            </p>
          </div>

          <div>
            <label
              htmlFor="company-name"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Nombre <span className="text-red-500">*</span>
            </label>
            <Input
              id="company-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="ej: Ferretería Juan SRL"
              required
            />
          </div>

          <div>
            <label
              htmlFor="company-domain"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Dominio custom (opcional)
            </label>
            <Input
              id="company-domain"
              value={form.primary_domain}
              onChange={(e) =>
                setForm({ ...form, primary_domain: e.target.value })
              }
              placeholder="ej: tienda.ferreteriajuan.com"
            />
            <p className="text-xs text-gray-400 mt-1">
              Si el cliente trae su propio dominio. Hay que sumarlo en Vercel también.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="company-email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Email de contacto
              </label>
              <Input
                id="company-email"
                type="email"
                value={form.contact_email}
                onChange={(e) =>
                  setForm({ ...form, contact_email: e.target.value })
                }
              />
            </div>
            <div>
              <label
                htmlFor="company-whatsapp"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                WhatsApp
              </label>
              <Input
                id="company-whatsapp"
                value={form.whatsapp_number}
                onChange={(e) =>
                  setForm({ ...form, whatsapp_number: e.target.value })
                }
                placeholder="+5491155555555"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Link
              href="/superadmin/companies"
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50"
            >
              Cancelar
            </Link>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {submitting ? "Creando..." : "Crear company"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
