"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface SearchBarProps {
  value: string;
  onChange: (v: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      onChange(local);
    }, 300);
    return () => clearTimeout(timer);
  }, [local, onChange]);

  // Sync if parent resets value
  useEffect(() => {
    if (value === "") setLocal("");
  }, [value]);

  return (
    <div className="relative w-full">
      {/* Search icon */}
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9ca3af] pointer-events-none">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
          />
        </svg>
      </span>

      <input
        type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder="Buscar producto..."
        className={cn(
          "w-full h-12 pl-11 rounded-2xl border border-[#e5e7eb] bg-white",
          "text-sm placeholder-[#9ca3af] text-[#111827]",
          "focus:outline-none focus:ring-2 focus:ring-[#e85d04] focus:border-transparent transition-all duration-200",
          local ? "pr-10" : "pr-4"
        )}
        style={{ boxShadow: "var(--shadow-sm)" }}
      />

      {/* Clear button */}
      {local && (
        <button
          type="button"
          onClick={() => setLocal("")}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300 text-gray-500 transition-colors"
          aria-label="Limpiar búsqueda"
        >
          <svg
            className="w-3 h-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
