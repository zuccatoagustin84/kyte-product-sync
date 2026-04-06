import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser client using cookies so server-side middleware can read the session
export const supabase = createBrowserClient(url, anonKey);

// Server-side client with service role (only use in API routes)
export function createServiceClient() {
  return createClient(url, process.env.SUPABASE_SERVICE_KEY!);
}
