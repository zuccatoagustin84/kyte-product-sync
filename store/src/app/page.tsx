"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Category, Product } from "@/lib/types";
import { Header } from "@/components/Header";
import { CategorySidebar } from "@/components/catalog/CategorySidebar";
import { SearchBar } from "@/components/catalog/SearchBar";
import { ProductGrid, type ViewMode } from "@/components/catalog/ProductGrid";
import { TagFilter } from "@/components/catalog/TagFilter";
import { CartSheet } from "@/components/cart/CartSheet";

function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (m: ViewMode) => void }) {
  return (
    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 shrink-0">
      <button
        onClick={() => onChange("grid")}
        title="Vista grilla"
        className={`p-1.5 rounded-md transition-colors ${mode === "grid" ? "bg-white shadow-sm text-[#e85d04]" : "text-gray-400 hover:text-gray-600"}`}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
          <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3A1.5 1.5 0 0 1 15 10.5v3A1.5 1.5 0 0 1 13.5 15h-3A1.5 1.5 0 0 1 9 13.5v-3z"/>
        </svg>
      </button>
      <button
        onClick={() => onChange("list")}
        title="Vista lista"
        className={`p-1.5 rounded-md transition-colors ${mode === "list" ? "bg-white shadow-sm text-[#e85d04]" : "text-gray-400 hover:text-gray-600"}`}
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
          <path fillRule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5z"/>
        </svg>
      </button>
    </div>
  );
}

export default function Home() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Persistir preferencia de vista
  useEffect(() => {
    const saved = localStorage.getItem("catalog-view-mode") as ViewMode | null;
    if (saved === "list" || saved === "grid") setViewMode(saved);
  }, []);

  const handleViewChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem("catalog-view-mode", mode);
  };

  useEffect(() => {
    supabase
      .from("categories")
      .select("*")
      .order("sort_order")
      .then(({ data }) => {
        if (data) setCategories(data as Category[]);
      });
  }, []);

  // Cargar tags únicos de todos los productos activos (independiente de filtros)
  useEffect(() => {
    supabase
      .from("products")
      .select("tags")
      .eq("active", true)
      .not("tags", "is", null)
      .then(({ data }) => {
        if (!data) return;
        const counts = new Map<string, number>();
        for (const row of data as { tags: string[] | null }[]) {
          for (const tag of row.tags ?? []) {
            counts.set(tag, (counts.get(tag) ?? 0) + 1);
          }
        }
        const sorted = Array.from(counts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([tag]) => tag);
        setAvailableTags(sorted);
      });
  }, []);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("products")
      .select("*, category:categories(id,name)")
      .eq("active", true);

    if (selectedCategory) {
      query = query.eq("category_id", selectedCategory);
    }
    if (selectedTag) {
      query = query.contains("tags", [selectedTag]);
    }
    if (search.trim()) {
      query = query.or(`name.ilike.%${search.trim()}%,code.ilike.%${search.trim()}%`);
    }

    const { data } = await query.order("sort_order").limit(200);
    setProducts((data as Product[]) ?? []);
    setLoading(false);
  }, [selectedCategory, selectedTag, search]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return (
    <>
      <Header />
      {/* Mobile: category chips row */}
      <div className="md:hidden sticky top-14 z-30 bg-white border-b border-gray-200 shadow-sm">
        <CategorySidebar
          categories={categories}
          selected={selectedCategory}
          onSelect={setSelectedCategory}
          mobile
        />
      </div>

      <div className="flex">
        {/* Desktop: sidebar */}
        <aside className="hidden md:block w-56 shrink-0 sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto bg-white border-r border-gray-200">
          <CategorySidebar
            categories={categories}
            selected={selectedCategory}
            onSelect={setSelectedCategory}
          />
        </aside>

        <main className="flex-1 min-w-0">
          <div className="px-4 pt-4 pb-2 flex items-center gap-2">
            <SearchBar value={search} onChange={setSearch} />
            <ViewToggle mode={viewMode} onChange={handleViewChange} />
          </div>
          <TagFilter
            tags={availableTags}
            selected={selectedTag}
            onSelect={setSelectedTag}
          />
          <ProductGrid products={products} loading={loading} viewMode={viewMode} />
        </main>
      </div>
      <CartSheet />
    </>
  );
}
