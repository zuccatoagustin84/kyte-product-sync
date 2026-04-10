"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Category } from "@/lib/types";

export default function CategoriasAdmin() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);

  useEffect(() => {
    supabase
      .from("categories")
      .select("*")
      .order("sort_order")
      .then(({ data }) => {
        if (data) setCategories(data as Category[]);
        setLoading(false);
      });
  }, []);

  const handleDragStart = (id: string) => {
    dragId.current = id;
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    setDragOverId(id);
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = async (targetId: string) => {
    setDragOverId(null);
    if (!dragId.current || dragId.current === targetId) return;

    const fromIdx = categories.findIndex((c) => c.id === dragId.current);
    const toIdx = categories.findIndex((c) => c.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const reordered = [...categories];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);

    const updated = reordered.map((c, i) => ({ ...c, sort_order: i + 1 }));
    setCategories(updated);
    dragId.current = null;

    setSaving(true);
    await Promise.all(
      updated.map((c) =>
        supabase
          .from("categories")
          .update({ sort_order: c.sort_order })
          .eq("id", c.id)
      )
    );
    setSaving(false);
    setSavedOk(true);
    setTimeout(() => setSavedOk(false), 2000);
  };

  const handleDragEnd = () => {
    dragId.current = null;
    setDragOverId(null);
  };

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Categorías</h1>
          <p className="text-gray-500 mt-1">
            {categories.length} categorías · arrastrá para reordenar
          </p>
        </div>
        <div className="text-sm h-5">
          {saving && <span className="text-gray-400">Guardando...</span>}
          {savedOk && <span className="text-green-600 font-medium">✓ Guardado</span>}
        </div>
      </div>

      <div className="bg-white rounded-xl ring-1 ring-foreground/10 overflow-hidden max-w-lg">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {categories.map((cat) => (
              <li
                key={cat.id}
                draggable
                onDragStart={() => handleDragStart(cat.id)}
                onDragOver={(e) => handleDragOver(e, cat.id)}
                onDragLeave={handleDragLeave}
                onDrop={() => handleDrop(cat.id)}
                onDragEnd={handleDragEnd}
                className={`flex items-center justify-between px-4 py-3 cursor-grab active:cursor-grabbing transition-colors select-none ${
                  dragOverId === cat.id
                    ? "bg-orange-50 border-l-2 border-[#e85d04]"
                    : "hover:bg-gray-50 border-l-2 border-transparent"
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Grip icon */}
                  <svg
                    className="w-4 h-4 text-gray-300 shrink-0"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                  >
                    <circle cx="5" cy="4" r="1.5" />
                    <circle cx="11" cy="4" r="1.5" />
                    <circle cx="5" cy="8" r="1.5" />
                    <circle cx="11" cy="8" r="1.5" />
                    <circle cx="5" cy="12" r="1.5" />
                    <circle cx="11" cy="12" r="1.5" />
                  </svg>
                  <span className="font-medium text-gray-900">{cat.name}</span>
                </div>
                <span className="text-xs text-gray-400">#{cat.sort_order}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
