"use client";

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { Category, Product } from "@/lib/types";
import { Header } from "@/components/Header";
import { CategorySidebar } from "@/components/catalog/CategorySidebar";
import { SearchBar } from "@/components/catalog/SearchBar";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { CartSheet } from "@/components/cart/CartSheet";

export default function Home() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("categories")
      .select("*")
      .order("sort_order")
      .then(({ data }) => {
        if (data) setCategories(data as Category[]);
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
    if (search.trim()) {
      query = query.ilike("name", `%${search.trim()}%`);
    }

    const { data } = await query.order("sort_order").limit(200);
    setProducts((data as Product[]) ?? []);
    setLoading(false);
  }, [selectedCategory, search]);

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
          <div className="px-4 pt-4 pb-2">
            <SearchBar value={search} onChange={setSearch} />
          </div>
          <ProductGrid products={products} loading={loading} />
        </main>
      </div>
      <CartSheet />
    </>
  );
}
