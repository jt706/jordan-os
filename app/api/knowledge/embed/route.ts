// POST /api/knowledge/embed
//
// One-shot backfill: generates embeddings for every knowledge doc that doesn't
// have one yet. Run this once after deploying migration 0010 and setting
// OPENAI_API_KEY. Safe to run multiple times — skips docs that already have
// an embedding.
//
// Returns: { total, embedded, skipped, failed, errors }

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateEmbedding, docToEmbedText, embeddingsAvailable } from '@/lib/data/embeddings';

export const runtime = 'nodejs';

// Vercel function timeout is 60s on hobby/pro. Backfill up to 100 docs per call
// (each embedding call takes ~200ms → well within limit).
const BATCH_SIZE = 100;

export async function POST() {
  if (!embeddingsAvailable()) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY is not set. Add it to your environment variables.' },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  // Fetch docs without embeddings
  const { data: docs, error } = await supabase
    .from('knowledge')
    .select('id, title, category, content, tags, authority_level, applies_to')
    .is('embedding', null)
    .limit(BATCH_SIZE);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!docs || docs.length === 0) {
    return NextResponse.json({ message: 'All docs already have embeddings.', total: 0, embedded: 0 });
  }

  const results = { total: docs.length, embedded: 0, skipped: 0, failed: 0, errors: [] as string[] };

  for (const doc of docs) {
    const embedText = docToEmbedText({
      title:           doc.title ?? '',
      category:        doc.category ?? '',
      content:         doc.content ?? '',
      tags:            (doc.tags as string[]) ?? [],
      authority_level: doc.authority_level ?? 'reference',
      applies_to:      (doc.applies_to as string[]) ?? ['global'],
    });

    const embedding = await generateEmbedding(embedText);
    if (!embedding) {
      results.failed++;
      results.errors.push(`${doc.id}: embedding generation failed`);
      continue;
    }

    const { error: updateErr } = await supabase
      .from('knowledge')
      .update({ embedding: JSON.stringify(embedding) })
      .eq('id', doc.id);

    if (updateErr) {
      results.failed++;
      results.errors.push(`${doc.id}: ${updateErr.message}`);
    } else {
      results.embedded++;
    }
  }

  const remaining = docs.length === BATCH_SIZE ? 'Run again to embed more.' : 'All done.';
  return NextResponse.json({ ...results, note: remaining });
}
