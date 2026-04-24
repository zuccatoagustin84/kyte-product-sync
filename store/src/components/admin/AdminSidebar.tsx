"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import {
  MenuIcon,
  XIcon,
  LogOutIcon,
  LayoutDashboardIcon,
  CheckCircle2Icon,
  ClipboardListIcon,
  PackageIcon,
  TagsIcon,
  UsersIcon,
  UserIcon,
  DollarSignIcon,
  WalletIcon,
  BarChart3Icon,
  RefreshCwIcon,
  SettingsIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { signOut } from "@/lib/auth-client";
import type { Role } from "@/lib/rbac";
import { hasPermission } from "@/lib/rbac";

type NavItem = {
  href: string;
  label: string;
  Icon: LucideIcon;
  permission: string;
};

const allNavItems: NavItem[] = [
  { href: "/admin", label: "Dashboard", Icon: LayoutDashboardIcon, permission: "products" },
  { href: "/admin/vender", label: "Vender", Icon: CheckCircle2Icon, permission: "pos" },
  { href: "/admin/pedidos", label: "Pedidos", Icon: ClipboardListIcon, permission: "orders" },
  { href: "/admin/productos", label: "Productos", Icon: PackageIcon, permission: "products" },
  { href: "/admin/categorias", label: "Categorías", Icon: TagsIcon, permission: "categories" },
  { href: "/admin/clientes", label: "Clientes", Icon: UserIcon, permission: "customers" },
  { href: "/admin/transacciones", label: "Transacciones", Icon: DollarSignIcon, permission: "transactions" },
  { href: "/admin/finanzas", label: "Finanzas", Icon: WalletIcon, permission: "finances" },
  { href: "/admin/estadisticas", label: "Estadísticas", Icon: BarChart3Icon, permission: "analytics" },
  { href: "/admin/usuarios", label: "Usuarios", Icon: UsersIcon, permission: "users" },
  { href: "/admin/configuracion", label: "Configuración", Icon: SettingsIcon, permission: "settings" },
  { href: "/admin/sync", label: "Actualizar precios", Icon: RefreshCwIcon, permission: "sync" },
];

const ROLE_LABELS: Record<Role, string> = {
  superadmin: "Superadmin",
  admin: "Admin",
  operador: "Operador",
  user: "Usuario",
};

const ROLE_COLORS: Record<Role, string> = {
  superadmin: "bg-purple-600 text-white",
  admin: "bg-orange-500 text-white",
  operador: "bg-blue-500 text-white",
  user: "bg-gray-500 text-white",
};

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role | null>(null);

  useEffect(() => {
    fetch("/api/user/role")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.role) setRole(data.role as Role);
      })
      .catch(() => {});
  }, []);

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  };

  const visibleItems = role
    ? allNavItems.filter((item) => hasPermission(role, item.permission))
    : [];

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/10">
        <span className="text-white font-bold text-lg tracking-tight">
          MP TOOLS Admin
        </span>
        {role && (
          <span
            className={`mt-1.5 ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${ROLE_COLORS[role]}`}
          >
            {ROLE_LABELS[role]}
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {visibleItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive(item.href)
                ? "bg-orange-500 text-white"
                : "text-white/70 hover:text-white hover:bg-white/10"
            }`}
          >
            <item.Icon size={16} strokeWidth={2} />
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-white/10 space-y-1">
        <Link
          href="/"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-white/50 hover:text-white/80 text-xs transition-colors hover:bg-white/5"
        >
          ← Volver a la tienda
        </Link>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-white/50 hover:text-red-400 text-xs transition-colors hover:bg-white/5"
        >
          <LogOutIcon size={13} />
          Cerrar sesión
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="md:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-[#1a1a2e] text-white shadow-lg"
        onClick={() => setOpen(!open)}
        aria-label="Toggle menu"
      >
        {open ? <XIcon size={20} /> : <MenuIcon size={20} />}
      </button>

      {/* Mobile overlay */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={`md:hidden fixed inset-y-0 left-0 z-40 w-60 flex flex-col bg-[#1a1a2e] transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 bg-[#1a1a2e] h-screen sticky top-0">
        {sidebarContent}
      </aside>
    </>
  );
}
