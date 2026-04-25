"use client";

// Componente único para mostrar el logo / nombre de la company.
// Lee del TenantProvider (si está disponible) o cae a un placeholder.

import { useTenant } from "@/components/TenantProvider";

type Props = {
  variant?: "header" | "sidebar" | "compact";
  className?: string;
};

export function BrandLogo({ variant = "header", className = "" }: Props) {
  const tenant = useTenant();
  const name = tenant?.name ?? "Tienda";
  const logoUrl = tenant?.logo_url ?? null;

  if (logoUrl) {
    const heightClass =
      variant === "sidebar" ? "h-8" : variant === "compact" ? "h-6" : "h-9";
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={name}
        className={`${heightClass} w-auto object-contain ${className}`}
      />
    );
  }

  if (variant === "sidebar") {
    return (
      <span
        className={`text-white font-bold text-lg tracking-tight ${className}`}
      >
        {name}
      </span>
    );
  }

  if (variant === "compact") {
    return (
      <span
        className={`text-base font-extrabold tracking-wide ${className}`}
        style={{ color: "var(--brand)" }}
      >
        {name.toUpperCase()}
      </span>
    );
  }

  return (
    <span
      className={`text-xl font-black tracking-tight ${className}`}
      style={{ color: "var(--brand)" }}
    >
      {name.toUpperCase()}
    </span>
  );
}
