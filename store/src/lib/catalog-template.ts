// Catálogo HTML — generador server-side. Migración del template Jinja del
// proyecto Streamlit (catalog_template.html / catalog_list_template.html).
//
// Dos formatos:
//   - "grid": grilla 3 columnas, foco en imagen (catálogo visual)
//   - "list": lista densa con imagen pequeña y descripción (lista de precios)
//
// El HTML resultante es self-contained (CSS inline) — listo para descargar
// directo o para renderizar a PDF con puppeteer. Se imprime con @page A4.

export type CatalogProduct = {
  name: string;
  code: string;
  salePrice: number;
  imageUrl: string | null;
  description?: string | null;
};

export type CatalogCategory = {
  name: string;
  products: CatalogProduct[];
};

export type CatalogOptions = {
  companyName: string;
  format: "grid" | "list";
  showPrices: boolean;
  generatedDate: string;
  totalProducts: number;
  categories: CatalogCategory[];
  // Para PDF, queremos que las imágenes se carguen via data: URI o URL absolutas.
  // No necesitamos hacer nada especial acá — las URLs ya vienen completas.
};

const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function formatGeneratedDate(d: Date = new Date()): string {
  return `${d.getDate()} de ${MONTHS_ES[d.getMonth()]} de ${d.getFullYear()}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPrice(value: number): string {
  // Argentino: $1.234 (sin decimales).
  const rounded = Math.round(value);
  return `$${rounded.toLocaleString("es-AR")}`;
}

const PLACEHOLDER_SVG = `
<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
  <path d="M32 6L6 20v24l26 14 26-14V20L32 6z"/>
  <path d="M32 6v38M6 20l26 14 26-14"/>
</svg>`;

// ── GRID FORMAT ──────────────────────────────────────────────────────────────

function renderGridCard(p: CatalogProduct, showPrices: boolean): string {
  const name = escapeHtml(p.name);
  const code = escapeHtml(p.code || "");
  const hasImage = !!p.imageUrl;
  const imageUrl = p.imageUrl ? escapeHtml(p.imageUrl) : "";

  return `
    <div class="product-card">
      <div class="card-image-wrap">
        ${hasImage
          ? `<img src="${imageUrl}" alt="${name}" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" />
             <div class="card-image-placeholder" style="display:none">${PLACEHOLDER_SVG}<span>Sin imagen</span></div>`
          : `<div class="card-image-placeholder">${PLACEHOLDER_SVG}<span>Sin imagen</span></div>`
        }
      </div>
      <div class="card-body">
        <div class="card-name">${name}</div>
        ${code ? `<div class="card-code">Cód: ${code}</div>` : ""}
        ${showPrices ? `
          <div class="card-price">
            <span class="card-price-label">Precio mayorista</span>
            <span class="card-price-value">${formatPrice(p.salePrice)}</span>
          </div>
        ` : ""}
      </div>
    </div>`;
}

function renderGridCategory(cat: CatalogCategory, showPrices: boolean): string {
  return `
    <div class="category-section">
      <div class="category-header">
        <div class="category-header-left">
          <div class="category-accent-bar"></div>
          <div>
            <div class="category-name">${escapeHtml(cat.name)}</div>
            <div class="category-count">${cat.products.length} producto${cat.products.length !== 1 ? "s" : ""}</div>
          </div>
        </div>
        <div class="category-badge">${showPrices ? "Lista Mayorista" : "Catálogo"}</div>
      </div>
      <div class="product-grid">
        ${cat.products.map((p) => renderGridCard(p, showPrices)).join("")}
      </div>
    </div>`;
}

// ── LIST FORMAT ──────────────────────────────────────────────────────────────

function renderListItem(p: CatalogProduct, showPrices: boolean): string {
  const name = escapeHtml(p.name);
  const code = escapeHtml(p.code || "");
  const desc = p.description ? escapeHtml(p.description) : "";
  const hasImage = !!p.imageUrl;
  const imageUrl = p.imageUrl ? escapeHtml(p.imageUrl) : "";

  return `
    <div class="list-item">
      <div class="list-image-wrap">
        ${hasImage
          ? `<img src="${imageUrl}" alt="${name}" referrerpolicy="no-referrer" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" />
             <div class="list-image-placeholder" style="display:none">${PLACEHOLDER_SVG}</div>`
          : `<div class="list-image-placeholder">${PLACEHOLDER_SVG}</div>`
        }
      </div>
      <div class="list-info">
        <div class="list-name">${name}</div>
        ${code ? `<div class="list-code">Cód: ${code}</div>` : ""}
        ${desc ? `<div class="list-desc">${desc}</div>` : ""}
      </div>
      ${showPrices ? `<div class="list-price">${formatPrice(p.salePrice)}</div>` : ""}
    </div>`;
}

function renderListCategory(cat: CatalogCategory, showPrices: boolean): string {
  return `
    <div class="category-section">
      <div class="category-header">
        <div class="category-header-left">
          <div class="category-accent-bar"></div>
          <div>
            <div class="category-name">${escapeHtml(cat.name)}</div>
            <div class="category-count">${cat.products.length} producto${cat.products.length !== 1 ? "s" : ""}</div>
          </div>
        </div>
      </div>
      <div class="list-items">
        ${cat.products.map((p) => renderListItem(p, showPrices)).join("")}
      </div>
    </div>`;
}

// ── CSS ──────────────────────────────────────────────────────────────────────

const COMMON_CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --navy: #1a1a2e;
  --navy-mid: #16213e;
  --navy-light: #0f3460;
  --accent: #e94560;
  --accent-light: #ff6b81;
  --gray-border: #e0e0e6;
  --gray-light: #f4f4f8;
  --gray-muted: #8a8a9a;
  --card-bg: #ffffff;
  --text-primary: #1a1a2e;
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}
html { font-size: 14px; }
body {
  font-family: var(--font);
  background: var(--gray-light);
  color: var(--text-primary);
  line-height: 1.4;
}

.cover-page {
  width: 210mm;
  min-height: 297mm;
  margin: 0 auto 2rem;
  background: linear-gradient(160deg, var(--navy) 0%, var(--navy-mid) 55%, var(--navy-light) 100%);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 60px 48px; position: relative; overflow: hidden;
  page-break-after: always;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.cover-page::before {
  content: ""; position: absolute; top: -80px; right: -80px;
  width: 320px; height: 320px; border-radius: 50%;
  border: 40px solid rgba(233,69,96,0.15);
}
.cover-page::after {
  content: ""; position: absolute; bottom: -60px; left: -60px;
  width: 240px; height: 240px; border-radius: 50%;
  border: 30px solid rgba(255,255,255,0.05);
}
.cover-inner { position: relative; z-index: 1; text-align: center; max-width: 480px; }
.cover-logo-ring {
  width: 100px; height: 100px; border-radius: 50%;
  background: rgba(233,69,96,0.18); border: 3px solid rgba(233,69,96,0.5);
  display: flex; align-items: center; justify-content: center; margin: 0 auto 32px;
}
.cover-company {
  font-size: 2.4rem; font-weight: 800; letter-spacing: 0.05em;
  color: #ffffff; text-transform: uppercase; line-height: 1.1; margin-bottom: 12px;
}
.cover-rule { width: 60px; height: 4px; background: var(--accent); border-radius: 2px; margin: 28px auto; }
.cover-title { font-size: 1.6rem; font-weight: 700; color: #ffffff; letter-spacing: 0.04em; margin-bottom: 8px; }
.cover-date { font-size: 0.95rem; color: rgba(255,255,255,0.55); letter-spacing: 0.06em; text-transform: uppercase; }
.cover-stats { margin-top: 48px; display: flex; gap: 48px; justify-content: center; }
.cover-stat-value { font-size: 2rem; font-weight: 700; color: var(--accent-light); line-height: 1; }
.cover-stat-label {
  font-size: 0.7rem; color: rgba(255,255,255,0.45);
  letter-spacing: 0.12em; text-transform: uppercase; margin-top: 6px;
}

.category-section { width: 210mm; margin: 0 auto 2rem; background: var(--gray-light); page-break-before: always; }
.category-header {
  background: var(--navy); color: #ffffff; padding: 18px 24px;
  display: flex; align-items: center; justify-content: space-between;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.category-header-left { display: flex; align-items: center; gap: 14px; }
.category-accent-bar {
  width: 5px; height: 36px; background: var(--accent); border-radius: 3px; flex-shrink: 0;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
.category-name { font-size: 1.2rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
.category-count { font-size: 0.75rem; color: rgba(255,255,255,0.5); letter-spacing: 0.06em; margin-top: 2px; }
.category-badge {
  background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);
  border-radius: 20px; padding: 4px 14px; font-size: 0.75rem; font-weight: 600;
  color: rgba(255,255,255,0.8); white-space: nowrap;
}
`;

const GRID_CSS = `
.product-grid { padding: 16px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.product-card {
  background: var(--card-bg); border: 1px solid var(--gray-border); border-radius: 8px;
  overflow: hidden; box-shadow: 0 1px 4px rgba(26,26,46,0.07);
  display: flex; flex-direction: column;
}
.card-image-wrap {
  width: 100%; aspect-ratio: 1 / 1; background: #f8f8fb;
  overflow: hidden; border-bottom: 1px solid var(--gray-border); position: relative;
}
.card-image-wrap img {
  width: 100%; height: 100%; object-fit: contain; display: block; padding: 8px;
}
.card-image-placeholder {
  width: 100%; height: 100%; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 8px; color: #c8c8d8;
}
.card-image-placeholder svg { width: 48px; height: 48px; opacity: 0.4; }
.card-image-placeholder span {
  font-size: 0.62rem; letter-spacing: 0.1em; text-transform: uppercase; color: #c0c0d0;
}
.card-body { padding: 10px 12px 14px; display: flex; flex-direction: column; gap: 3px; flex: 1; }
.card-name {
  font-size: 0.8rem; font-weight: 600; color: var(--text-primary); line-height: 1.35;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; min-height: 2.2em;
}
.card-code {
  font-size: 0.68rem; color: var(--gray-muted);
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace; letter-spacing: 0.04em;
}
.card-price { margin-top: auto; padding-top: 10px; }
.card-price-label {
  display: block; font-size: 0.6rem; color: var(--gray-muted);
  text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 1px;
}
.card-price-value { font-size: 1.05rem; font-weight: 700; color: var(--navy); }

@media print {
  @page { size: A4 portrait; margin: 12mm 12mm 18mm 12mm; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  html, body { background: #ffffff; font-size: 10pt; }
  .cover-page { width: 100%; height: 100vh; min-height: 0; margin: 0; }
  .category-section { width: 100%; margin: 0; page-break-before: always; }
  .category-header { page-break-after: avoid; }
  .product-card { box-shadow: none !important; border: 1px solid #d8d8e4; break-inside: avoid; page-break-inside: avoid; }
  .product-grid { grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 12px; }
  .card-image-wrap { max-height: 140px; aspect-ratio: auto; }
  .card-image-wrap img { padding: 4px; max-height: 140px; width: auto; margin: 0 auto; }
  .card-name { font-size: 7.5pt; }
  .card-code { font-size: 6.5pt; }
  .card-price-value { font-size: 9pt; }
  .category-name { font-size: 11pt; }
}
`;

const LIST_CSS = `
.list-items { padding: 0 16px 16px; display: flex; flex-direction: column; gap: 0; }
.list-item {
  display: flex; align-items: center; gap: 14px;
  padding: 10px 12px; border-bottom: 1px solid var(--gray-border);
  background: var(--card-bg);
}
.list-item:nth-child(even) { background: #fafafd; }
.list-image-wrap {
  width: 72px; height: 72px; flex-shrink: 0;
  background: #f8f8fb; border: 1px solid var(--gray-border); border-radius: 6px;
  overflow: hidden; display: flex; align-items: center; justify-content: center;
}
.list-image-wrap img {
  width: 100%; height: 100%; object-fit: contain; padding: 4px;
}
.list-image-placeholder {
  display: flex; align-items: center; justify-content: center;
  width: 100%; height: 100%; color: #c8c8d8;
}
.list-image-placeholder svg { width: 28px; height: 28px; opacity: 0.4; }
.list-info { flex: 1; min-width: 0; }
.list-name { font-size: 0.95rem; font-weight: 600; color: var(--text-primary); margin-bottom: 2px; }
.list-code {
  font-size: 0.72rem; color: var(--gray-muted);
  font-family: "SFMono-Regular", Consolas, monospace; letter-spacing: 0.04em;
}
.list-desc {
  font-size: 0.78rem; color: #555; margin-top: 3px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.list-price {
  font-size: 1.1rem; font-weight: 700; color: var(--navy);
  flex-shrink: 0; padding-left: 16px; min-width: 110px; text-align: right;
}

@media print {
  @page { size: A4 portrait; margin: 12mm 12mm 18mm 12mm; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  html, body { background: #ffffff; font-size: 10pt; }
  .cover-page { width: 100%; height: 100vh; min-height: 0; margin: 0; }
  .category-section { width: 100%; margin: 0; page-break-before: always; }
  .category-header { page-break-after: avoid; }
  .list-item { break-inside: avoid; page-break-inside: avoid; padding: 6px 8px; }
  .list-image-wrap { width: 52px; height: 52px; }
  .list-name { font-size: 9pt; }
  .list-code { font-size: 6.5pt; }
  .list-desc { font-size: 7pt; }
  .list-price { font-size: 10pt; min-width: 80px; }
  .category-name { font-size: 11pt; }
}
`;

// ── Main render ──────────────────────────────────────────────────────────────

export function renderCatalogHtml(opts: CatalogOptions): string {
  const css = COMMON_CSS + (opts.format === "grid" ? GRID_CSS : LIST_CSS);
  const titleSuffix = opts.showPrices ? "Lista de Precios" : "Catálogo de Productos";
  const company = escapeHtml(opts.companyName);

  const renderCat = opts.format === "grid" ? renderGridCategory : renderListCategory;
  const categoriesHtml = opts.categories.map((c) => renderCat(c, opts.showPrices)).join("");

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${company} — ${titleSuffix}</title>
  <style>${css}</style>
</head>
<body>
  <div class="cover-page">
    <div class="cover-inner">
      <div class="cover-logo-ring">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="52" height="52"
             fill="none" stroke="#e94560" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 50l22-22"/>
          <path d="M36 28a10 10 0 1 0-10-10c0 2 .6 3.8 1.5 5.3L10 41a3 3 0 0 0 4.2 4.2L31.7 27.5A10 10 0 0 0 36 28z"/>
          <circle cx="46" cy="44" r="8"/>
          <path d="M46 38v-3M46 53v-3M40 44h-3M55 44h-3"/>
          <circle cx="46" cy="44" r="3"/>
        </svg>
      </div>
      <div class="cover-company">${company}</div>
      <div class="cover-rule"></div>
      <div class="cover-title">${titleSuffix}</div>
      <div class="cover-date">${escapeHtml(opts.generatedDate)}</div>
      <div class="cover-stats">
        <div class="cover-stat">
          <div class="cover-stat-value">${opts.categories.length}</div>
          <div class="cover-stat-label">Categorías</div>
        </div>
        <div class="cover-stat">
          <div class="cover-stat-value">${opts.totalProducts}</div>
          <div class="cover-stat-label">Productos</div>
        </div>
      </div>
    </div>
  </div>
  ${categoriesHtml}
</body>
</html>`;
}
