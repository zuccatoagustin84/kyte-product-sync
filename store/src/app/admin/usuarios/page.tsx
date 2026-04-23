"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ShieldCheckIcon,
  UserIcon,
  UsersIcon,
  ActivityIcon,
  PercentIcon,
  DollarSignIcon,
  ReceiptIcon,
  TrendingUpIcon,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatMoney } from "@/lib/format";
import type { UserPermissions } from "@/lib/types";

type Role = "admin" | "operador" | "user";

type UserRow = {
  id: string;
  full_name: string | null;
  company: string | null;
  phone: string | null;
  role: Role;
  email: string | null;
  permissions: UserPermissions;
};

type UserStats = {
  orders: number;
  total: number;
  avgTicket: number;
  commission: number;
  commission_rate: number;
  period_days: number;
};

const ROLE_OPTIONS: Role[] = ["admin", "operador", "user"];

const ROLE_BADGE: Record<Role, string> = {
  admin: "bg-red-100 text-red-800 border-red-200",
  operador: "bg-orange-100 text-orange-800 border-orange-200",
  user: "bg-gray-100 text-gray-600 border-gray-200",
};

const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  operador: "Operador",
  user: "Usuario",
};

const PERMISSION_META: {
  key: keyof Omit<UserPermissions, "user_id" | "commission_rate" | "updated_at" | "is_admin">;
  label: string;
  description: string;
}[] = [
  {
    key: "allow_personal_device",
    label: "Permitir usar dispositivo personal",
    description: "Puede acceder desde su propio celular o tablet",
  },
  {
    key: "view_other_users_transactions",
    label: "Ver transacciones de otros usuarios",
    description: "Acceso a ventas y movimientos de todo el equipo",
  },
  {
    key: "give_discounts",
    label: "Dar descuentos",
    description: "Aplicar descuentos en línea o en el total",
  },
  {
    key: "register_products",
    label: "Registrar productos",
    description: "Crear, editar y eliminar productos del catálogo",
  },
  {
    key: "manage_stock",
    label: "Administrar stock",
    description: "Ajustar inventario y ver movimientos de stock",
  },
  {
    key: "enable_pay_later",
    label: "Permitir ventas a crédito",
    description: "Vender sin cobro inmediato (cuenta corriente)",
  },
  {
    key: "manage_expenses",
    label: "Administrar gastos/finanzas",
    description: "Registrar gastos, pagos a proveedores y finanzas",
  },
  {
    key: "view_analytics",
    label: "Ver estadísticas",
    description: "Panel de analytics y reportes",
  },
];

