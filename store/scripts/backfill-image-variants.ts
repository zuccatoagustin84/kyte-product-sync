/**
 * backfill-image-variants.ts
 *
 * Para cada `product_images` que no tenga `thumb_url` o `medium_url`,
 * descarga la imagen actual (`url`), regenera las 3 variantes con sharp,
 * sube las nuevas al bucket y actualiza la row.
 *
 * También sincroniza products.thumb_image_url / medium_image_url para la
 * imagen marcada como is_primary.
 *
 * Re-ejecutable: salta rows que ya tengan ambas URLs seteadas.
 *
 * Uso:
 *   cd store && npx dotenv -e .env.local -- npx tsx scripts/backfill-image-variants.ts
 *   cd store && npx dotenv -e .env.local -- npx tsx scripts/backfill-image-variants.ts --dry-run
 *   cd store && npx dotenv -e .env.local -- npx tsx scripts/backfill-image-variants.ts --limit 50
 *
 * Variables necesarias en store/.env.local:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 */

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import * as https from "https";
import * as http from "http";
import { URL } from "url";

// ── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const BUCKET = "product-images";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const limitFlagIdx = args.indexOf("--limit");
const LIMIT = limitFlagIdx >= 0 ? parseInt(args[limitFlagIdx + 1] || "0", 10) : 0;

// Pequeño delay entre rows para no apurar a Supabase Storage.
const DELAY_MS = 100;

const SIZES = { thumb: 200, medium: 600, large: 1200 };

// ── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function downloadBuffer(url: string, depth = 0): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (depth > 5) {
      reject(new Error("Too many redirects"));
      return;
    }
    const parsed = new URL(url);
    const lib = parsed.protocol === "https:" ? https : http;

    const req = lib.get(
      url,
      {
        timeout: 30000,
        headers: { "User-Agent": "kyte-store-backfill/1.0" },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(downloadBuffer(res.headers.location, depth + 1));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url.slice(0, 80)}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      }
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Timeout downloading ${url.slice(0, 80)}`));
    });
  });
}

async function processImage(input: Buffer) {
  const meta = await sharp(input).metadata();

  async function resize(maxWidth: number, quality: number) {
    const pipeline = sharp(input, { failOn: "none" })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .resize({
        width: maxWidth,
        height: maxWidth,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality, progressive: true, mozjpeg: true });

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    return { buffer: data, width: info.width, height: info.height };
  }

  const [large, medium, thumb] = await Promise.all([
    resize(SIZES.large, 82),
    resize(SIZES.medium, 80),
    resize(SIZES.thumb, 75),
  ]);

  return { large, medium, thumb, originalWidth: meta.width ?? 0, originalHeight: meta.height ?? 0 };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error("❌ Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY en .env.local");
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  });

  console.log(`🔍 Buscando product_images sin thumb_url o medium_url${DRY_RUN ? " (DRY RUN)" : ""}...`);

  let query = supabase
    .from("product_images")
    .select("id, product_id, url, thumb_url, medium_url, is_primary, sort_order")
    .or("thumb_url.is.null,medium_url.is.null")
    .order("created_at", { ascending: true });

  if (LIMIT > 0) query = query.limit(LIMIT);

  const { data: rows, error } = await query;
  if (error) throw error;

  console.log(`   ${rows?.length ?? 0} rows pendientes\n`);

  if (!rows || rows.length === 0) {
    console.log("✅ Nada que hacer.");
    return;
  }

  let ok = 0;
  let fail = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const prefix = `[${i + 1}/${rows.length}] ${row.product_id}/${row.id}`;
    if (!row.url) {
      console.log(`${prefix} ⚠️  url vacía, salto`);
      fail++;
      continue;
    }

    try {
      const buffer = await downloadBuffer(row.url);
      const variants = await processImage(buffer);

      if (DRY_RUN) {
        console.log(
          `${prefix} ✓ procesaría: ${variants.large.width}x${variants.large.height} → thumb ${variants.thumb.width}px / medium ${variants.medium.width}px`
        );
        ok++;
        continue;
      }

      // Subir las nuevas variantes con un keyPrefix nuevo basado en este row.id
      // (no querían pisar el archivo `url` original por si rompemos algo).
      const keyPrefix = `${row.product_id}/backfill-${row.id}-${Date.now()}`;

      const put = async (name: string, buf: Buffer): Promise<string> => {
        const path = `${keyPrefix}-${name}.jpg`;
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, buf, { contentType: "image/jpeg", upsert: false });
        if (upErr) throw new Error(`upload ${name}: ${upErr.message}`);
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        return data.publicUrl;
      };

      // Sólo regeneramos variantes faltantes; el `url` (large) lo dejamos como
      // está si ya existe, para no romper referencias.
      const updates: Record<string, unknown> = {};

      if (!row.thumb_url) {
        updates.thumb_url = await put("thumb", variants.thumb.buffer);
      }
      if (!row.medium_url) {
        updates.medium_url = await put("medium", variants.medium.buffer);
      }

      // Width/height sólo si faltan (la columna existe pero podría ser NULL).
      updates.width = variants.large.width;
      updates.height = variants.large.height;

      const { error: updErr } = await supabase
        .from("product_images")
        .update(updates)
        .eq("id", row.id);

      if (updErr) throw new Error(`db update: ${updErr.message}`);

      // Si esta es la imagen principal, sincronizar columnas denormalizadas
      // en products.
      if (row.is_primary) {
        const { error: prodErr } = await supabase
          .from("products")
          .update({
            thumb_image_url: updates.thumb_url ?? row.thumb_url,
            medium_image_url: updates.medium_url ?? row.medium_url,
          })
          .eq("id", row.product_id);
        if (prodErr) console.log(`${prefix} ⚠️  products update: ${prodErr.message}`);
      }

      console.log(`${prefix} ✓`);
      ok++;
    } catch (err: any) {
      console.log(`${prefix} ✗ ${err?.message || err}`);
      errors.push(`${row.product_id}/${row.id}: ${err?.message || err}`);
      fail++;
    }

    if (DELAY_MS > 0) await sleep(DELAY_MS);
  }

  console.log(`\n────────────────────────────────────────`);
  console.log(`✅ OK:   ${ok}`);
  console.log(`✗  Fail: ${fail}`);
  if (errors.length) {
    console.log(`\nErrores:`);
    errors.slice(0, 20).forEach((e) => console.log(`  - ${e}`));
    if (errors.length > 20) console.log(`  … y ${errors.length - 20} más`);
  }
}

main().catch((err) => {
  console.error("❌ Falló:", err);
  process.exit(1);
});
