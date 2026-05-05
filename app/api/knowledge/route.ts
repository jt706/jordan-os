// GET  /api/knowledge         — list all docs
// POST /api/knowledge         — create a new doc

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('knowledge')
    .insert({
      title:           String(title).trim(),
      category:        String(category).trim(),
      content:         String(content).trim(),
      tags:            Array.isArray(tags) ? tags : [],
      division:        typeof division === 'string' && division.trim() ? division.trim() : null,
      visibility:      typeof visibility === 'string' ? visibility : 'bellion',
      authority_level: typeof authority_level === 'string' ? authority_level : 'reference',
      applies_to:      Array.isArray(applies_to) ? applies_to : ['global'],
      status:          typeof status === 'string' ? status : 'active',
      version:         typeof version === 'string' && version.trim() ? version.trim() : '1.0',
      reviewed_by:     typeof reviewed_by === 'string' && reviewed_by.trim() ? reviewed_by.trim() : null,
      supersedes_id:   typeof supersedes_id === 'string' && supersedes_id.trim() ? supersedes_id.trim() : null,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ doc: data }, { status: 201 });
}
