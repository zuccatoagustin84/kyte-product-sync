"use client";

import { CartButton } from "@/components/cart/CartButton";

export function Header() {
  return (
    <header
      className="sticky top-0 z-50 h-14 flex items-center justify-between px-4 shadow-md"
      style={{ backgroundColor: "var(--navy)" }}
    >
      <div className="flex items-center gap-2">
        <div className="flex flex-col leading-tight">
          <span
            className="text-lg font-extrabold tracking-wide"
            style={{ color: "var(--brand)" }}
          >
            MP TOOLS
          </span>
          <span className="text-xs text-white/70 font-medium -mt-0.5">
            Mayorista
          </span>
        </div>
      </div>

      <CartButton />
    </header>
  );
}
