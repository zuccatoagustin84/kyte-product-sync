"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { useCartStore } from "@/lib/cart-store";
import { formatPrice } from "@/lib/format";
import { CartItemRow } from "./CartItemRow";
import { OrderForm } from "./OrderForm";

export function CartSheet() {
  const isOpen = useCartStore((state) => state.isOpen);
  const closeCart = useCartStore((state) => state.closeCart);
  const items = useCartStore((state) => state.items);
  const total = useCartStore((state) => state.total);
  const itemCount = useCartStore((state) => state.itemCount);

  const [showOrderForm, setShowOrderForm] = useState(false);

  const count = itemCount();
  const orderTotal = total();

  // base-ui Dialog.onOpenChange passes (open, eventDetails) — we only need open
  function handleOpenChange(open: boolean) {
    if (!open) {
      closeCart();
      // Reset to cart view when closing
      setShowOrderForm(false);
    }
  }

  function handleConfirm() {
    setShowOrderForm(true);
  }

  function handleBackToCart() {
    setShowOrderForm(false);
  }

  return (
    <Sheet open={isOpen} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={!showOrderForm}
        className="flex flex-col p-0 w-full sm:max-w-md h-full gap-0"
      >
        {showOrderForm ? (
          <OrderForm onBack={handleBackToCart} />
        ) : (
          <>
            {/* Header */}
            <SheetHeader className="px-5 pt-5 pb-4 border-b border-[#e5e7eb]">
              <div className="flex items-center justify-between">
                <div>
                  <SheetTitle className="text-base font-bold text-[#111827]">
                    Mi Pedido
                    {count > 0 && (
                      <span className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#e85d04] text-white text-xs font-bold leading-none">
                        {count}
                      </span>
                    )}
                  </SheetTitle>
                  {count > 0 && (
                    <p className="text-xs text-[#9ca3af] mt-0.5">
                      {count} {count === 1 ? "producto" : "productos"}
                    </p>
                  )}
                </div>
              </div>
            </SheetHeader>

            {/* Body */}
            <div className="flex-1 overflow-y-auto bg-[#f8f9fa]">
              {items.length === 0 ? (
                <EmptyCart onClose={closeCart} />
              ) : (
                <div className="px-4 py-2">
                  {items.map((item, index) => (
                    <div key={item.product.id}>
                      <CartItemRow item={item} />
                      {index < items.length - 1 && (
                        <Separator className="border-[#e5e7eb]" />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="border-t border-[#e5e7eb] px-5 py-5 space-y-4 bg-white">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[#6b7280]">Total del pedido</span>
                  <span className="text-2xl font-black text-[#111827]">
                    {formatPrice(orderTotal)}
                  </span>
                </div>
                <button
                  onClick={handleConfirm}
                  className="w-full h-12 flex items-center justify-center rounded-xl bg-[#e85d04] text-white font-bold text-sm hover:bg-[#c94e03] active:scale-[0.98] transition-all shadow-md"
                >
                  Confirmar Pedido
                </button>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EmptyCart({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-5 px-6 py-16 text-center h-full min-h-[300px]">
      <div className="w-20 h-20 rounded-full bg-white border border-[#e5e7eb] flex items-center justify-center" style={{ boxShadow: "var(--shadow-sm)" }}>
        <svg
          className="w-10 h-10 text-[#d1d5db]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      </div>
      <div>
        <p className="text-base font-bold text-[#111827]">
          Tu pedido está vacío
        </p>
        <p className="text-sm text-[#6b7280] mt-1">
          Agregá productos del catálogo para comenzar
        </p>
      </div>
      <button
        onClick={onClose}
        className="px-5 py-2.5 rounded-full border border-[#e5e7eb] text-sm font-semibold text-[#6b7280] hover:bg-orange-50 hover:text-[#e85d04] hover:border-[#e85d04] transition-all duration-200"
      >
        Ver catálogo
      </button>
    </div>
  );
}
