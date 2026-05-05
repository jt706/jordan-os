// Embedding helper for JT OS knowledge base.
//
// Uses Voyage AI voyage-3 (1024 dims).
// Anthropic's recommended embedding provider for Claude projects.
// Free tier: 50M tokens/month — more than enough for JT OS.
//
// Requires VOYAGE_API_KEY in environment.
// If the key is missing the function returns null — callers fall back to
// keyword search (ilike). The system works without it.

import { VoyageAIClient } from 'voyageai';

const EMBEDDING_MODEL = 'voyage-3';
export const EMBEDDING_DIMS = 1024;

let _client: VoyageAIClient | null = null;

function getClient(): VoyageAIClient | null {
  if (!process.env.VOYAGE_API_KEY) return null;
  if (!_client) _client = new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY });
  return _client;
}

/**
 * Generate a single embedding vector for a string.
 * Returns null if VOYAGE_API_KEY is not configured or the call fails.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  const client = getClient();
  if (!client) return null;

  try {
    const response = await client.embed({
      input: text.trim().slice(0, 16000), // voyage-3 context window
      model: EMBEDDING_MODEL,
    });
    const embedding = response.data?.[0]?.embedding;
    if (!embedding || !Array.isArray(embedding)) return null;
    return embedding as number[];
  } catch (err) {
    console.error('[embeddings] generateEmbedding failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Build the text to embed for a knowledge doc.
 * Combines all searchable fields so semantic search matches on any dimension.
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
 * Returns true if Voyage AI is configured and embeddings are available.
 */
export function embeddingsAvailable(): boolean {
  return Boolean(process.env.VOYAGE_API_KEY);
}