function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${ROLE_BADGE[role]}`}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}

function defaultPermissions(userId: string): UserPermissions {
  return {
    user_id: userId,
    is_admin: false,
    allow_personal_device: true,
    view_other_users_transactions: false,
    give_discounts: false,
    register_products: false,
    manage_stock: false,
    enable_pay_later: false,
    manage_expenses: false,
    view_analytics: false,
    commission_rate: null,
    updated_at: new Date().toISOString(),
  };
}

export default function UsuariosAdmin() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [formRole, setFormRole] = useState<Role>("user");
  const [formPerms, setFormPerms] = useState<UserPermissions | null>(null);
  const [commissionInput, setCommissionInput] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [stats, setStats] = useState<UserStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [activeUserIds, setActiveUserIds] = useState<Set<string>>(new Set());

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Error al cargar usuarios");
        return;
      }
      const body = await res.json();
      setUsers(body.users ?? []);
    } catch {
      setError("Error de red al cargar usuarios");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch active user IDs (users with at least 1 sale in last 30d) for KPI
  const fetchActiveUsers = useCallback(async (list: UserRow[]) => {
    const active = new Set<string>();
    await Promise.all(
      list.map(async (u) => {
        try {
          const res = await fetch(`/api/admin/users/${u.id}/stats`);
          if (!res.ok) return;
          const body = await res.json();
          if ((body.orders ?? 0) > 0) active.add(u.id);
        } catch {
          // ignore
        }
      })
    );
    setActiveUserIds(active);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (!loading && users.length > 0) {
      fetchActiveUsers(users);
    }
  }, [loading, users, fetchActiveUsers]);

  async function openEditor(u: UserRow) {
    setEditing(u);
    setFormRole(u.role);
    setFormPerms(u.permissions ?? defaultPermissions(u.id));
    setCommissionInput(
      u.permissions?.commission_rate != null
        ? String(u.permissions.commission_rate)
        : ""
    );
    setSaveError(null);
    setSaveSuccess(false);
    setStats(null);
    setSheetOpen(true);

    setStatsLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${u.id}/stats`);
      if (res.ok) {
        const body = await res.json();
        setStats(body);
      }
    } finally {
      setStatsLoading(false);
    }
  }

  function togglePermission(key: keyof UserPermissions, value: boolean) {
    if (!formPerms) return;
    setFormPerms({ ...formPerms, [key]: value });
  }

  function onRoleChange(next: Role) {
    setFormRole(next);
    // Keep is_admin synced with role
    if (formPerms) {
      setFormPerms({ ...formPerms, is_admin: next === "admin" });
    }
  }

  async function handleSave() {
    if (!editing || !formPerms) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    const isSelf = currentUser?.id === editing.id;
    const payload: {
      role?: Role;
      permissions: Partial<UserPermissions>;
    } = {
      permissions: {
        is_admin: formRole === "admin",
        allow_personal_device: formPerms.allow_personal_device,
        view_other_users_transactions: formPerms.view_other_users_transactions,
        give_discounts: formPerms.give_discounts,
        register_products: formPerms.register_products,
        manage_stock: formPerms.manage_stock,
        enable_pay_later: formPerms.enable_pay_later,
        manage_expenses: formPerms.manage_expenses,
        view_analytics: formPerms.view_analytics,
        commission_rate:
          commissionInput.trim() === "" ? null : Number(commissionInput),
      },
    };

    if (!isSelf && formRole !== editing.role) {
      payload.role = formRole;
    }

    try {
      const res = await fetch(`/api/admin/users/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) {
        setSaveError(body.error ?? "Error al guardar");
        return;
      }
      setSaveSuccess(true);
      await fetchUsers();
      // Refresh stats (commission may have changed)
      const statsRes = await fetch(`/api/admin/users/${editing.id}/stats`);
      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch {
      setSaveError("Error de red");
    } finally {
      setSaving(false);
    }
  }

  const isCurrentUser = (userId: string) => currentUser?.id === userId;

  // KPIs
  const totalUsers = users.length;
  const adminCount = users.filter((u) => u.role === "admin").length;
  const operadorCount = users.filter((u) => u.role === "operador").length;
  const activeCount = activeUserIds.size;

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Usuarios</h1>
        <p className="text-gray-500 mt-1">
          Gestión de roles, permisos granulares y comisiones
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <KpiCard
          icon={<UsersIcon size={16} />}
          label="Total usuarios"
          value={totalUsers.toString()}
        />
        <KpiCard
          icon={<ShieldCheckIcon size={16} />}
          label="Admins"
          value={adminCount.toString()}
          tone="red"
        />
        <KpiCard
          icon={<UserIcon size={16} />}
          label="Operadores"
          value={operadorCount.toString()}
          tone="orange"
        />
        <KpiCard
          icon={<ActivityIcon size={16} />}
          label="Activos (30d)"
          value={activeCount.toString()}
          sub="con al menos 1 venta"
          tone="green"
        />
      </div>

      <div className="bg-white rounded-xl ring-1 ring-foreground/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-600">Nombre</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Empresa</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Teléfono</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Rol</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Comisión</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-gray-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                    No hay usuarios registrados
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const isSelf = isCurrentUser(user.id);
                  const rate = user.permissions?.commission_rate;
                  return (
                    <tr
                      key={user.id}
                      onClick={() => openEditor(user)}
                      className={`border-b border-gray-50 transition-colors cursor-pointer ${
                        isSelf
                          ? "bg-orange-50/50 hover:bg-orange-50"
                          : "hover:bg-gray-50/50"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">
                            {user.full_name ?? "—"}
                          </span>
                          {isSelf && (
                            <span className="text-xs bg-orange-100 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded-full font-medium">
                              Vos
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {user.email ? (
                          <span className="font-mono text-xs">{user.email}</span>
                        ) : (
                          <span className="text-gray-300 font-mono text-xs">
                            {user.id.slice(0, 8)}…
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {user.company ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {user.phone ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <RoleBadge role={user.role} />
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {rate != null ? `${Number(rate).toFixed(2)}%` : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Editor sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-xl overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>
              {editing?.full_name ?? "Usuario"}
              {editing && isCurrentUser(editing.id) && (
                <span className="ml-2 text-xs bg-orange-100 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded-full font-medium">
                  Vos
                </span>
              )}
            </SheetTitle>
          </SheetHeader>

          {editing && formPerms && (
            <div className="px-4 pb-6 space-y-5">
              {saveError && (
                <div className="p-2 rounded-lg bg-red-50 text-red-700 text-sm border border-red-200">
                  {saveError}
                </div>
              )}
              {saveSuccess && (
                <div className="p-2 rounded-lg bg-green-50 text-green-700 text-sm border border-green-200">
                  Cambios guardados
                </div>
              )}

              {/* Basic info */}
              <section className="rounded-xl bg-white ring-1 ring-foreground/10 p-4 space-y-2">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Información
                </h3>
                <InfoRow label="Email" value={editing.email ?? "—"} mono />
                <InfoRow label="Teléfono" value={editing.phone ?? "—"} />
                <InfoRow label="Empresa" value={editing.company ?? "—"} />
                <InfoRow label="Nombre" value={editing.full_name ?? "—"} />
              </section>

              {/* Role */}
              <section className="rounded-xl bg-white ring-1 ring-foreground/10 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-700">Rol</h3>
                {isCurrentUser(editing.id) ? (
                  <div className="flex items-center gap-2">
                    <RoleBadge role={editing.role} />
                    <span className="text-xs text-gray-400 italic">
                      No podés cambiar tu propio rol
                    </span>
                  </div>
                ) : (
                  <select
                    value={formRole}
                    onChange={(e) => onRoleChange(e.target.value as Role)}
                    disabled={saving}
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm focus-visible:border-ring outline-none disabled:opacity-50"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                )}
              </section>

              {/* Permissions */}
              <section className="rounded-xl bg-white ring-1 ring-foreground/10 p-4 space-y-1">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Permisos granulares
                </h3>

                {/* is_admin (derived) */}
                <div className="flex items-start justify-between gap-3 py-2.5 border-b border-gray-100">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">
                      Administrador
                    </p>
                    <p className="text-xs text-gray-400 italic">
                      Se deriva automáticamente del rol (Admin). Para quitarlo,
                      cambiá el rol.
                    </p>
                  </div>
                  <Toggle
                    checked={formRole === "admin"}
                    disabled
                    onChange={() => {}}
                  />
                </div>

                {PERMISSION_META.map((meta) => (
                  <div
                    key={meta.key}
                    className="flex items-start justify-between gap-3 py-2.5 border-b border-gray-100 last:border-0"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {meta.label}
                      </p>
                      <p className="text-xs text-gray-400">{meta.description}</p>
                    </div>
                    <Toggle
                      checked={Boolean(formPerms[meta.key])}
                      disabled={saving}
                      onChange={(v) => togglePermission(meta.key, v)}
                    />
                  </div>
                ))}
              </section>

              {/* Commission */}
              <section className="rounded-xl bg-white ring-1 ring-foreground/10 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <PercentIcon size={14} /> Comisión del vendedor
                </h3>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={commissionInput}
                    onChange={(e) => setCommissionInput(e.target.value)}
                    disabled={saving}
                    placeholder="0.00"
                    className="max-w-[140px]"
                  />
                  <span className="text-sm text-gray-500">
                    % sobre ventas totales
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  Dejar vacío para no calcular comisión.
                </p>
              </section>

              {/* Stats */}
              <section className="rounded-xl bg-white ring-1 ring-foreground/10 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <TrendingUpIcon size={14} /> Stats del vendedor (últimos 30d)
                </h3>
                {statsLoading ? (
                  <div className="grid grid-cols-2 gap-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-16 bg-gray-100 rounded-lg animate-pulse"
                      />
                    ))}
                  </div>
                ) : stats ? (
                  <div className="grid grid-cols-2 gap-2">
                    <StatBox
                      icon={<ReceiptIcon size={14} />}
                      label="Ventas"
                      value={stats.orders.toString()}
                    />
                    <StatBox
                      icon={<DollarSignIcon size={14} />}
                      label="Total"
                      value={formatMoney(stats.total, 0)}
                    />
                    <StatBox
                      icon={<TrendingUpIcon size={14} />}
                      label="Ticket promedio"
                      value={formatMoney(stats.avgTicket, 0)}
                    />
                    <StatBox
                      icon={<PercentIcon size={14} />}
                      label="Comisión a pagar"
                      value={formatMoney(stats.commission, 0)}
                      sub={`${stats.commission_rate.toFixed(2)}%`}
                      highlight
                    />
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Sin datos</p>
                )}
              </section>

              {/* Save button */}
              <div className="sticky bottom-0 -mx-4 px-4 pt-2 pb-4 bg-gradient-to-t from-white to-transparent">
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white border-0"
                >
                  {saving ? "Guardando..." : "Guardar cambios"}
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tone?: "red" | "orange" | "green";
}) {
  const toneClass =
    tone === "red"
      ? "text-red-600"
      : tone === "orange"
      ? "text-orange-600"
      : tone === "green"
      ? "text-green-700"
      : "text-gray-900";
  const iconTone =
    tone === "red"
      ? "text-red-500 bg-red-50"
      : tone === "orange"
      ? "text-orange-500 bg-orange-50"
      : tone === "green"
      ? "text-green-600 bg-green-50"
      : "text-gray-500 bg-gray-50";

  return (
    <div className="rounded-xl bg-white ring-1 ring-foreground/10 p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon && (
          <span
            className={`inline-flex items-center justify-center rounded-lg p-1.5 ${iconTone}`}
          >
            {icon}
          </span>
        )}
        <p className="text-xs text-gray-500 uppercase tracking-wider">
          {label}
        </p>
      </div>
      <p className={`text-2xl font-bold ${toneClass}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-xs text-gray-500">{label}</span>
      <span
        className={`text-gray-800 text-right ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-orange-400/50 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? "bg-orange-500" : "bg-gray-200"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function StatBox({
  icon,
  label,
  value,
  sub,
  highlight,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg p-3 border ${
        highlight
          ? "border-orange-200 bg-orange-50/50"
          : "border-gray-100 bg-gray-50/40"
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        {icon && <span className="text-gray-400">{icon}</span>}
        <p className="text-[11px] text-gray-500 uppercase tracking-wider">
          {label}
        </p>
      </div>
      <p
        className={`text-lg font-semibold ${
          highlight ? "text-orange-700" : "text-gray-900"
        }`}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
