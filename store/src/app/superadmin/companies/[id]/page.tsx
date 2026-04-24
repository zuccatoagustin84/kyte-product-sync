"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

type Company = {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  primary_domain: string | null;
  contact_email: string | null;
  whatsapp_number: string | null;
  created_at: string;
};

type Staff = { id: string; full_name: string | null; role: string };

type DetailResponse = {
  company: Company;
  stats: { products: number; orders: number };
  staff: Staff[];
};

export default function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Edit form state
  const [name, setName] = useState("");
  const [primaryDomain, setPrimaryDomain] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);

  // Invite admin form
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "operador">("admin");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState("");
  const [inviteErr, setInviteErr] = useState("");

  async function load() {
    setLoading(true);
    const res = await fetch(`/api/superadmin/companies/${id}`);
    if (!res.ok) {
      setError((await res.json()).error ?? "Error");
      setLoading(false);
      return;
    }
    const body: DetailResponse = await res.json();
    setData(body);
    setName(body.company.name);
    setPrimaryDomain(body.company.primary_domain ?? "");
    setContactEmail(body.company.contact_email ?? "");
    setWhatsapp(body.company.whatsapp_number ?? "");
    setActive(body.company.is_active);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveOk(false);
    const res = await fetch(`/api/superadmin/companies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        primary_domain: primaryDomain || null,
        contact_email: contactEmail || null,
        whatsapp_number: whatsapp || null,
        is_active: active,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Error al guardar");
      return;
    }
    setSaveOk(true);
    load();
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setInviteMsg("");
    setInviteErr("");
    const res = await fetch(`/api/superadmin/companies/${id}/admins`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: inviteEmail,
        password: invitePassword || undefined,
        full_name: inviteName || undefined,
        role: inviteRole,
      }),
    });
    setInviting(false);
    const body = await res.json();
    if (!res.ok) {
      setInviteErr(body.error ?? "Error");
      return;
    }
    setInviteMsg(
      body.created
        ? `Usuario creado y asignado como ${body.role}.`
        : `Usuario existente promovido a ${body.role}.`
    );
    setInviteEmail("");
    setInvitePassword("");
    setInviteName("");
    load();
  }

  if (loading) {
    return <div className="p-8 text-gray-400">Cargando...</div>;
  }
  if (error || !data) {
    return <div className="p-8 text-red-600">{error || "No data"}</div>;
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      <div className="mb-6">
        <Link
          href="/superadmin/companies"
          className="text-sm text-purple-600 hover:underline"
        >
          ← Volver
        </Link>
        <div className="flex items-center gap-3 mt-2">
          <h1 className="text-2xl font-bold text-gray-900">
            {data.company.name}
          </h1>
          <Badge variant={data.company.is_active ? "default" : "secondary"}>
            {data.company.is_active ? "Activa" : "Inactiva"}
          </Badge>
        </div>
        <p className="text-gray-500 mt-1 font-mono text-sm">
          slug: {data.company.slug}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className="p-4">
          <div className="text-xs uppercase text-gray-500 tracking-wider">
            Productos
          </div>
          <div className="text-xl font-bold mt-1">{data.stats.products}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-gray-500 tracking-wider">
            Pedidos
          </div>
          <div className="text-xl font-bold mt-1">{data.stats.orders}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs uppercase text-gray-500 tracking-wider">
            Staff
          </div>
          <div className="text-xl font-bold mt-1">{data.staff.length}</div>
        </Card>
      </div>

      {/* Edit form */}
      <Card className="p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Editar</h2>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label
              htmlFor="edit-name"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Nombre
            </label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label
              htmlFor="edit-domain"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Dominio custom
            </label>
            <Input
              id="edit-domain"
              value={primaryDomain}
              onChange={(e) => setPrimaryDomain(e.target.value)}
              placeholder="tienda.cliente.com"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="edit-email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Email
              </label>
              <Input
                id="edit-email"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>
            <div>
              <label
                htmlFor="edit-whatsapp"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                WhatsApp
              </label>
              <Input
                id="edit-whatsapp"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="edit-active"
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            <label htmlFor="edit-active" className="text-sm text-gray-700">
              Company activa
            </label>
          </div>

          {saveOk && (
            <p className="text-sm text-green-600">Cambios guardados.</p>
          )}
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={saving}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </form>
      </Card>

      {/* Staff list */}
      <Card className="p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Staff</h2>
        {data.staff.length === 0 ? (
          <p className="text-sm text-gray-400">
            No hay admins/operadores asignados todavía.
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {data.staff.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0"
              >
                <span className="text-gray-800">
                  {s.full_name ?? "(sin nombre)"}
                </span>
                <Badge
                  variant={s.role === "admin" ? "default" : "secondary"}
                >
                  {s.role}
                </Badge>
              </li>
            ))}
          </ul>
        )}

        <Separator className="my-5" />

        <h3 className="text-sm font-semibold text-gray-900 mb-3">
          Asignar nuevo admin / operador
        </h3>
        <form onSubmit={handleInvite} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="invite-email"
                className="block text-xs font-medium text-gray-700 mb-1"
              >
                Email
              </label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label
                htmlFor="invite-role"
                className="block text-xs font-medium text-gray-700 mb-1"
              >
                Rol
              </label>
              <select
                id="invite-role"
                value={inviteRole}
                onChange={(e) =>
                  setInviteRole(e.target.value as "admin" | "operador")
                }
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none"
              >
                <option value="admin">admin</option>
                <option value="operador">operador</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="invite-name"
                className="block text-xs font-medium text-gray-700 mb-1"
              >
                Nombre (opcional)
              </label>
              <Input
                id="invite-name"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
              />
            </div>
            <div>
              <label
                htmlFor="invite-password"
                className="block text-xs font-medium text-gray-700 mb-1"
              >
                Password (sólo si es nuevo)
              </label>
              <Input
                id="invite-password"
                type="password"
                value={invitePassword}
                onChange={(e) => setInvitePassword(e.target.value)}
                placeholder="mín 8 chars"
              />
            </div>
          </div>
          {inviteMsg && (
            <p className="text-sm text-green-600">{inviteMsg}</p>
          )}
          {inviteErr && (
            <p className="text-sm text-red-600">{inviteErr}</p>
          )}
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={inviting}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {inviting ? "Asignando..." : "Asignar"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
