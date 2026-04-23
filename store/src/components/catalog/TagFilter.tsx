"use client";

interface TagFilterProps {
  tags: string[];
  selected: string | null;
  onSelect: (tag: string | null) => void;
}

export function TagFilter({ tags, selected, onSelect }: TagFilterProps) {
  if (tags.length === 0) return null;

  return (
    <div className="px-4 pt-2 pb-1">
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
        {tags.map((tag) => {
          const active = selected === tag;
          return (
            <button
              key={tag}
              onClick={() => onSelect(active ? null : tag)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                active
                  ? "bg-[#e85d04] text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {tag}
            </button>
          );
        })}
      </div>
    </div>
  );
}
