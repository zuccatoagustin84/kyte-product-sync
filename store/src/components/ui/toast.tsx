"use client";

import { useEffect, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

type ToastType = "success" | "error" | "default";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

// ── Event bus (no external deps) ──────────────────────────────────────────

type ToastListener = (item: ToastItem) => void;
const listeners: ToastListener[] = [];
let counter = 0;

/** Call this anywhere to show a toast. */
export function toast(message: string, type: ToastType = "default") {
  const item: ToastItem = { id: ++counter, message, type };
  listeners.forEach((fn) => fn(item));
}

// ── Toaster component ─────────────────────────────────────────────────────

const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 3000;

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler: ToastListener = (item) => {
      setToasts((prev) => {
        const next = [...prev, item];
        // Keep at most MAX_VISIBLE
        return next.slice(-MAX_VISIBLE);
      });

      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== item.id));
      }, AUTO_DISMISS_MS + 200); // tiny buffer after animation ends
    };

    listeners.push(handler);
    return () => {
      const idx = listeners.indexOf(handler);
      if (idx > -1) listeners.splice(idx, 1);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-5 left-5 z-[9999] flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((t) => (
        <ToastBubble key={t.id} item={t} />
      ))}
    </div>
  );
}

// ── Single toast bubble ───────────────────────────────────────────────────

function ToastBubble({ item }: { item: ToastItem }) {
  const isSuccess = item.type === "success";
  const isError = item.type === "error";

  return (
    <div
      className="animate-toast pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold text-white min-w-[220px] max-w-xs"
      style={{
        backgroundColor: isSuccess
          ? "#10b981"
          : isError
          ? "#ef4444"
          : "#1a1a2e",
        boxShadow: "var(--shadow-lg)",
      }}
      role="status"
    >
      {/* Icon */}
      {isSuccess && (
        <svg
          className="w-4 h-4 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
      {isError && (
        <svg
          className="w-4 h-4 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      <span>{item.message}</span>
    </div>
  );
}
