"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { Product } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { useCartStore } from "@/lib/cart-store";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";

function getInitials(name: string): string {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

export function ProductRow({ product }: { product: Product }) {
  const addItem = useCartStore((s) => s.addItem);
  const items = useCartStore((s) => s.items);
  const inCart = items.find((i) => i.product.id === product.id)?.quantity ?? 0;
  const [added, setAdded] = useState(false);

  const handleAdd = () => {
    addItem(product);
    setAdded(true);
    toast("Producto agregado al carrito", "success");
    setTimeout(() => setAdded(false), 1200);
  };

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-white border-b border-gray-100 hover:bg-gray-50/60 transition-colors last:border-b-0">
      {/* Imagen */}
      <Link href={`/p/${product.id}`} className="shrink-0 relative w-14 h-14 rounded-xl overflow-hidden bg-gray-100">
        {product.image_url ? (
          <Image src={product.image_url} alt={product.name} fill sizes="56px" className="object-contain p-1" unoptimized />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-bold text-gray-300">{getInitials(product.name)}</span>
          </div>
        )}
        {inCart > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 flex items-center justify-center rounded-full bg-[#e85d04] text-white text-[9px] font-bold">
            {inCart}
          </span>
        )}
      </Link>

      {/* Info */}
      <Link href={`/p/${product.id}`} className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-[#111827] leading-snug line-clamp-2 hover:text-[#e85d04] transition-colors">
          {product.name}
        </p>
        {product.code && (
          <p className="font-mono text-[10px] text-[#b0b5bf] uppercase mt-0.5">{product.code}</p>
        )}
      </Link>

      {/* Precio + botón */}
      <div className="shrink-0 flex items-center gap-3">
        <p className="text-base font-extrabold tracking-tight" style={{ color: "var(--brand)" }}>
          {formatPrice(product.sale_price)}
        </p>
        <button
          onClick={handleAdd}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-bold text-white transition-all duration-200 active:scale-95 whitespace-nowrap",
            added ? "bg-[#10b981]" : ""
          )}
          style={!added ? { backgroundColor: "var(--brand)" } : {}}
        >
          {added ? "✓" : inCart > 0 ? `(${inCart}) +` : "Agregar"}
        </button>
      </div>
    </div>
  );
}
