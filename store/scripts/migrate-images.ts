/**
 * migrate-images.ts
 *
 * Migra imágenes de Firebase/Kyte → Supabase Storage (bucket: product-images)
 *
 * Qué hace:
 *  1. Lee todos los productos con image_url de Firebase
 *  2. Lee todos los registros de product_images con URL de Firebase
 *  3. Descarga cada imagen y la sube a Supabase Storage
 *  4. Actualiza products.image_url y product_images.url con la nueva URL
 *
 * Re-ejecutable: solo procesa URLs que aún contienen "firebasestorage" o "kyte-7c484"
 * NO toca Kyte en absoluto — solo lee las URLs que ya están en Supabase.
 *
 * Uso:
 *   npx tsx store/scripts/migrate-images.ts
 *
 * Variables necesarias en store/.env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import * as https from "https";
import * as http from "http";
import { URL } from "url";

// ── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const BUCKET = "product-images";

// Delay entre uploads para no saturar
const DELAY_MS = 200;

// ── Helpers ─────────────────────────────────────────────────────────────────

function isFirebaseUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes("firebasestorage.googleapis.com") || url.includes("kyte-7c484");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function downloadBuffer(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;

    const req = lib.get(url, { timeout: 30000 }, (res) => {
      // Follow redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(downloadBuffer(res.headers.location));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url.slice(0, 80)}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () =>
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: (res.headers["content-type"] || "image/jpeg").split(";")[0],
        })
      );
      res.on("error", reject);
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Timeout downloading ${url.slice(0, 80)}`));
    });
  });
}

function extFromContentType(ct: string): string {
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif")) return "gif";
  return "jpg";
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("❌ Faltan variables de entorno. Ejecutá desde store/ con dotenv o exportá manualmente.");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  console.log("🔍 Leyendo productos con imágenes Firebase...");

  // ── 1. Cargar productos con imagen Firebase ──────────────────────────────
  const { data: products, error: prodErr } = await supabase
    .from("products")
    .select("id, name, image_url")
    .not("image_url", "is", null)
    .order("id");

  if (prodErr) throw prodErr;

  const firebaseProducts = (products ?? []).filter((p) => isFirebaseUrl(p.image_url));
  console.log(`   ${products?.length} productos con imagen | ${firebaseProducts.length} en Firebase\n`);

  // ── 2. Cargar product_images con URL Firebase ────────────────────────────
  const { data: piRows, error: piErr } = await supabase
    .from("product_images")
    .select("id, product_id, url, is_primary, sort_order")
    .order("product_id");

  if (piErr) throw piErr;

  const firebasePiRows = (piRows ?? []).filter((r) => isFirebaseUrl(r.url));
  console.log(`   ${piRows?.length} product_images | ${firebasePiRows.length} en Firebase\n`);

  // ── 3. Migrar product_images ─────────────────────────────────────────────
  let piOk = 0, piSkip = 0, piFail = 0;

  console.log("📦 Migrando product_images...");
  for (const row of firebasePiRows) {
    const storagePath = `products/${row.product_id}/${row.id}.jpg`;

    try {
      const { buffer, contentType } = await downloadBuffer(row.url);
      const ext = extFromContentType(contentType);
      const path = `products/${row.product_id}/${row.id}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, buffer, {
          contentType,
          upsert: true,
        });

      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const newUrl = urlData.publicUrl;

      const { error: updateErr } = await supabase
        .from("product_images")
        .update({ url: newUrl })
        .eq("id", row.id);

      if (updateErr) throw updateErr;

      piOk++;
      if (piOk % 50 === 0) process.stdout.write(`   [${piOk}/${firebasePiRows.length}]\n`);
      else process.stdout.write(".");

      await sleep(DELAY_MS);
    } catch (e: unknown) {
      piFail++;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`\n   ⚠️  product_images ${row.id}: ${msg}`);
    }
  }

  console.log(`\n   ✅ product_images: ${piOk} ok, ${piFail} errores\n`);

  // ── 4. Migrar products.image_url ─────────────────────────────────────────
  let pOk = 0, pFail = 0;

  console.log("🖼️  Actualizando products.image_url...");

  for (const product of firebaseProducts) {
    // Buscar si ya existe en product_images migrado
    const { data: existing } = await supabase
      .from("product_images")
      .select("url")
      .eq("product_id", product.id)
      .eq("is_primary", true)
      .single();

    if (existing?.url && !isFirebaseUrl(existing.url)) {
      // Ya migrado en product_images — usar esa URL
      const { error } = await supabase
        .from("products")
        .update({ image_url: existing.url })
        .eq("id", product.id);
      if (error) { pFail++; continue; }
      pOk++;
      process.stdout.write(".");
      continue;
    }

    // No hay registro en product_images — descargar directamente
    try {
      const { buffer, contentType } = await downloadBuffer(product.image_url);
      const ext = extFromContentType(contentType);
      const path = `products/${product.id}/main.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType, upsert: true });

      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
      const newUrl = urlData.publicUrl;

      const { error: updateErr } = await supabase
        .from("products")
        .update({ image_url: newUrl })
        .eq("id", product.id);

      if (updateErr) throw updateErr;

      pOk++;
      process.stdout.write(".");
      await sleep(DELAY_MS);
    } catch (e: unknown) {
      pFail++;
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`\n   ⚠️  product ${product.id} (${product.name?.slice(0, 30)}): ${msg}`);
    }
  }

  console.log(`\n   ✅ products: ${pOk} ok, ${pFail} errores\n`);

  // ── Resumen ──────────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════");
  console.log(`✅ Migración completa`);
  console.log(`   product_images: ${piOk}/${firebasePiRows.length} migrados`);
  console.log(`   products:       ${pOk}/${firebaseProducts.length} actualizados`);
  if (piFail + pFail > 0) {
    console.log(`   ⚠️  Errores: ${piFail + pFail} — Re-ejecutá el script para reintentar`);
  }
}

main().catch((e) => {
  console.error("Error fatal:", e);
  process.exit(1);
});
