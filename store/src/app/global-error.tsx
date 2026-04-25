"use client";

// Último recurso: si revienta el RootLayout (typeof TenantProvider, fonts...),
// Next.js monta este componente en lugar del árbol normal. Tiene que renderizar
// su propio <html> y <body> porque el layout raíz no está disponible.

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="es">
      <body
        style={{
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          color: "#1a1a2e",
          background: "#f8f9fa",
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>⚠</div>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px" }}>
            Error inesperado
          </h1>
          <p style={{ fontSize: 14, color: "#555", margin: "0 0 16px" }}>
            Algo falló al cargar la aplicación. Recargá la página; si persiste,
            contactanos.
          </p>
          {error.digest && (
            <p
              style={{
                fontSize: 11,
                color: "#999",
                fontFamily: "ui-monospace, monospace",
                margin: "0 0 16px",
              }}
            >
              ref: {error.digest}
            </p>
          )}
          <button
            onClick={() => reset()}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: 0,
              background: "#f59e0b",
              color: "white",
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
