"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { Product } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { useCartStore } from "@/lib/cart-store";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";

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

  const isOnSale =
    product.cost_price != null &&
    product.cost_price > 0 &&
    product.sale_price < product.cost_price;

  const handleAdd = () => {
    addItem(product);
    setAdded(true);
    toast("Producto agregado al carrito", "success");
    setTimeout(() => setAdded(false), 1200);
  };

  return (
    <div
      className="group bg-white rounded-2xl border border-[#e5e7eb] flex flex-col overflow-hidden transition-all duration-300 hover:-translate-y-1"
      style={{ boxShadow: "var(--shadow-sm)" }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--shadow-lg)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = "var(--shadow-sm)";
      }}
    >
      {/* Image */}
      <Link
        href={`/p/${product.id}`}
        className="block relative w-full aspect-square bg-gray-50 shrink-0 overflow-hidden"
      >
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.name}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-50">
            <span className="text-2xl font-bold text-gray-300">
              {getInitials(product.name)}
            </span>
          </div>
        )}

        {/* Sale badge */}
        {isOnSale && (
          <span
            className="absolute top-2 left-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest text-white bg-[#ef4444] shadow-sm"
            style={{ fontFamily: "var(--font-jakarta)" }}
          >
            Oferta
          </span>
        )}

        {/* Cart count badge */}
        {inCart > 0 && (
          <span className="absolute top-2 right-2 min-w-[22px] h-[22px] px-1 flex items-center justify-center rounded-full bg-[#e85d04] text-white text-xs font-bold leading-none shadow">
            {inCart}
          </span>
        )}
      </Link>

      {/* Info */}
      <div className="flex flex-col flex-1 p-3 gap-1.5">
        <Link href={`/p/${product.id}`} className="block">
          <p
            className="text-[13px] font-semibold line-clamp-2 text-[#111827] leading-snug tracking-[-0.01em] hover:text-[#e85d04] transition-colors"
            style={{ fontFamily: "var(--font-jakarta)" }}
            title={product.name}
          >
            {product.name}
          </p>
        </Link>
        {product.code && (
          <p className="font-mono text-[10px] text-[#b0b5bf] tracking-wide uppercase truncate">
            {product.code}
          </p>
        )}

        <p
          className="text-lg font-extrabold mt-auto pt-1 tracking-tight"
          style={{ color: "var(--brand)", fontFamily: "var(--font-jakarta)" }}
        >
          {formatPrice(product.sale_price)}
        </p>

        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleAdd();
          }}
          className={cn(
            "mt-1 w-full py-2 rounded-full text-xs font-bold text-white tracking-tight transition-all duration-200 active:scale-95",
            added ? "bg-[#10b981]" : ""
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
