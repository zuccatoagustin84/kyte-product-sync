"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";

export default function SetupPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, fullName }),
      });

      const data = await res.json();

      if (res.status === 403 && data.error === "Setup ya completado") {
        setError("Este sistema ya tiene un admin configurado.");
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError(data.error ?? "Error desconocido");
        setLoading(false);
        return;
      }

      // Success
      setDone(true);
      setTimeout(() => {
        router.push("/login?setup=1");
      }, 2000);
    } catch {
      setError("Error de red. Intentá de nuevo.");
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: "rgba(234,88,12,0.1)" }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--brand, #ea580c)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">
            Admin creado correctamente
          </h2>
          <p className="text-sm text-gray-500">
            Redirigiendo a login...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="mb-8 text-center">
          <span
            className="text-3xl font-black tracking-wide"
            style={{ color: "var(--brand, #ea580c)" }}
          >
            MP TOOLS
          </span>
          <h1 className="mt-4 text-2xl font-bold text-gray-900">
            Configuracion inicial
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Crea el primer usuario administrador del sistema
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Full name */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="fullName"
                className="text-sm font-medium text-gray-700"
              >
                Nombre completo <span className="text-red-400">*</span>
              </label>
              <Input
                id="fullName"
                type="text"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Juan Perez"
                className="h-12 rounded-xl"
              />
            </div>

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="email"
                className="text-sm font-medium text-gray-700"
              >
                Email <span className="text-red-400">*</span>
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@ejemplo.com"
                className="h-12 rounded-xl"
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="password"
                className="text-sm font-medium text-gray-700"
              >
                Contrasena <span className="text-red-400">*</span>
              </label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimo 6 caracteres"
                className="h-12 rounded-xl"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 w-full h-12 rounded-xl text-base font-semibold text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                backgroundColor: loading
                  ? "#c44d02"
                  : "var(--brand, #ea580c)",
              }}
            >
              {loading ? "Creando admin..." : "Crear Admin"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Esta pagina solo funciona si no hay administradores configurados.
        </p>
      </div>
    </div>
  );
}
