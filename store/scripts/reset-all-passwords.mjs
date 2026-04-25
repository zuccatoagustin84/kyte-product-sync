// Resetea passwords de TODOS los usuarios de Supabase Auth.
// - Default: MPTools2026!
// - Excepción: cualquier user con role=superadmin → SuperMPTools2026!
//
// Uso (desde store/):
//   NEXT_PUBLIC_SUPABASE_URL="https://<proj>.supabase.co" \
//   SUPABASE_SERVICE_KEY="<service_role_key>" \
//   node scripts/reset-all-passwords.mjs
//
// Flags:
//   --dry-run        : lista lo que haría sin ejecutar
//   --skip-google    : no toca cuentas que tienen provider google (login OAuth)
//   --only=email1,e2 : sólo afecta esos emails

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error(
    "ERROR: Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_KEY en el environment."
  );
  process.exit(1);
}

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const skipGoogle = args.has("--skip-google");
const onlyArg = [...args].find((a) => a.startsWith("--only="));
const onlyEmails = onlyArg
  ? onlyArg
      .slice("--only=".length)
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  : null;

const DEFAULT_PASSWORD = "MPTools2026!";
const SUPERADMIN_PASSWORD = "SuperMPTools2026!";

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function listAllUsers() {
  const out = [];
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    if (!data.users.length) break;
    out.push(...data.users);
    if (data.users.length < 200) break;
    page += 1;
  }
  return out;
}

async function fetchSuperadminIds() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "superadmin");
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.id));
}

async function main() {
  console.log(`Conectando a ${url}`);
  console.log(`Modo: ${dryRun ? "DRY-RUN (no escribe)" : "EJECUTAR"}`);
  if (skipGoogle) console.log("Saltando cuentas con provider google");
  if (onlyEmails) console.log(`Sólo: ${onlyEmails.join(", ")}`);

  const [users, superIds] = await Promise.all([
    listAllUsers(),
    fetchSuperadminIds(),
  ]);
  console.log(`\nTotal de usuarios en auth: ${users.length}`);
  console.log(`Superadmins detectados (por profiles.role): ${superIds.size}\n`);

  let touched = 0;
  let skipped = 0;
  for (const u of users) {
    const email = u.email ?? "(sin email)";
    if (onlyEmails && !onlyEmails.includes(email.toLowerCase())) {
      skipped += 1;
      continue;
    }

    const providers = (u.app_metadata?.providers ??
      u.identities?.map((i) => i.provider) ??
      []);
    const isGoogle = providers.includes("google");
    if (skipGoogle && isGoogle) {
      console.log(`SKIP google: ${email}`);
      skipped += 1;
      continue;
    }

    const isSuper = superIds.has(u.id);
    const newPassword = isSuper ? SUPERADMIN_PASSWORD : DEFAULT_PASSWORD;
    const tag = isSuper ? "[SUPER]" : "[user] ";

    if (dryRun) {
      console.log(`DRY  ${tag} ${email} -> ${newPassword}`);
      touched += 1;
      continue;
    }

    const { error } = await supabase.auth.admin.updateUserById(u.id, {
      password: newPassword,
      email_confirm: true,
    });
    if (error) {
      console.log(`FAIL ${tag} ${email} -> ${error.message}`);
    } else {
      console.log(`OK   ${tag} ${email}`);
      touched += 1;
    }
  }

  console.log(`\nResumen: ${touched} reseteados, ${skipped} saltados.`);
  console.log(
    dryRun
      ? "\n(dry-run) Re-ejecutar sin --dry-run para aplicar."
      : `\nDefault: ${DEFAULT_PASSWORD}\nSuperadmin: ${SUPERADMIN_PASSWORD}`
  );
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
