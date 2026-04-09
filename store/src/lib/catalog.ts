/**
 * Catalog HTML generator — port of web/src/lib/catalog.ts adapted to the
 * store's Supabase-based Product type.
 */
import type { Product } from "./types";

export interface CatalogProduct {
  name: string;
  code: string;
  salePrice: number;
  imageUrl: string | null;
  hasImage: boolean;
}

export interface CatalogCategory {
  name: string;
  products: CatalogProduct[];
}

export function buildCategories(
  products: Product[],
  options: { filterCategory?: string; showPrices?: boolean } = {}
): CatalogCategory[] {
  const { filterCategory } = options;
  const buckets = new Map<string, CatalogProduct[]>();

  for (const p of products) {
    if (!p.active) continue;
    const catName = p.category?.name?.trim() || "Sin categoría";
    if (filterCategory && catName.toLowerCase() !== filterCategory.toLowerCase()) continue;

    const imageUrl = p.image_url || null;
    const prod: CatalogProduct = {
      name: p.name ?? "",
      code: String(p.code ?? ""),
      salePrice: p.sale_price ?? 0,
      imageUrl,
      hasImage: !!imageUrl,
    };

    if (!buckets.has(catName)) buckets.set(catName, []);
    buckets.get(catName)!.push(prod);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, prods]) => ({
      name,
      products: prods.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

function formatPrice(value: number): string {
  return "$" + Math.round(value).toLocaleString("es-AR");
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function generateCatalogHtml(
  categories: CatalogCategory[],
  opts: { companyName?: string; generatedDate?: string; showPrices?: boolean } = {}
): string {
  const {
    companyName = "MP.TOOLS MAYORISTA",
    generatedDate = new Date().toLocaleDateString("es-AR", {
      day: "numeric", month: "long", year: "numeric",
    }),
    showPrices = true,
  } = opts;

  const totalProducts = categories.reduce((s, c) => s + c.products.length, 0);

  const PLACEHOLDER_SVG = `<div class="placeholder"><svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M32 6L6 20v24l26 14 26-14V20L32 6z"/><path d="M32 6v38M6 20l26 14 26-14"/></svg><span>Sin imagen</span></div>`;

  const categoryHtml = categories.map((cat) => {
    const productsHtml = cat.products.map((p) => {
      const imgHtml = p.hasImage && p.imageUrl
        ? `<img src="${escapeHtml(p.imageUrl)}" alt="${escapeHtml(p.name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>${PLACEHOLDER_SVG}`
        : PLACEHOLDER_SVG;

      const priceHtml = showPrices
        ? `<div class="price"><span class="price-label">Precio mayorista</span><span class="price-value">${formatPrice(p.salePrice)}</span></div>`
        : "";

      return `<div class="card">
  <div class="img-wrap">${imgHtml}</div>
  <div class="card-body">
    <div class="name">${escapeHtml(p.name)}</div>
    <div class="code">Cód: ${escapeHtml(p.code)}</div>
    ${priceHtml}
  </div>
</div>`;
    }).join("\n");

    return `<div class="category">
  <div class="cat-header">
    <div class="cat-left"><div class="cat-bar"></div><div><div class="cat-name">${escapeHtml(cat.name)}</div><div class="cat-count">${cat.products.length} producto${cat.products.length !== 1 ? "s" : ""}</div></div></div>
    <div class="cat-badge">Lista Mayorista</div>
  </div>
  <div class="grid">${productsHtml}</div>
</div>`;
  }).join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${escapeHtml(companyName)} — Catálogo</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--navy:#1a1a2e;--navy-mid:#16213e;--navy-light:#0f3460;--accent:#e94560;--accent-light:#ff6b81;--border:#e0e0e6;--bg:#f4f4f8;--font:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
html{font-size:14px}body{font-family:var(--font);background:var(--bg);color:var(--navy);line-height:1.4}
/* Cover */
.cover{width:210mm;min-height:297mm;margin:0 auto 2rem;background:linear-gradient(160deg,var(--navy) 0%,var(--navy-mid) 55%,var(--navy-light) 100%);display:flex;align-items:center;justify-content:center;padding:60px 48px;position:relative;overflow:hidden;page-break-after:always;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.cover::before{content:"";position:absolute;top:-80px;right:-80px;width:320px;height:320px;border-radius:50%;border:40px solid rgba(233,69,96,.15)}
.cover::after{content:"";position:absolute;bottom:-60px;left:-60px;width:240px;height:240px;border-radius:50%;border:30px solid rgba(255,255,255,.05)}
.cover-inner{position:relative;z-index:1;text-align:center;max-width:480px}
.logo-ring{width:100px;height:100px;border-radius:50%;background:rgba(233,69,96,.18);border:3px solid rgba(233,69,96,.5);display:flex;align-items:center;justify-content:center;margin:0 auto 32px}
.cover-company{font-size:2.4rem;font-weight:800;letter-spacing:.05em;color:#fff;text-transform:uppercase;line-height:1.1;margin-bottom:12px}
.cover-company span{display:block;font-size:1.1rem;font-weight:400;letter-spacing:.3em;color:rgba(255,255,255,.6);margin-top:6px}
.cover-rule{width:60px;height:4px;background:var(--accent);border-radius:2px;margin:28px auto;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.cover-title{font-size:1.6rem;font-weight:700;color:#fff;letter-spacing:.04em;margin-bottom:8px}
.cover-date{font-size:.95rem;color:rgba(255,255,255,.55);letter-spacing:.06em;text-transform:uppercase}
.cover-stats{margin-top:48px;display:flex;gap:48px;justify-content:center}
.stat-value{font-size:2rem;font-weight:700;color:var(--accent-light);line-height:1}
.stat-label{font-size:.7rem;color:rgba(255,255,255,.45);letter-spacing:.12em;text-transform:uppercase;margin-top:6px}
/* Category */
.category{width:210mm;margin:0 auto 2rem;background:var(--bg);page-break-before:always}
.cat-header{background:var(--navy);color:#fff;padding:18px 24px;display:flex;align-items:center;justify-content:space-between;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.cat-left{display:flex;align-items:center;gap:14px}
.cat-bar{width:5px;height:36px;background:var(--accent);border-radius:3px;flex-shrink:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.cat-name{font-size:1.2rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
.cat-count{font-size:.75rem;color:rgba(255,255,255,.5);margin-top:2px}
.cat-badge{background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:20px;padding:4px 14px;font-size:.75rem;font-weight:600;color:rgba(255,255,255,.8);-webkit-print-color-adjust:exact;print-color-adjust:exact}
/* Grid */
.grid{padding:16px;display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
/* Card */
.card{background:#fff;border:1px solid var(--border);border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(26,26,46,.07);display:flex;flex-direction:column}
.img-wrap{width:100%;aspect-ratio:1/1;background:#f8f8fb;overflow:hidden;border-bottom:1px solid var(--border);position:relative;display:flex;align-items:center;justify-content:center}
.img-wrap img{width:100%;height:100%;object-fit:cover;display:block}
.placeholder{width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#c8c8d8}
.placeholder svg{width:48px;height:48px;opacity:.4}
.placeholder span{font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;color:#c0c0d0}
.card-body{padding:10px 12px 14px;display:flex;flex-direction:column;gap:3px;flex:1}
.name{font-size:.8rem;font-weight:600;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.2em}
.code{font-size:.68rem;color:#8a8a9a;font-family:Consolas,monospace}
.price{margin-top:auto;padding-top:10px}
.price-label{display:block;font-size:.6rem;color:#8a8a9a;text-transform:uppercase;letter-spacing:.08em;margin-bottom:1px}
.price-value{font-size:1.05rem;font-weight:700;color:var(--navy)}
/* Print */
@media print{
  @page{size:A4 portrait;margin:12mm 12mm 18mm 12mm;@bottom-left{content:"${escapeHtml(companyName)}";font-size:8pt;color:#8a8a9a;font-family:-apple-system,sans-serif}@bottom-right{content:"Página " counter(page) " de " counter(pages);font-size:8pt;color:#8a8a9a;font-family:-apple-system,sans-serif}@bottom-center{content:"${escapeHtml(generatedDate)}";font-size:8pt;color:#c0c0d0;font-family:-apple-system,sans-serif}}
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  html,body{background:#fff;font-size:10pt}
  .cover{width:100%;height:100vh;min-height:0;margin:0;page-break-after:always}
  .category{width:100%;margin:0;page-break-before:always}
  .cat-header{page-break-after:avoid}
  .card{box-shadow:none!important;border:1px solid #d8d8e4;break-inside:avoid;page-break-inside:avoid}
  .grid{grid-template-columns:repeat(3,1fr);gap:8px;padding:12px}
  .img-wrap{max-height:130px}
  .name{font-size:7.5pt}.code{font-size:6.5pt}.price-value{font-size:9pt}.cat-name{font-size:11pt}
}
</style>
</head>
<body>
<div class="cover">
  <div class="cover-inner">
    <div class="logo-ring">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="52" height="52" fill="none" stroke="#e94560" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M14 50l22-22"/><path d="M36 28a10 10 0 1 0-10-10c0 2 .6 3.8 1.5 5.3L10 41a3 3 0 0 0 4.2 4.2L31.7 27.5A10 10 0 0 0 36 28z"/>
        <circle cx="46" cy="44" r="8"/><path d="M46 38v-3M46 53v-3M40 44h-3M55 44h-3"/><circle cx="46" cy="44" r="3"/>
      </svg>
    </div>
    <div class="cover-company">${escapeHtml(companyName.split(" ")[0])}<span>${escapeHtml(companyName.split(" ").slice(1).join(" "))}</span></div>
    <div class="cover-rule"></div>
    <div class="cover-title">Catálogo de Productos</div>
    <div class="cover-date">${escapeHtml(generatedDate)}</div>
    <div class="cover-stats">
      <div><div class="stat-value">${categories.length}</div><div class="stat-label">Categorías</div></div>
      <div><div class="stat-value">${totalProducts}</div><div class="stat-label">Productos</div></div>
    </div>
  </div>
</div>
${categoryHtml}
</body>
</html>`;
}
