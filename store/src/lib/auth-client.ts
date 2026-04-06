import { supabase } from "./supabase";

export interface Profile {
  id: string;
  full_name: string | null;
  company: string | null;
  phone: string | null;
  role: string;
}

export async function signIn(email: string, password: string, captchaToken?: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: captchaToken ? { captchaToken } : undefined,
  });
  return { data, error };
}

export async function signUp(
  email: string,
  password: string,
  fullName: string,
  company?: string,
  phone?: string,
  captchaToken?: string
) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      ...(captchaToken ? { captchaToken } : {}),
      data: {
        full_name: fullName,
        company: company ?? null,
        phone: phone ?? null,
      },
    },
  });
  return { data, error };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error };
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, company, phone, role")
    .eq("id", userId)
    .single();

  if (error) return null;
  return data as Profile;
}

export async function updateProfile(userId: string, updates: Partial<Profile>) {
  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", userId)
    .select()
    .single();
  return { data, error };
}

export async function resetPasswordForEmail(email: string) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: "https://store-lyart-delta.vercel.app/reset",
  });
}

export async function updatePassword(newPassword: string) {
  return supabase.auth.updateUser({ password: newPassword });
}

export async function resendConfirmation(email: string) {
  return supabase.auth.resend({ type: "signup", email });
}
