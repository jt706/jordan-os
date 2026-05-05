// AITMPL — fetch agent templates from the Claude Code Templates registry.
//
// Source: https://www.aitmpl.com/  (github.com/davila7/claude-code-templates)
// The registry exposes a generated `components.json` catalog. Each component
// has a type (agent / command / mcp / hook / setting) and a content field
// containing the markdown body (the system prompt for agents).
//
// We do NOT know the exact JSON shape down to every key, so the parser here
// is permissive: it tries a few likely top-level shapes (`{ agents: [...] }`,
// `{ components: [...] }`, or a flat array) and reads the obvious fields.
// If the real shape differs slightly, only the parser changes — the rest of
// the platform consumes a stable AgentTemplate interface.
//
// In-memory TTL cache so we don't hit the registry on every page render.
//
// Server-only by convention — only imported by /api/agent-templates routes.

const REGISTRY_URL = process.env.AITMPL_REGISTRY_URL ?? 'https://www.aitmpl.com/components.json';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface AgentTemplate {
  /** Stable id we use in our app — derived from category/name. */
  id: string;
  /** Display name. */
  name: string;
  /** Optional category from the registry (e.g. "development-team", "security"). */
  category: string;
  /** Short description if the registry provides one. */
  description: string;
  /** The actual system prompt (markdown body of the source file). */
  content: string;
  /** Source URL on aitmpl.com (for attribution). */
  sourceUrl: string;
}

// ─── Cache ──────────────────────────────────────────────────────────────────
let cache: { templates: AgentTemplate[]; fetchedAt: number } | null = null;

async function loadRegistry(): Promise<AgentTemplate[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.templates;
  }

  const res = await fetch(REGISTRY_URL, {
    // Ask Next.js to revalidate hourly; tolerate stale on error.
    next: { revalidate: 3600 },
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`AITMPL registry fetch failed: HTTP ${res.status}`);
  }

  const json: unknown = await res.json();
  const templates = parseRegistry(json);
  cache = { templates, fetchedAt: Date.now() };
  return templates;
}

// ─── Permissive parser ──────────────────────────────────────────────────────
// Tries several plausible shapes. If aitmpl ships a different layout, we
// adjust this function and nothing else needs to change.
function parseRegistry(raw: unknown): AgentTemplate[] {
  const items = extractItemArray(raw);
  return items
    .map((item) => normaliseItem(item))
    .filter((t): t is AgentTemplate => t !== null);
}

function extractItemArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    // Try a handful of likely keys, in priority order.
    for (const key of ['agents', 'components', 'items', 'data']) {
      const v = obj[key];
      if (Array.isArray(v)) return v;
    }
    // Nested shape: { byType: { agent: [...] } }
    const byType = obj.byType ?? obj.byCategory;
    if (byType && typeof byType === 'object') {
      const agents = (byType as Record<string, unknown>).agent ?? (byType as Record<string, unknown>).agents;
      if (Array.isArray(agents)) return agents;
    }
    // Last resort: filter the values that look like component arrays.
    const vals = Object.values(obj).flatMap((v) => (Array.isArray(v) ? v : []));
    if (vals.length > 0) return vals;
  }
  return [];
}

function normaliseItem(item: unknown): AgentTemplate | null {
  if (!item || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;

  // Only keep agents. Accept several keys the registry might use.
  const type =
    typeof obj.type === 'string'        ? obj.type        :
    typeof obj.componentType === 'string' ? obj.componentType :
    typeof obj.kind === 'string'        ? obj.kind        :
    '';
  if (type && type !== 'agent' && type !== 'agents') return null;

  // Some catalogs put everything in agent-only buckets — if there's no type
  // field at all but there is content + name, treat as a candidate.
  const content = pickString(obj, ['content', 'body', 'prompt', 'systemPrompt', 'markdown']);
  if (!content) return null;

  const name = pickString(obj, ['name', 'title', 'displayName', 'slug']) ?? 'Untitled';
  const category = pickString(obj, ['category', 'subcategory', 'group']) ?? 'general';
  const description = pickString(obj, ['description', 'summary', 'tagline']) ?? '';
  const slugSource = pickString(obj, ['slug', 'id', 'name', 'title']) ?? name;
  const id = slugify(`${category}-${slugSource}`);

  // Construct attribution URL. Prefer registry-provided url/path; else build one.
  const path = pickString(obj, ['url', 'path', 'sourceUrl']);
  const sourceUrl = path
    ? (path.startsWith('http') ? path : `https://www.aitmpl.com${path.startsWith('/') ? '' : '/'}${path}`)
    : `https://www.aitmpl.com/agents`;

  return { id, name, category, description, content, sourceUrl };
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return undefined;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface AgentTemplateSummary {
  id: string;
  name: string;
  category: string;
  description: string;
  sourceUrl: string;
}

export async function listAgentTemplates(): Promise<AgentTemplateSummary[]> {
  const templates = await loadRegistry();
  return templates.map(({ content: _content, ...summary }) => {
    void _content; // strip body from the list response
    return summary;
  });
}

export async function getAgentTemplate(id: string): Promise<AgentTemplate | null> {
  const templates = await loadRegistry();
  return templates.find((t) => t.id === id) ?? null;
}
