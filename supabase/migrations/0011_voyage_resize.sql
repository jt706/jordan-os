-- ─── Resize embedding column: 1536 → 1024 (Voyage AI voyage-3) ───────────────
-- Run this if you already ran 0010 with OpenAI dims (1536).
-- Safe: no embeddings exist yet so there is no data to lose.

DROP INDEX IF EXISTS knowledge_embedding_idx;
ALTER TABLE knowledge DROP COLUMN IF EXISTS embedding;
ALTER TABLE knowledge ADD COLUMN embedding vector(1024);

CREATE INDEX knowledge_embedding_idx
  ON knowledge USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

DROP FUNCTION IF EXISTS search_knowledge_semantic(vector, int, float);
CREATE OR REPLACE FUNCTION search_knowledge_semantic(
  query_embedding  vector(1024),
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
