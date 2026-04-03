"use client";

import Image from "next/image";
import { useState } from "react";
import type { Product } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { useCartStore } from "@/lib/cart-store";
import { cn } from "@/lib/utils";

interface ProductCardProps {
  product: Product;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function ProductCard({ product }: ProductCardProps) {
  const addItem = useCartStore((s) => s.addItem);
  const items = useCartStore((s) => s.items);
  const inCart = items.find((i) => i.product.id === product.id)?.quantity ?? 0;
  const [added, setAdded] = useState(false);

  const handleAdd = () => {
    addItem(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  };

  return (
    <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow flex flex-col overflow-hidden border border-gray-100">
      {/* Image */}
      <div className="relative w-full aspect-square bg-gray-100 shrink-0">
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
            <span className="text-2xl font-bold text-gray-300">
              {getInitials(product.name)}
            </span>
          </div>
        )}
        {inCart > 0 && (
          <span className="absolute top-1.5 right-1.5 min-w-[22px] h-[22px] px-1 flex items-center justify-center rounded-full bg-[#e85d04] text-white text-xs font-bold leading-none shadow">
            {inCart}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex flex-col flex-1 p-3 gap-1">
        <p
          className="text-xs font-medium line-clamp-2 text-gray-800 leading-snug"
          title={product.name}
        >
          {product.name}
        </p>
        {product.code && (
          <p className="text-[11px] text-gray-400 truncate">{product.code}</p>
        )}

        <p
          className="text-base font-bold mt-auto pt-1"
          style={{ color: "var(--brand)" }}
        >
          {formatPrice(product.sale_price)}
        </p>

        <button
          onClick={handleAdd}
          className={cn(
            "mt-1 w-full py-1.5 rounded-lg text-xs font-semibold text-white transition-colors",
            added ? "bg-green-500" : ""
          )}
          style={!added ? { backgroundColor: "var(--brand)" } : {}}
          onMouseEnter={(e) => {
            if (!added)
              (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                "var(--brand-dark)";
          }}
          onMouseLeave={(e) => {
            if (!added)
              (e.currentTarget as HTMLButtonElement).style.backgroundColor =
                "var(--brand)";
          }}
        >
          {added ? "+ Agregado" : inCart > 0 ? `En carrito (${inCart})` : "Agregar"}
        </button>
      </div>
    </div>
  );
}
