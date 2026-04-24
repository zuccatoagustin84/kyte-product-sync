"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  MenuIcon,
  XIcon,
  LogOutIcon,
  LayoutDashboardIcon,
  Building2Icon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { signOut } from "@/lib/auth-client";

type NavItem = {
  href: string;
  label: string;
  Icon: LucideIcon;
};

const navItems: NavItem[] = [
  { href: "/superadmin", label: "Dashboard", Icon: LayoutDashboardIcon },
  { href: "/superadmin/companies", label: "Companies", Icon: Building2Icon },
];

export function SuperadminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function handleSignOut() {
    await signOut();
    router.push("/login");
  }

  const isActive = (href: string) => {
    if (href === "/superadmin") return pathname === "/superadmin";
    return pathname.startsWith(href);
  };

  const sidebarContent = (
    <>
      <div className="px-6 py-5 border-b border-white/10">
        <span className="text-white font-bold text-lg tracking-tight">
          Tutienda Backoffice
        </span>
        <span className="mt-1.5 ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-600 text-white">
          Superadmin
        </span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive(item.href)
                ? "bg-purple-600 text-white"
                : "text-white/70 hover:text-white hover:bg-white/10"
            }`}
          >
            <item.Icon size={16} strokeWidth={2} />
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-white/10 space-y-1">
        <Link
          href="/admin"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-white/50 hover:text-white/80 text-xs transition-colors hover:bg-white/5"
        >
          ← Ir al admin del tenant
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
      <button
        className="md:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-[#0f0f1e] text-white shadow-lg"
        onClick={() => setOpen(!open)}
        aria-label="Toggle menu"
      >
        {open ? <XIcon size={20} /> : <MenuIcon size={20} />}
      </button>

      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`md:hidden fixed inset-y-0 left-0 z-40 w-60 flex flex-col bg-[#0f0f1e] transition-transform duration-200 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent}
      </aside>

      <aside className="hidden md:flex flex-col w-60 shrink-0 bg-[#0f0f1e] h-screen sticky top-0">
        {sidebarContent}
      </aside>
    </>
  );
}
