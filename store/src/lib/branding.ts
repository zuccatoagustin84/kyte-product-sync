// Branding por company — paleta, tipografía y radio.
//
// Se persiste en companies.settings.branding (JSONB).
// El RootLayout server-side lee la company por host, arma un <style> con CSS
// vars y lo inyecta en <head>. Los componentes consumen los vars (--brand,
// --navy, --radius-base, --font-style) sin saber cómo se eligieron.
//
// Cada preset define una identidad visual completa (colores + estilo).
// Custom permite editar manualmente sobre cualquier preset.

export type BrandingStyle = "rounded" | "square" | "modern";

export type Branding = {
  preset: string;          // id del preset elegido — "custom" si el user editó libre
  brand: string;           // color principal — botones, badges, acentos
  brand_dark: string;      // hover/active del brand
  navy: string;            // color de header/sidebar
  navy_light: string;      // gradientes/hover sobre navy
  style: BrandingStyle;    // afecta border-radius global
  font_heading?: string;   // futuro — por ahora siempre Plus Jakarta
};

export const BRANDING_PRESETS: Record<string, Branding> = {
  mptools: {
    preset: "mptools",
    brand: "#e85d04",
    brand_dark: "#c44d02",
    navy: "#1a1a2e",
    navy_light: "#16213e",
    style: "rounded",
  },
  ocean: {
    preset: "ocean",
    brand: "#0ea5e9",
    brand_dark: "#0284c7",
    navy: "#0f172a",
    navy_light: "#1e293b",
    style: "rounded",
  },
  forest: {
    preset: "forest",
    brand: "#10b981",
    brand_dark: "#059669",
    navy: "#1c1917",
    navy_light: "#292524",
    style: "rounded",
  },
  midnight: {
    preset: "midnight",
    brand: "#a855f7",
    brand_dark: "#9333ea",
    navy: "#0c0a1d",
    navy_light: "#1a1530",
    style: "modern",
  },
  carbon: {
    preset: "carbon",
    brand: "#f59e0b",
    brand_dark: "#d97706",
    navy: "#0a0a0a",
    navy_light: "#171717",
    style: "square",
  },
  sunset: {
    preset: "sunset",
    brand: "#ef4444",
    brand_dark: "#dc2626",
    navy: "#7c2d12",
    navy_light: "#9a3412",
    style: "rounded",
  },
};

export const DEFAULT_BRANDING: Branding = BRANDING_PRESETS.mptools;

// Radio base por estilo. El @theme inline en globals.css multiplica este valor
// para los radios derivados (sm, md, lg, xl…).
const STYLE_RADIUS: Record<BrandingStyle, string> = {
  rounded: "0.625rem",
  modern: "0.875rem",
  square: "0.25rem",
};

export function brandingToCss(b: Branding): string {
  const radius = STYLE_RADIUS[b.style] ?? STYLE_RADIUS.rounded;
  return `
:root{
  --brand:${b.brand};
  --brand-dark:${b.brand_dark};
  --navy:${b.navy};
  --navy-light:${b.navy_light};
  --radius:${radius};
}`.trim();
}

// Coerciona un valor desconocido a Branding seguro (para leer de DB sin tipos).
export function coerceBranding(raw: unknown): Branding {
  if (!raw || typeof raw !== "object") return DEFAULT_BRANDING;
  const r = raw as Record<string, unknown>;

  const presetId = typeof r.preset === "string" ? r.preset : "custom";
  const base =
    presetId !== "custom" && BRANDING_PRESETS[presetId]
      ? BRANDING_PRESETS[presetId]
      : DEFAULT_BRANDING;

  return {
    preset: presetId,
    brand: typeof r.brand === "string" ? r.brand : base.brand,
    brand_dark: typeof r.brand_dark === "string" ? r.brand_dark : base.brand_dark,
    navy: typeof r.navy === "string" ? r.navy : base.navy,
    navy_light:
      typeof r.navy_light === "string" ? r.navy_light : base.navy_light,
    style:
      r.style === "rounded" || r.style === "square" || r.style === "modern"
        ? r.style
        : base.style,
  };
}
