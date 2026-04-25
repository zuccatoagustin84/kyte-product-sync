import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-4">
        <div className="text-5xl font-bold text-gray-300" aria-hidden>
          404
        </div>
        <h1 className="text-xl font-semibold text-gray-900">
          Página no encontrada
        </h1>
        <p className="text-sm text-gray-600">
          La página que buscás no existe o fue movida.
        </p>
        <div className="flex gap-2 justify-center pt-2">
          <Link
            href="/"
            className="px-4 h-9 inline-flex items-center rounded-lg text-sm font-semibold text-white"
            style={{ backgroundColor: "var(--brand)" }}
          >
            Ir al catálogo
          </Link>
        </div>
      </div>
    </div>
  );
}
