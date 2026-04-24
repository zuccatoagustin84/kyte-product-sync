// Renderizada cuando proxy.ts no puede resolver una company para el host actual.

export const dynamic = "force-static";

export default function TenantNotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-semibold text-slate-900 mb-3">
          Tienda no encontrada
        </h1>
        <p className="text-slate-600 mb-6">
          No hay ninguna tienda configurada para este dominio. Verificá la URL
          o contactá al administrador.
        </p>
        <p className="text-xs text-slate-400">
          Si sos administrador y acabás de crear una company nueva, asegurate
          de que esté <code>is_active = true</code> y que el subdominio o
          dominio custom coincida con el host.
        </p>
      </div>
    </main>
  );
}
