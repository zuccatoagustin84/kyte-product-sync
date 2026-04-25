"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin/error]", error);
  }, [error]);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 space-y-3">
        <div className="flex items-start gap-3">
          <div className="text-2xl" aria-hidden>
            ⚠
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-red-900">
              No se pudo cargar esta sección
            </h2>
            <p className="text-sm text-red-700 mt-1">
              Hubo un problema procesando la pantalla. Probá reintentando o
              volviendo al dashboard.
            </p>
            {error.digest && (
              <p className="text-[11px] text-red-500 font-mono mt-2">
                ref: {error.digest}
              </p>
            )}
            {process.env.NODE_ENV === "development" && (
              <pre className="text-[11px] text-red-800 font-mono mt-2 whitespace-pre-wrap break-all bg-red-100 rounded p-2">
                {error.message}
              </pre>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => reset()}
            className="px-3 h-8 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-700"
          >
            Reintentar
          </button>
          <Link
            href="/admin"
            className="px-3 h-8 inline-flex items-center rounded-lg border border-red-300 text-xs font-medium text-red-700 hover:bg-red-100"
          >
            Volver al dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
