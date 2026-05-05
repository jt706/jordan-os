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

  const { title, category, content, tags, division, visibility } = body as {
    title?: string;
    category?: string;
    content?: string;
    tags?: string[];
    division?: string | null;
    visibility?: string;
  };

  if (!title?.trim())    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  if (!category?.trim()) return NextResponse.json({ error: 'category is required' }, { status: 400 });
  if (!content?.trim())  return NextResponse.json({ error: 'content is required' }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('knowledge')
    .insert({
      title:      title.trim(),
      category:   category.trim(),
      content:    content.trim(),
      tags:       Array.isArray(tags) ? tags : [],
      division:   division ?? null,
      visibility: visibility ?? 'bellion',
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ doc: data }, { status: 201 });
}
