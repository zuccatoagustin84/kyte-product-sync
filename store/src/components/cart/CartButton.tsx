"use client";

import { useCartStore } from "@/lib/cart-store";

export function CartButton() {
  const toggleCart = useCartStore((state) => state.toggleCart);
  const itemCount = useCartStore((state) => state.itemCount);

  const count = itemCount();

  return (
    <>
      {/* Mobile: floating fixed button */}
      <button
        onClick={toggleCart}
        aria-label={`Carrito${count > 0 ? `, ${count} productos` : ""}`}
        className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full bg-[#e85d04] text-white shadow-lg hover:bg-[#c94e03] active:scale-95 transition-all md:hidden"
      >
        <CartIcon />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-white text-[#e85d04] text-xs font-bold border border-[#e85d04] leading-none">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {/* Desktop: inline button for use in header */}
      <button
        onClick={toggleCart}
        aria-label={`Carrito${count > 0 ? `, ${count} productos` : ""}`}
        className="hidden md:flex items-center gap-2 px-3 py-2 rounded-lg bg-[#e85d04] text-white hover:bg-[#c94e03] active:scale-95 transition-all text-sm font-medium relative"
      >
        <CartIcon className="w-5 h-5" />
        <span>Mi Pedido</span>
        {count > 0 && (
          <span className="flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-white text-[#e85d04] text-xs font-bold leading-none">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
    </>
  );
}

function CartIcon({ className = "w-6 h-6" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
      />
    </svg>
  );
}
