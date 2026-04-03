"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Minus, Plus, ShoppingCart } from "lucide-react";
import type { Product } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { useCartStore } from "@/lib/cart-store";
import { supabase } from "@/lib/supabase";

interface ProductDetailProps {
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

export function ProductDetail({ product }: ProductDetailProps) {
  const addItem = useCartStore((s) => s.addItem);
  const items = useCartStore((s) => s.items);
  const inCart = items.find((i) => i.product.id === product.id)?.quantity ?? 0;

  const minQty = product.min_order ?? 1;
  const maxQty = product.stock ?? undefined;

  const [qty, setQty] = useState(minQty);
  const [added, setAdded] = useState(false);
  const [related, setRelated] = useState<Product[]>([]);

  const category = product.category as { id: string; name: string } | null | undefined;

  useEffect(() => {
    if (!product.category_id) return;
    supabase
      .from("products")
      .select("*, category:categories(id,name)")
      .eq("category_id", product.category_id)
      .eq("active", true)
      .neq("id", product.id)
      .limit(4)
      .then(({ data }) => {
        if (data) setRelated(data as Product[]);
      });
  }, [product.category_id, product.id]);

  const handleDecrement = () => {
    setQty((prev) => Math.max(minQty, prev - 1));
  };

  const handleIncrement = () => {
    setQty((prev) => {
      if (maxQty !== undefined) return Math.min(maxQty, prev + 1);
      return prev + 1;
    });
  };

  const handleQtyInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (isNaN(val)) return;
    let clamped = Math.max(minQty, val);
    if (maxQty !== undefined) clamped = Math.min(maxQty, clamped);
    setQty(clamped);
  };

  const handleAddToCart = () => {
    for (let i = 0; i < qty; i++) {
      addItem(product);
    }
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  const stockNull = product.stock === null || product.stock === undefined;

  return (
    <main className="max-w-5xl mx-auto px-4 py-6">
      {/* Main product section */}
      <div className="flex flex-col md:flex-row gap-8">
        {/* Image */}
        <div className="w-full md:w-1/2">
          <div className="relative w-full aspect-square md:aspect-auto md:h-[420px] bg-gray-100 rounded-xl overflow-hidden">
            {product.image_url ? (
              <Image
                src={product.image_url}
                alt={product.name}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover rounded-xl"
                unoptimized
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-xl">
                <span className="text-5xl font-bold text-gray-300">
                  {getInitials(product.name)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="w-full md:w-1/2 flex flex-col gap-3">
          {/* Breadcrumb */}
          <nav className="text-xs text-gray-400 flex items-center gap-1 flex-wrap">
            <Link href="/" className="hover:text-gray-600 transition-colors">
              Inicio
            </Link>
            {category && (
              <>
                <span>›</span>
                <Link
                  href={`/?cat=${category.id}`}
                  className="hover:text-gray-600 transition-colors"
                >
                  {category.name}
                </Link>
              </>
            )}
            <span>›</span>
            <span className="text-gray-600 truncate max-w-[160px]">{product.name}</span>
          </nav>

          {/* Category badge */}
          {category && (
            <span className="inline-block self-start px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-xs font-medium">
              {category.name}
            </span>
          )}

          {/* Name */}
          <h1 className="text-2xl font-bold text-gray-900 leading-snug">{product.name}</h1>

          {/* Code */}
          {product.code && (
            <p className="text-sm text-gray-400">Cód: {product.code}</p>
          )}

          {/* Price */}
          <p className="text-3xl font-extrabold" style={{ color: "var(--brand)" }}>
            {formatPrice(product.sale_price)}
          </p>

          {/* Stock indicator */}
          {!stockNull && (
            <div>
              {(product.stock as number) > 0 ? (
                <span className="text-sm text-green-600 font-medium">
                  Stock disponible: {product.stock}
                </span>
              ) : (
                <span className="text-sm text-red-500 font-medium">Sin stock</span>
              )}
            </div>
          )}

          {/* Min order badge */}
          {minQty > 1 && (
            <div className="inline-flex items-center gap-1 self-start px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-medium border border-blue-100">
              Pedido mínimo: {minQty} unidades
            </div>
          )}

          {/* Quantity selector */}
          <div className="flex items-center gap-3 mt-1">
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={handleDecrement}
                disabled={qty <= minQty}
                className="w-9 h-9 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Reducir cantidad"
              >
                <Minus size={14} />
              </button>
              <input
                type="number"
                value={qty}
                onChange={handleQtyInput}
                min={minQty}
                max={maxQty}
                className="w-12 h-9 text-center text-sm font-semibold border-x border-gray-200 focus:outline-none"
              />
              <button
                onClick={handleIncrement}
                disabled={maxQty !== undefined && qty >= maxQty}
                className="w-9 h-9 flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Aumentar cantidad"
              >
                <Plus size={14} />
              </button>
            </div>
            <span className="text-xs text-gray-400">unidades</span>
          </div>

          {/* Add to cart button */}
          <button
            onClick={handleAddToCart}
            disabled={!stockNull && (product.stock as number) <= 0}
            className="mt-1 w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: added ? undefined : "var(--brand)" }}
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
            {added ? (
              "Agregado al carrito"
            ) : (
              <>
                <ShoppingCart size={16} />
                {inCart > 0
                  ? `En carrito: ${inCart} — Agregar ${qty} más`
                  : `Agregar al carrito${qty > 1 ? ` (${qty})` : ""}`}
              </>
            )}
          </button>

          {/* Description */}
          {product.description && (
            <div className="mt-2 pt-3 border-t border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700 mb-1">Descripción</h2>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                {product.description}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Related products */}
      {related.length > 0 && (
        <section className="mt-10">
          <h2 className="text-base font-semibold text-gray-800 mb-4">
            Más de {category?.name ?? "esta categoría"}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {related.map((rel) => (
              <RelatedCard key={rel.id} product={rel} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function RelatedCard({ product }: { product: Product }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col">
      <Link href={`/p/${product.id}`} className="block">
        <div className="relative w-full aspect-square bg-gray-100">
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
              <span className="text-xl font-bold text-gray-300">
                {getInitials(product.name)}
              </span>
            </div>
          )}
        </div>
      </Link>
      <div className="p-2 flex flex-col gap-1 flex-1">
        <Link href={`/p/${product.id}`}>
          <p className="text-xs font-medium text-gray-800 line-clamp-2 leading-snug hover:text-[var(--brand)] transition-colors">
            {product.name}
          </p>
        </Link>
        <p className="text-sm font-bold mt-auto" style={{ color: "var(--brand)" }}>
          {formatPrice(product.sale_price)}
        </p>
        <Link
          href={`/p/${product.id}`}
          className="mt-1 block text-center py-1 rounded-lg text-xs font-semibold text-white transition-colors"
          style={{ backgroundColor: "var(--brand)" }}
        >
          Ver
        </Link>
      </div>
    </div>
  );
}
