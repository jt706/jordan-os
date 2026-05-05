// /integrations — connect/disconnect external services Hermes uses.
// Right now: Google Calendar. More providers go here as we build them.

import { createClient } from '@/lib/supabase/server';
import IntegrationsView from './integrations-view';

export const dynamic = 'force-dynamic';

interface IntegrationRow {
  id: string;
  provider: string;
  status: 'connected' | 'disconnected' | 'expired' | 'error';
  account_email: string | null;
  scopes: string | null;
  last_error: string | null;
  last_sync_at: string | null;
}

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string; reason?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('integrations')
    .select('id, provider, status, account_email, scopes, last_error, last_sync_at')
    .neq('status', 'disconnected');

  // If the table doesn't exist yet (migration not applied), pass empty.
  const rows: IntegrationRow[] = error ? [] : ((data ?? []) as IntegrationRow[]);

  // Detect whether the OAuth env vars are present so we can guide Jordan.
  const hasGoogleCreds = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  return (
    <IntegrationsView
      integrations={rows}
      hasGoogleCreds={hasGoogleCreds}
      flash={{
        google: params.google ?? null,
        reason: params.reason ?? null,
      }}
      migrationApplied={!error}
    />
  );
}
