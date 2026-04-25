"use client";

// Propaga el tenant resuelto en proxy.ts (server) a Client Components.
// El TenantProvider se monta en app/layout.tsx con el tenant ya resuelto;
// los componentes hijos consumen vía useTenant() o useTenantId().
//
// Si el tenant es null (página /tenant-not-found, /superadmin), useTenant() devuelve null
// y el caller debe manejar ese caso.

import { createContext, useContext, type ReactNode } from "react";
import type { Branding } from "@/lib/branding";

export type TenantContextValue = {
  id: string;
  slug: string;
  name?: string;
  logo_url?: string | null;
  branding?: Branding;
} | null;

const TenantContext = createContext<TenantContextValue>(null);

export function TenantProvider({
  tenant,
  children,
}: {
  tenant: TenantContextValue;
  children: ReactNode;
}) {
  return (
    <TenantContext.Provider value={tenant}>{children}</TenantContext.Provider>
  );
}

export function useTenant(): TenantContextValue {
  return useContext(TenantContext);
}

// Variante que lanza si no hay tenant — usar en componentes que sí o sí lo necesitan.
export function useTenantId(): string {
  const t = useContext(TenantContext);
  if (!t) {
    throw new Error(
      "useTenantId() llamado fuera de un tenant resuelto. Verificá el árbol de TenantProvider."
    );
  }
  return t.id;
}
