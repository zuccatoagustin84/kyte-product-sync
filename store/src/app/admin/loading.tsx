// Fallback mientras Next.js suspende un Server Component admin.
// Aparece en navegaciones internas (link entre /admin/productos → /admin/clientes)
// y en cargas iniciales lentas. Mantiene el sidebar visible vía el layout.

export default function AdminLoading() {
  return (
    <div className="p-6 space-y-4">
      <div className="h-7 w-40 bg-gray-200 rounded animate-pulse" />
      <div className="h-9 w-full max-w-md bg-gray-200 rounded animate-pulse" />
      <div className="space-y-2 mt-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-10 w-full bg-gray-100 rounded animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}
