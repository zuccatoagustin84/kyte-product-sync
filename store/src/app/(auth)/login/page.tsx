"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "@/lib/auth-client";
import { Input } from "@/components/ui/input";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await signIn(email, password);

    if (error) {
      setError(
        error.message === "Invalid login credentials"
          ? "Email o contraseña incorrectos."
          : error.message
      );
      setLoading(false);
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Iniciar sesión</h1>
      <p className="text-sm text-gray-500 mb-6">Accedé a tu cuenta mayorista</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium text-gray-700">Email</label>
          <Input
            id="email" type="email" autoComplete="email" required
            value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium text-gray-700">Contraseña</label>
            <span className="text-xs text-gray-400 cursor-default">¿Olvidaste tu contraseña?</span>
          </div>
          <Input
            id="password" type="password" autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit" disabled={loading}
          className="mt-1 w-full h-10 rounded-lg font-semibold text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ backgroundColor: loading ? "#c44d02" : "var(--brand)" }}
        >
          {loading ? "Ingresando..." : "Iniciar sesión"}
        </button>
      </form>

      <div className="mt-6 flex flex-col gap-3 text-center text-sm">
        <p className="text-gray-500">
          ¿No tenés cuenta?{" "}
          <Link href="/registro" className="font-medium hover:underline" style={{ color: "var(--brand)" }}>
            Registrarse
          </Link>
        </p>
        <Link href="/" className="text-gray-400 hover:text-gray-600 transition-colors">
          Continuar sin registrarse →
        </Link>
      </div>
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="h-64 flex items-center justify-center text-gray-400">Cargando...</div>}>
      <LoginForm />
    </Suspense>
  );
}
