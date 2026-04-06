import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  // Optional: check SETUP_SECRET header if the env var is defined
  const setupSecret = process.env.SETUP_SECRET;
  if (setupSecret) {
    const providedSecret = request.headers.get("X-Setup-Secret");
    if (providedSecret !== setupSecret) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const service = createServiceClient();

  // Check if any admin already exists — security gate
  const { count, error: countError } = await service
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");

  if (countError) {
    return Response.json({ error: countError.message }, { status: 500 });
  }

  if (count !== null && count > 0) {
    return Response.json(
      { error: "Setup ya completado" },
      { status: 403 }
    );
  }

  // Parse body
  let body: { email?: string; password?: string; fullName?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const { email, password, fullName } = body;

  if (!email || !password || !fullName) {
    return Response.json(
      { error: "Los campos email, password y fullName son requeridos" },
      { status: 400 }
    );
  }

  if (password.length < 6) {
    return Response.json(
      { error: "La contraseña debe tener al menos 6 caracteres" },
      { status: 400 }
    );
  }

  // Create the user in Supabase Auth via admin API (service role)
  const { data: authData, error: authError } =
    await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // skip email confirmation for the first admin
      user_metadata: {
        full_name: fullName,
      },
    });

  if (authError) {
    return Response.json({ error: authError.message }, { status: 500 });
  }

  const userId = authData.user.id;

  // Upsert the profile row with role = 'admin'
  // (a trigger may have already inserted it; use upsert to be safe)
  const { error: profileError } = await service
    .from("profiles")
    .upsert({
      id: userId,
      full_name: fullName,
      role: "admin",
    });

  if (profileError) {
    // Attempt to clean up the auth user so the state is not half-created
    await service.auth.admin.deleteUser(userId);
    return Response.json({ error: profileError.message }, { status: 500 });
  }

  return Response.json(
    { success: true, message: "Admin creado" },
    { status: 201 }
  );
}
