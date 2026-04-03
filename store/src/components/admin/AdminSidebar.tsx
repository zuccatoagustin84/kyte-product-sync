"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { MenuIcon, XIcon, LogOutIcon } from "lucide-react";
import { signOut } from "@/lib/auth-client";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: "📊" },
  { href: "/admin/productos", label: "Productos", icon: "📦" },
  { href: "/admin/pedidos", label: "Pedidos", icon: "🛒" },
  { href: "/admin/categorias", label: "Categorías", icon: "🏷️" },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  };

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="px-6 py-5 border-b border-white/10">
        <span className="text-white font-bold text-lg tracking-tight">
          MP TOOLS Admin
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => (
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
            <span className="text-base">{item.icon}</span>
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
