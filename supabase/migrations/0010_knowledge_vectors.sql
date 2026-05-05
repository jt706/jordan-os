-- ─── Vector memory for knowledge base ────────────────────────────────────────
-- Enables pgvector on Supabase, adds an embedding column to the knowledge table,
-- and creates a semantic search RPC function Bellion calls via search_knowledge.
--
-- Embedding model: OpenAI text-embedding-3-small (1536 dims)
-- Run in Supabase SQL editor BEFORE deploying the updated app.

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add embedding column
ALTER TABLE knowledge
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- 3. HNSW index for fast approximate nearest-neighbour search.
--    HNSW works well from 0 rows up — no minimum doc count needed.
CREATE INDEX IF NOT EXISTS knowledge_embedding_idx
  ON knowledge USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 4. Semantic search function — called via supabase.rpc()
--    Returns rows ordered by cosine similarity, filtered by similarity_threshold.
--    Falls back gracefully: if a doc has no embedding it is excluded (not ranked 0).
DROP FUNCTION IF EXISTS search_knowledge_semantic(vector, int, float);
CREATE OR REPLACE FUNCTION search_knowledge_semantic(
  query_embedding  vector(1536),
  match_count      int   DEFAULT 10,
  min_similarity   float DEFAULT 0.35
)
RETURNS TABLE (
  id              uuid,
  title           text,
  category        text,
  content         text,
  tags            text[],
  authority_level text,
  applies_to      text[],
  status          text,
  version         text,
  visibility      text,
  similarity      float
)
LANGUAGE sql STABLE AS $$
  SELECT
    id, title, category, content, tags,
    authority_level, applies_to, status, version, visibility,
    1 - (embedding <=> query_embedding) AS similarity
  FROM knowledge
  WHERE status IN ('active', 'draft')
    AND embedding IS NOT NULL
    AND 1 - (embedding <=> query_embedding) > min_similarity
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
