"use client";

// Error boundary global de la app pública (catálogo, carrito, perfil, login).
// Captura errores que escapan de Server Components o Client Components.
// El layout raíz (con header + branding) sigue montado, así que sólo
// renderizamos el contenido de la página rota.

import { useEffect } from "react";
import Link from "next/link";
import { log, errToCtx } from "@/lib/log";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    log.error("app_error_boundary", { digest: error.digest, ...errToCtx(error) });
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="text-5xl" aria-hidden>
          ⚠
        </div>
        <h1 className="text-xl font-semibold text-gray-900">
          Algo salió mal
        </h1>
        <p className="text-sm text-gray-600">
          Hubo un problema cargando esta página. Probá de nuevo en unos
          segundos. Si el error persiste, contactanos.
        </p>
        {error.digest && (
          <p className="text-[11px] text-gray-400 font-mono">
            ref: {error.digest}
          </p>
        )}
        <div className="flex gap-2 justify-center pt-2">
          <button
            onClick={() => reset()}
            className="px-4 h-9 rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: "var(--brand)" }}
          >
            Reintentar
          </button>
          <Link
            href="/"
            className="px-4 h-9 inline-flex items-center rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
