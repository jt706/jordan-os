// PATCH  /api/knowledge/[id]   — update a doc
// DELETE /api/knowledge/[id]   — delete a doc

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.title          === 'string') patch.title          = body.title.trim();
  if (typeof body.category       === 'string') patch.category       = body.category.trim();
  if (typeof body.content        === 'string') patch.content        = body.content.trim();
  if (typeof body.division       === 'string') patch.division       = body.division.trim() || null;
  if (body.division              === null)     patch.division       = null;
  if (typeof body.visibility     === 'string') patch.visibility     = body.visibility;
  if (Array.isArray(body.tags))                patch.tags           = body.tags;
  if (typeof body.authority_level === 'string') patch.authority_level = body.authority_level;
  if (Array.isArray(body.applies_to))           patch.applies_to    = body.applies_to;
  if (typeof body.status         === 'string') patch.status         = body.status;
  if (typeof body.version        === 'string') patch.version        = body.version.trim();
  if (typeof body.reviewed_by    === 'string') patch.reviewed_by    = body.reviewed_by.trim() || null;
  if (body.reviewed_by           === null)     patch.reviewed_by    = null;
  if (typeof body.supersedes_id  === 'string') patch.supersedes_id  = body.supersedes_id.trim() || null;
  if (body.supersedes_id         === null)     patch.supersedes_id  = null;

  // Mark reviewed_at when reviewed_by is set
  if (patch.reviewed_by) patch.reviewed_at = new Date().toISOString();

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('knowledge')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ doc: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { error } = await supabase.from('knowledge').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
