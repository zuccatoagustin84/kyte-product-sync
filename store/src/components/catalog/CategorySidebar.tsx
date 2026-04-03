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
      <div className="overflow-x-auto flex gap-2 px-4 py-2 scrollbar-none">
        <button
          onClick={() => onSelect(null)}
          className={cn(
            "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors whitespace-nowrap",
            selected === null
              ? "text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
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
              "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors whitespace-nowrap",
              selected === cat.id
                ? "text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
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
      <p className="px-4 mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
        Categorías
      </p>
      <button
        onClick={() => onSelect(null)}
        className={cn(
          "w-full text-left px-4 py-2 text-sm font-medium transition-colors",
          selected === null
            ? "text-white"
            : "text-gray-700 hover:bg-gray-100"
        )}
        style={
          selected === null
            ? { backgroundColor: "var(--brand)", color: "#fff" }
            : {}
        }
      >
        Todos
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
          className={cn(
            "w-full text-left px-4 py-2 text-sm font-medium transition-colors",
            selected === cat.id
              ? "text-white"
              : "text-gray-700 hover:bg-gray-100"
          )}
          style={
            selected === cat.id
              ? { backgroundColor: "var(--brand)", color: "#fff" }
              : {}
          }
        >
          {cat.name}
        </button>
      ))}
    </nav>
  );
}
