import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(url, anonKey);

// Server-side client with service role (only use in API routes)
export function createServiceClient() {
  return createClient(url, process.env.SUPABASE_SERVICE_KEY!);
}
