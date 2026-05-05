// WhatsApp webhook — receives messages from Meta and routes them through the CEO Agent.
//
// GET  /api/webhooks/whatsapp  — Meta webhook verification handshake
// POST /api/webhooks/whatsapp  — incoming WhatsApp message → CEO Agent → reply
//
// Required env vars:
//   WHATSAPP_VERIFY_TOKEN     — token you enter in Meta developer console
//   WHATSAPP_ACCESS_TOKEN     — permanent token from Meta app settings
//   WHATSAPP_PHONE_NUMBER_ID  — phone number ID from Meta WhatsApp setup

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Meta webhook verification handshake.
// Meta sends GET with hub.mode, hub.verify_token, hub.challenge.
// We return the challenge string to confirm ownership.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? '', { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

// Incoming WhatsApp message from Meta.
// Always return 200 — Meta will retry on any other status.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response('OK', { status: 200 });
  }

  const entry = (body as any)?.entry?.[0];
  const value = entry?.changes?.[0]?.value;

  // Meta also sends delivery status updates — skip those.
  const messages: any[] | undefined = value?.messages;
  if (!messages?.length) {
    return new Response('OK', { status: 200 });
  }

  const msg = messages[0];

  // Only handle text for now; ignore reactions, images, voice notes, etc.
  if (msg.type !== 'text' || !msg.text?.body) {
    return new Response('OK', { status: 200 });
  }

  const from: string = msg.from; // sender's phone number
  const text: string = msg.text.body;

  // Find or create the pinned WhatsApp thread.
  const supabase = await createClient();
  let threadId: string;

  const { data: existing } = await supabase
    .from('threads')
    .select('id')
    .eq('title', 'WhatsApp')
    .maybeSingle();

  if (existing) {
    threadId = existing.id;
  } else {
    const { data: created, error } = await supabase
      .from('threads')
      .insert({ title: 'WhatsApp', pinned: true })
      .select('id')
      .single();
    if (error || !created) {
      console.error('[whatsapp] failed to create thread:', error);
      return new Response('OK', { status: 200 });
    }
    threadId = created.id;
  }

  // Route the message through the CEO Agent.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  let replyText: string;
  try {
    const chatRes = await fetch(`${appUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId, message: text }),
    });
    if (!chatRes.ok) {
      console.error('[whatsapp] /api/chat returned', chatRes.status);
      return new Response('OK', { status: 200 });
    }
    const chatData = await chatRes.json();
    replyText = chatData.content ?? '';
  } catch (err) {
    console.error('[whatsapp] failed to call /api/chat:', err);
    return new Response('OK', { status: 200 });
  }

  if (!replyText) return new Response('OK', { status: 200 });

  // WhatsApp text messages are capped at 4096 chars.
  // Split into chunks and send sequentially if needed.
  const chunks = splitMessage(replyText, 4096);
  for (const chunk of chunks) {
    await sendWhatsAppText(from, chunk);
  }

  return new Response('OK', { status: 200 });
}

async function sendWhatsAppText(to: string, text: string): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !accessToken) {
    console.error('[whatsapp] WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN not set');
    return;
  }

  const res = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    console.error('[whatsapp] Meta API error:', res.status, err);
  }
}

function splitMessage(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    // Try to break at a paragraph or sentence boundary.
    let cut = remaining.lastIndexOf('\n\n', limit);
    if (cut < limit * 0.5) cut = remaining.lastIndexOf('\n', limit);
    if (cut < limit * 0.5) cut = remaining.lastIndexOf('. ', limit);
    if (cut < 0) cut = limit;
    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
