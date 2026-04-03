"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signUp } from "@/lib/auth-client";
import { Input } from "@/components/ui/input";

export default function RegistroPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }

    setLoading(true);

    const { error } = await signUp(
      email,
      password,
      fullName,
      company || undefined,
      phone || undefined
    );

    if (error) {
      if (error.message.toLowerCase().includes("already registered")) {
        setError("Ya existe una cuenta con este email.");
      } else {
        setError(error.message);
      }
      setLoading(false);
      return;
    }

    router.push("/?bienvenido=1");
    router.refresh();
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Crear cuenta</h1>
      <p className="text-sm text-gray-500 mb-6">
        Registrate para acceder al catálogo mayorista
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="fullName"
            className="text-sm font-medium text-gray-700"
          >
            Nombre completo <span className="text-red-500">*</span>
          </label>
          <Input
            id="fullName"
            type="text"
            autoComplete="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Juan Pérez"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium text-gray-700">
            Email <span className="text-red-500">*</span>
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

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="password"
            className="text-sm font-medium text-gray-700"
          >
            Contraseña <span className="text-red-500">*</span>
          </label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 6 caracteres"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="company"
            className="text-sm font-medium text-gray-700"
          >
            Empresa / Negocio{" "}
            <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <Input
            id="company"
            type="text"
            autoComplete="organization"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Nombre del negocio"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="phone" className="text-sm font-medium text-gray-700">
            Teléfono{" "}
            <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+54 9 11 1234-5678"
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
          className="mt-1 w-full h-10 rounded-lg font-semibold text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ backgroundColor: loading ? "#c44d02" : "var(--brand)" }}
        >
          {loading ? "Creando cuenta..." : "Crear cuenta"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        ¿Ya tenés cuenta?{" "}
        <Link
          href="/login"
          className="font-medium hover:underline"
          style={{ color: "var(--brand)" }}
        >
          Iniciar sesión
        </Link>
      </p>
    </>
  );
}
