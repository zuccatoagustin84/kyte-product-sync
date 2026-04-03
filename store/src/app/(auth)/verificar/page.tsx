"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { resendConfirmation } from "@/lib/auth-client";

function VerificarContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") ?? "";

  const [resendLoading, setResendLoading] = useState(false);
  const [resendDone, setResendDone] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);

  async function handleResend() {
    if (!email) return;
    setResendError(null);
    setResendLoading(true);

    const { error } = await resendConfirmation(email);

    if (error) {
      setResendError(error.message);
    } else {
      setResendDone(true);
    }

    setResendLoading(false);
  }

  return (
    <div className="flex flex-col items-center gap-4 py-4">
      {/* Envelope SVG */}
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center"
        style={{ backgroundColor: "#fff7ed" }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-10 h-10"
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
        Revisá tu email
      </h1>

      <p className="text-sm text-gray-500 text-center leading-relaxed max-w-sm">
        Enviamos un link de confirmación a tu casilla.{" "}
        {email && (
          <span className="font-semibold text-gray-700">{email}</span>
        )}
        {email && ". "}
        Hacé click en el link para activar tu cuenta.
      </p>

      <p className="text-xs text-gray-400 text-center">
        Si no lo ves, revisá la carpeta de spam.
      </p>

      <div className="mt-2 w-full flex flex-col items-center gap-2">
        {resendDone ? (
          <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2 w-full text-center">
            Email reenviado. Revisá tu bandeja.
          </p>
        ) : (
          <>
            {resendError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 w-full text-center">
                {resendError}
              </p>
            )}
            <button
              onClick={handleResend}
              disabled={resendLoading || !email}
              className="text-sm font-medium hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ color: "var(--brand)" }}
            >
              {resendLoading ? "Reenviando..." : "Reenviar email"}
            </button>
          </>
        )}
      </div>

      <p className="mt-4 text-center text-sm text-gray-500">
        <Link
          href="/login"
          className="font-medium hover:underline"
          style={{ color: "var(--brand)" }}
        >
          ← Volver al inicio de sesión
        </Link>
      </p>
    </div>
  );
}

export default function VerificarPage() {
  return (
    <Suspense
      fallback={
        <div className="h-64 flex items-center justify-center text-gray-400">
          Cargando...
        </div>
      }
    >
      <VerificarContent />
    </Suspense>
  );
}
