"use client";

import type { Category } from "@/lib/types";
import { cn } from "@/lib/utils";

interface CategorySidebarProps {
  categories: Category[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  mobile?: boolean;
}

export function CategorySidebar({
  categories,
  selected,
  onSelect,
  mobile = false,
}: CategorySidebarProps) {
  if (mobile) {
    return (
      <div className="overflow-x-auto flex gap-2 px-4 py-3 scrollbar-none">
        <button
          onClick={() => onSelect(null)}
          className={cn(
            "shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-200 whitespace-nowrap border",
            selected === null
              ? "text-white border-transparent shadow-sm"
              : "bg-white border-[#e5e7eb] text-[#6b7280] hover:bg-orange-50 hover:border-[#e85d04] hover:text-[#e85d04]"
          )}
          style={selected === null ? { backgroundColor: "var(--brand)" } : {}}
        >
          Todos
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            className={cn(
              "shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-200 whitespace-nowrap border",
              selected === cat.id
                ? "text-white border-transparent shadow-sm"
                : "bg-white border-[#e5e7eb] text-[#6b7280] hover:bg-orange-50 hover:border-[#e85d04] hover:text-[#e85d04]"
            )}
            style={
              selected === cat.id ? { backgroundColor: "var(--brand)" } : {}
            }
          >
            {cat.name}
          </button>
        ))}
      </div>
    );
  }

  return (
    <nav className="py-4">
      <p className="px-4 mb-3 text-xs font-bold uppercase tracking-widest text-[#9ca3af]">
        Categorías
      </p>
      <button
        onClick={() => onSelect(null)}
        className={cn(
          "w-full text-left px-4 py-2.5 text-sm font-medium transition-all duration-150 rounded-r-lg",
          selected === null
            ? "border-l-2 text-[#e85d04] bg-orange-50 font-semibold"
            : "text-[#6b7280] hover:bg-orange-50 hover:text-[#e85d04] border-l-2 border-transparent"
        )}
        style={selected === null ? { borderLeftColor: "var(--brand)" } : {}}
      >
        Todos
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
          className={cn(
            "w-full text-left px-4 py-2.5 text-sm font-medium transition-all duration-150 rounded-r-lg",
            selected === cat.id
              ? "border-l-2 text-[#e85d04] bg-orange-50 font-semibold"
              : "text-[#6b7280] hover:bg-orange-50 hover:text-[#e85d04] border-l-2 border-transparent"
          )}
          style={selected === cat.id ? { borderLeftColor: "var(--brand)" } : {}}
        >
          {cat.name}
        </button>
      ))}
    </nav>
  );
}
