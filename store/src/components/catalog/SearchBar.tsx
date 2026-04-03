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
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
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
          "w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white",
          "text-sm placeholder-gray-400 text-gray-800",
          "focus:outline-none focus:ring-2 focus:border-transparent transition-shadow",
          "shadow-sm"
        )}
        style={
          {
            "--tw-ring-color": "var(--brand)",
          } as React.CSSProperties
        }
      />
    </div>
  );
}
