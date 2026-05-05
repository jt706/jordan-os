export const dynamic = 'force-dynamic';

import { listKnowledge } from '@/lib/data/queries';
import KnowledgeView from './knowledge-view';

export default async function KnowledgePage() {
  let docs = await listKnowledge().catch(() => []);
  return <KnowledgeView initialDocs={docs} />;
}
