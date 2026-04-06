"use client";

import { useState } from "react";
import Link from "next/link";
import { resetPasswordForEmail } from "@/lib/auth-client";
import { Input } from "@/components/ui/input";

export default function RecuperarPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await resetPasswordForEmail(email.trim());

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <>
        <div className="flex flex-col items-center gap-4 py-4">
          {/* Envelope icon */}
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "#fff7ed" }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-8 h-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="#e85d04"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25H4.5a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5H4.5a2.25 2.25 0 00-2.25 2.25m19.5 0l-9.75 6.75L2.25 6.75"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 text-center">
            ¡Revisá tu bandeja de entrada!
          </h1>
          <p className="text-sm text-gray-500 text-center leading-relaxed">
            Enviamos un link para resetear tu contraseña a{" "}
            <span className="font-semibold text-gray-700">{email}</span>.
          </p>
          <p className="text-xs text-gray-400 text-center">
            Si no lo ves, revisá la carpeta de spam.
          </p>
        </div>

        <p className="mt-8 text-center text-sm text-gray-500">
          <Link
            href="/login"
            className="font-medium hover:underline"
            style={{ color: "var(--brand)" }}
          >
            ← Volver al inicio de sesión
          </Link>
        </p>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">
        Recuperar contraseña
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        Te enviamos un email con el link para resetear tu contraseña.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium text-gray-700">
            Email
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
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
          className="mt-1 w-full h-12 rounded-xl font-semibold text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ backgroundColor: loading ? "#c44d02" : "var(--brand)" }}
        >
          {loading ? "Enviando..." : "Enviar link"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        <Link
          href="/login"
          className="font-medium hover:underline"
          style={{ color: "var(--brand)" }}
        >
          ← Volver al inicio de sesión
        </Link>
      </p>
    </>
  );
}
