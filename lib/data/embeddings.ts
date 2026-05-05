// Embedding helper for JT OS knowledge base.
//
// Uses OpenAI text-embedding-3-small (1536 dims, cheap, fast).
// Requires OPENAI_API_KEY in environment.
// If the key is missing the function returns null — callers must handle the null
// and fall back to keyword search (ilike). This keeps the system functional
// even without an OpenAI key configured.

import OpenAI from 'openai';

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMS  = 1536;

export { EMBEDDING_DIMS };

let _client: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!_client) _client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _client;
}

/**
 * Generate a single embedding vector for a string.
 * Returns null if OPENAI_API_KEY is not configured or the call fails.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const client = getClient();
  if (!client) return null;

  try {
    const response = await client.embeddings.create({
      model: EMBEDDING_DIMS === 1536 ? EMBEDDING_MODEL : EMBEDDING_MODEL,
      input: text.trim().slice(0, 8000), // model max is 8191 tokens
    });
    return response.data[0].embedding;
  } catch (err) {
    console.error('[embeddings] generateEmbedding failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Build the text to embed for a knowledge doc.
 * Combines title + category + content + tags so semantic search
 * matches on any of these dimensions.
 */
export function docToEmbedText(doc: {
  title: string;
  category: string;
  content: string;
  tags: string[];
  authority_level?: string;
  applies_to?: string[];
}): string {
  const parts = [
    doc.title,
    doc.category,
    doc.authority_level ?? '',
    (doc.applies_to ?? []).join(' '),
    doc.tags.join(' '),
    doc.content,
  ];
  return parts.filter(Boolean).join('\n').trim();
}

/**
 * Returns true if the OpenAI key is configured and embeddings are available.
 */
export function embeddingsAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}
