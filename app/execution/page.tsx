// Execution Hub — live view of Hermes' action queue.
// Server component: fetches actions from Supabase. Hands the list to a client
// view that handles Approve/Cancel buttons and refreshes after each call.

import { listActions } from '@/lib/hermes';
import ExecutionView from './execution-view';

export const dynamic = 'force-dynamic';

export default async function ExecutionPage() {
  const actions = await listActions({ limit: 100 });
  return <ExecutionView actions={actions} />;
}
