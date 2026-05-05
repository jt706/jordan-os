// Server page: pulls threads from Supabase, hands them to the client view.

import { listThreads } from '@/lib/data/queries';
import ThreadsView from './threads-view';

export default async function ThreadsPage() {
  const threads = await listThreads();
  return <ThreadsView threads={threads} />;
}
