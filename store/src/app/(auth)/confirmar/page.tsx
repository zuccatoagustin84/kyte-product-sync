"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ConfirmarPage() {
  useEffect(() => {
    const timer = setTimeout(() => {
      window.location.href = "/";
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex flex-col items-center gap-4 py-6">
      {/* Green checkmark icon */}
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center"
        style={{ backgroundColor: "#f0fdf4" }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-10 h-10"
          fill="none"
          viewBox="0 0 24 24"
          stroke="#16a34a"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 12.75l6 6 9-13.5"
          />
        </svg>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 text-center">
        ¡Email confirmado!
      </h1>
      <p className="text-sm text-gray-500 text-center leading-relaxed">
        Tu cuenta está lista. Ya podés ingresar.
      </p>
      <p className="text-xs text-gray-400 text-center">
        Redirigiendo al inicio en unos segundos...
      </p>

      <Link
        href="/"
        className="mt-4 w-full h-12 rounded-xl font-semibold text-white flex items-center justify-center transition-colors"
        style={{ backgroundColor: "var(--brand)" }}
      >
        Ir al inicio
      </Link>
    </div>
  );
}
