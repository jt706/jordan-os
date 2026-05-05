// GET  /api/knowledge         — list all docs
// POST /api/knowledge         — create a new doc (generates embedding async)

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateEmbedding, docToEmbedText } from '@/lib/data/embeddings';

export const runtime = 'nodejs';

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('knowledge')
    .select('*')
    .order('authority_level', { ascending: true })
    .order('category', { ascending: true })
    .order('title', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ docs: data ?? [] });
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { title, category, content, tags, division, visibility,
          authority_level, applies_to, status, version, reviewed_by, supersedes_id } = body as Record<string, unknown>;

  if (!String(title ?? '').trim())    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  if (!String(category ?? '').trim()) return NextResponse.json({ error: 'category is required' }, { status: 400 });
  if (!String(content ?? '').trim())  return NextResponse.json({ error: 'content is required' }, { status: 400 });

  const tagsArr       = Array.isArray(tags)       ? (tags as string[])       : [];
  const appliesToArr  = Array.isArray(applies_to) ? (applies_to as string[]) : ['global'];
  const authorityStr  = typeof authority_level === 'string' ? authority_level : 'reference';

  // Generate embedding before insert so it goes in as one row.
  const embedText = docToEmbedText({
    title:           String(title).trim(),
    category:        String(category).trim(),
    content:         String(content).trim(),
    tags:            tagsArr,
    authority_level: authorityStr,
    applies_to:      appliesToArr,
  });
  const embedding = await generateEmbedding(embedText);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('knowledge')
    .insert({
      title:           String(title).trim(),
      category:        String(category).trim(),
      content:         String(content).trim(),
      tags:            tagsArr,
      division:        typeof division === 'string' && (division as string).trim() ? (division as string).trim() : null,
      visibility:      typeof visibility === 'string' ? visibility : 'bellion',
      authority_level: authorityStr,
      applies_to:      appliesToArr,
      status:          typeof status === 'string' ? status : 'active',
      version:         typeof version === 'string' && (version as string).trim() ? (version as string).trim() : '1.0',
      reviewed_by:     typeof reviewed_by === 'string' && (reviewed_by as string).trim() ? (reviewed_by as string).trim() : null,
      supersedes_id:   typeof supersedes_id === 'string' && (supersedes_id as string).trim() ? (supersedes_id as string).trim() : null,
      ...(embedding ? { embedding: JSON.stringify(embedding) } : {}),
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ doc: data, embedded: Boolean(embedding) }, { status: 201 });
}
