// Server-side Supabase client for the Next 16 app router.
// Use in server components, route handlers, and server actions.
//
// Reads the publishable key (browser-safe) but threads the cookie store so
// auth state stays in sync between server and client. When you wire Supabase
// Auth, sign-in/out cookies will flow through these helpers automatically.

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — set() will throw. That's fine
            // when middleware refreshes the session cookie on each request.
          }
        },
      },
    }
  );
}

// Admin client for server-only writes that must bypass RLS (e.g. Hermes
// writing execution_tasks from a background worker). Only call from trusted
// server contexts. Returns null if SUPABASE_SECRET_KEY isn't configured —
// that lets the rest of the app boot without it during early development.
import { createClient as createAdminBase } from '@supabase/supabase-js';

export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) return null;
  return createAdminBase(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
