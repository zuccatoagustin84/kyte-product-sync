"use client";

import type { Product } from "@/lib/types";
import { ProductCard } from "@/components/catalog/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";

interface ProductGridProps {
  products: Product[];
  loading: boolean;
}

export function ProductGrid({ products, loading }: ProductGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-[#e5e7eb] overflow-hidden" style={{ boxShadow: "var(--shadow-sm)" }}>
            {/* Image skeleton */}
            <Skeleton className="w-full aspect-square rounded-none" />
            {/* Text skeletons */}
            <div className="p-3 space-y-2">
              <Skeleton className="h-3.5 w-full rounded-md" />
              <Skeleton className="h-3.5 w-4/5 rounded-md" />
              <Skeleton className="h-3 w-1/3 rounded-md mt-1" />
              <Skeleton className="h-5 w-2/5 rounded-md mt-2" />
              <Skeleton className="h-8 w-full rounded-full mt-1" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6 text-center animate-fade-in">
        {/* Search illustration */}
        <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-5">
          <svg
            className="w-10 h-10 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
            />
          </svg>
        </div>
        <p className="text-base font-semibold text-[#111827]">No se encontraron productos</p>
        <p className="text-sm mt-1.5 text-[#6b7280]">Probá con otra búsqueda o categoría</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 p-4 pb-24 animate-fade-in">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
