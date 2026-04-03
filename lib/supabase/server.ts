import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createServerSupabaseAdmin } from "@/lib/supabase/admin";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, { path: "/", ...(options as object) })
            );
          } catch {
            // ignore in Server Components
          }
        },
      },
    }
  );
}

/**
 * Use for employee portal data reads when service role is set.
 * Bypasses RLS so dashboard/tasks/leave show data; we filter by current user email in app.
 */
export async function getDataClient() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createServerSupabaseAdmin();
  }
  return createServerSupabaseClient();
}
