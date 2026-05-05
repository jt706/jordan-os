// Browser-side Supabase client.
// Use in 'use client' components. Reads from window — safe with the
// publishable key (sb_publishable_*), which is designed for client exposure.
//
// For server components, route handlers, and server actions, use
// `lib/supabase/server.ts` instead — it threads cookies for auth.

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
