"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";

type Role = "admin" | "operador" | "user";

type UserRow = {
  id: string;
  full_name: string | null;
  company: string | null;
  phone: string | null;
  role: Role;
  email: string | null;
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

function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${ROLE_BADGE[role]}`}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}

export default function UsuariosAdmin() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-row pending role selection and saving state
  const [pendingRoles, setPendingRoles] = useState<Record<string, Role>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const [saveSuccess, setSaveSuccess] = useState<Record<string, boolean>>({});

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
      // Initialise pending roles to current role for each user
      const initial: Record<string, Role> = {};
      for (const u of body.users ?? []) {
        initial[u.id] = u.role;
      }
      setPendingRoles(initial);
    } catch {
      setError("Error de red al cargar usuarios");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  async function handleSaveRole(userId: string) {
    const newRole = pendingRoles[userId];
    setSaving((prev) => ({ ...prev, [userId]: true }));
    setSaveErrors((prev) => ({ ...prev, [userId]: "" }));
    setSaveSuccess((prev) => ({ ...prev, [userId]: false }));
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role: newRole }),
      });
      const body = await res.json();
      if (!res.ok) {
        setSaveErrors((prev) => ({
          ...prev,
          [userId]: body.error ?? "Error al guardar",
        }));
        return;
      }
      // Update local state
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
      );
      setSaveSuccess((prev) => ({ ...prev, [userId]: true }));
      setTimeout(() => {
        setSaveSuccess((prev) => ({ ...prev, [userId]: false }));
      }, 2000);
    } finally {
      setSaving((prev) => ({ ...prev, [userId]: false }));
    }
  }

  const isCurrentUser = (userId: string) => currentUser?.id === userId;
  const hasRoleChanged = (userId: string, currentRole: Role) =>
    pendingRoles[userId] !== undefined && pendingRoles[userId] !== currentRole;

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Usuarios</h1>
        <p className="text-gray-500 mt-1">Gestión de roles de usuarios registrados</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl ring-1 ring-foreground/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-600">Nombre</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Empresa</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Teléfono</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Rol actual</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Acciones</th>
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
                  const changed = hasRoleChanged(user.id, user.role);
                  const isSaving = saving[user.id] ?? false;
                  const rowError = saveErrors[user.id] ?? "";
                  const success = saveSuccess[user.id] ?? false;

                  return (
                    <tr
                      key={user.id}
                      className={`border-b border-gray-50 transition-colors ${
                        isSelf
                          ? "bg-orange-50/50 hover:bg-orange-50"
                          : "hover:bg-gray-50/50"
                      }`}
                    >
                      {/* Nombre */}
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

                      {/* Email */}
                      <td className="px-4 py-3 text-gray-500">
                        {user.email ? (
                          <span className="font-mono text-xs">{user.email}</span>
                        ) : (
                          <span className="text-gray-300 font-mono text-xs">
                            {user.id.slice(0, 8)}…
                          </span>
                        )}
                      </td>

                      {/* Empresa */}
                      <td className="px-4 py-3 text-gray-500">
                        {user.company ?? "—"}
                      </td>

                      {/* Teléfono */}
                      <td className="px-4 py-3 text-gray-500">
                        {user.phone ?? "—"}
                      </td>

                      {/* Rol actual */}
                      <td className="px-4 py-3">
                        <RoleBadge role={user.role} />
                      </td>

                      {/* Acciones */}
                      <td className="px-4 py-3">
                        {isSelf ? (
                          <span className="text-xs text-gray-400 italic">
                            No podés cambiar tu propio rol
                          </span>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            <select
                              value={pendingRoles[user.id] ?? user.role}
                              onChange={(e) =>
                                setPendingRoles((prev) => ({
                                  ...prev,
                                  [user.id]: e.target.value as Role,
                                }))
                              }
                              disabled={isSaving}
                              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm focus-visible:border-ring outline-none disabled:opacity-50"
                            >
                              {ROLE_OPTIONS.map((r) => (
                                <option key={r} value={r}>
                                  {ROLE_LABEL[r]}
                                </option>
                              ))}
                            </select>
                            <Button
                              size="sm"
                              onClick={() => handleSaveRole(user.id)}
                              disabled={isSaving || !changed}
                              className={`text-xs border-0 ${
                                changed
                                  ? "bg-orange-500 hover:bg-orange-600 text-white"
                                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
                              }`}
                            >
                              {isSaving ? "Guardando..." : "Guardar"}
                            </Button>
                            {success && (
                              <span className="text-xs text-green-600 font-medium">
                                Guardado
                              </span>
                            )}
                            {rowError && (
                              <span className="text-xs text-red-600">
                                {rowError}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
