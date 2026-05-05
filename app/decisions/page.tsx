// Server page: pulls decisions from Supabase, hands them to the client view.

import { listDecisions } from '@/lib/data/queries';
import DecisionsView from './decisions-view';

export default async function DecisionsPage() {
  const decisions = await listDecisions();
  return <DecisionsView initialDecisions={decisions} />;
}
