"use client";

import Image from "next/image";
import type { CartItem } from "@/lib/types";
import { useCartStore } from "@/lib/cart-store";
import { formatPrice } from "@/lib/format";

interface CartItemRowProps {
  item: CartItem;
}

export function CartItemRow({ item }: CartItemRowProps) {
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem = useCartStore((state) => state.removeItem);

  const { product, quantity } = item;
  const subtotal = product.sale_price * quantity;

  return (
    <div className="flex items-start gap-3 py-3">
      {/* Product image */}
      <div className="relative shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            className="object-cover"
            sizes="64px"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            <svg
              className="w-8 h-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Product info + controls */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 leading-tight line-clamp-2">
          {product.name}
        </p>
        {product.code && (
          <p className="text-xs text-gray-500 mt-0.5">{product.code}</p>
        )}
        <p className="text-xs text-gray-500 mt-0.5">
          {formatPrice(product.sale_price)} c/u
        </p>

        {/* Quantity controls + trash */}
        <div className="flex items-center gap-2 mt-2">
          <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => updateQuantity(product.id, quantity - 1)}
              className="flex items-center justify-center w-7 h-7 text-gray-600 hover:bg-gray-100 active:bg-gray-200 transition-colors"
              aria-label="Reducir cantidad"
            >
              <MinusIcon />
            </button>
            <span className="w-8 text-center text-sm font-semibold text-gray-900 tabular-nums">
              {quantity}
            </span>
            <button
              onClick={() => updateQuantity(product.id, quantity + 1)}
              className="flex items-center justify-center w-7 h-7 text-gray-600 hover:bg-gray-100 active:bg-gray-200 transition-colors"
              aria-label="Aumentar cantidad"
            >
              <PlusIcon />
            </button>
          </div>

          <button
            onClick={() => removeItem(product.id)}
            className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 active:bg-red-100 transition-colors ml-1"
            aria-label="Eliminar producto"
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {/* Subtotal */}
      <div className="shrink-0 text-sm font-semibold text-gray-900 text-right pt-0.5">
        {formatPrice(subtotal)}
      </div>
    </div>
  );
}

function MinusIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.5}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}
