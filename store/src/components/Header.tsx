"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CartButton } from "@/components/cart/CartButton";
import { useAuth } from "@/components/auth/AuthProvider";

function UserMenu() {
  const { user, profile, signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!user) {
    return (
      <Link
        href="/login"
        className="text-sm text-white/70 hover:text-white transition-colors px-2 py-1 rounded"
      >
        Ingresar
      </Link>
    );
  }

  const displayName =
    profile?.full_name ?? user.email?.split("@")[0] ?? "U";
  const initials = displayName
    .split(" ")
    .slice(0, 2)
    .map((w: string) => w[0]?.toUpperCase() ?? "")
    .join("");

  const isAdmin =
    profile?.role === "admin" ||
    user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL;

  async function handleSignOut() {
    setOpen(false);
    await signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="size-8 rounded-full flex items-center justify-center text-white text-sm font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        style={{ backgroundColor: "var(--brand)" }}
        aria-label="Menú de usuario"
        aria-expanded={open}
        aria-haspopup="true"
      >
        {initials || "U"}
      </button>

      {open && (
        <div className="absolute right-0 top-10 w-48 bg-white rounded-xl shadow-xl ring-1 ring-gray-200 overflow-hidden z-50">
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-xs text-gray-400 truncate">{user.email}</p>
          </div>
          <Link
            href="/perfil"
            className="flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            onClick={() => setOpen(false)}
          >
            Mi perfil
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium hover:bg-orange-50 transition-colors"
              style={{ color: "var(--brand)" }}
              onClick={() => setOpen(false)}
            >
              ⚙ Administrar
            </Link>
          )}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors text-left"
          >
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

export function Header() {
  const { loading } = useAuth();

  return (
    <header
      className="sticky top-0 z-50 h-16 flex items-center justify-between px-5 shadow-md border-b-2"
      style={{ backgroundColor: "var(--navy)", borderBottomColor: "var(--brand)" }}
    >
      <div className="flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            className="text-xl font-black tracking-tight"
            style={{ color: "var(--brand)" }}
          >
            MP TOOLS
          </span>
          <span
            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-white"
            style={{ backgroundColor: "var(--brand)" }}
          >
            Mayorista
          </span>
        </Link>
      </div>

      <div className="flex items-center gap-3">
        {!loading && <UserMenu />}
        <CartButton />
      </div>
    </header>
  );
}
