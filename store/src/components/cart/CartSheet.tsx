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
import type { CartItem } from "@/lib/types";

const WHATSAPP_PHONE = "5491156742847";

function buildCartWhatsApp(items: CartItem[], total: number): string {
  const lines = items.map(
    (i) =>
      `• ${i.product.name}${i.product.code ? ` [${i.product.code}]` : ""} x${i.quantity} = ${formatPrice(i.product.sale_price * i.quantity)}`
  );
  const msg = [
    "Hola, quiero hacer un pedido:",
    "",
    ...lines,
    "",
    `*Total: ${formatPrice(total)}*`,
  ].join("\n");
  return encodeURIComponent(msg);
}

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
                <a
                  href={`https://wa.me/${WHATSAPP_PHONE}?text=${buildCartWhatsApp(items, orderTotal)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full h-10 flex items-center justify-center gap-2 rounded-xl border-2 border-[#25D366] text-[#25D366] font-semibold text-sm hover:bg-[#25D366] hover:text-white active:scale-[0.98] transition-all"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  Pedir por WhatsApp
                </a>
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
