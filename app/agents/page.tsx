// Server page: pulls agents from Supabase, hands them to the client view.

import { listAgents } from '@/lib/data/queries';
import AgentsView from './agents-view';

export default async function AgentsPage() {
  const agents = await listAgents();
  return <AgentsView initialAgents={agents} />;
}
