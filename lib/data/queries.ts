// Server-side typed query helpers for JT OS.
//
// Each function reads a real table and shapes rows to match the TS types
// in `lib/types.ts`. No mock data anywhere — pages get real numbers or an
// empty list. All server-only (uses the @supabase/ssr server client).
// Client components should query Supabase directly via `lib/supabase/client.ts`.

import { createClient } from '@/lib/supabase/server';
import type {
  Achievement,
  Agent,
  Decision,
  Idea,
  KnowledgeDoc,
  KnowledgeAuthority,
  KnowledgeScope,
  KnowledgeStatus,
  Message,
  Subscription,
  Thread,
} from '@/lib/types';

// ─── Threads ─────────────────────────────────────────────────────────────────

export async function listThreads(): Promise<Thread[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('threads')
    .select('*')
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToThread);
}

export async function getThread(id: string): Promise<Thread | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('threads')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToThread(data) : null;
}

// ─── Messages ────────────────────────────────────────────────────────────────

export async function listMessages(threadId: string): Promise<Message[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToMessage);
}

// ─── Decisions ───────────────────────────────────────────────────────────────

export async function listDecisions(): Promise<Decision[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('decisions')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToDecision);
}

// ─── Agents ──────────────────────────────────────────────────────────────────

export async function listAgents(): Promise<Agent[]> {
  const supabase = await createClient();
  // Hide killed agents from the registry view. Their rows still exist for the
  // audit trail (training_events, fire_reason, fired_at) but the roster only
  // shows live workforce — active, idle, benched. Use listAllAgents() if you
  // need the full set including killed.
  const { data, error } = await supabase
    .from('agents')
    .select('*')
    .neq('status', 'killed')
    .order('roi', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToAgent);
}

// ─── Subscriptions ───────────────────────────────────────────────────────────

export async function listSubscriptions(): Promise<Subscription[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .order('renewal_date', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToSubscription);
}

// ─── Achievements ────────────────────────────────────────────────────────────

export async function listAchievements(): Promise<Achievement[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('achievements')
    .select('*')
    .order('achieved_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToAchievement);
}

// ─── Ideas ───────────────────────────────────────────────────────────────────

export async function listIdeas(): Promise<Idea[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('ideas')
    .select('*')
    .order('opportunity_score', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(rowToIdea);
}

// ─── Knowledge Base ──────────────────────────────────────────────────────────

export async function listKnowledge(): Promise<KnowledgeDoc[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('knowledge')
    .select('*')
    .order('category', { ascending: true })
    .order('title', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(rowToKnowledge);
}

export async function searchKnowledge(query: string): Promise<KnowledgeDoc[]> {
  const supabase = await createClient();
  const q = query.trim().toLowerCase();
  const { data, error } = await supabase
    .from('knowledge')
    .select('*')
    .or(`title.ilike.%${q}%,content.ilike.%${q}%,category.ilike.%${q}%`)
    .order('updated_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return (data ?? []).map(rowToKnowledge);
}

// ─── Row → TS type mappers ───────────────────────────────────────────────────
// Snake-case from Postgres → camelCase TS shapes that match lib/types.ts.

interface ThreadRow {
  id: string;
  title: string;
  last_message: string | null;
  message_count: number;
  tags: string[] | null;
  pinned: boolean;
  updated_at: string;
}

function rowToThread(r: ThreadRow): Thread {
  return {
    id: r.id,
    title: r.title,
    lastMessage: r.last_message ?? '',
    timestamp: new Date(r.updated_at),
    messageCount: r.message_count,
    tags: r.tags ?? [],
    pinned: r.pinned,
  };
}

interface MessageRow {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments: string[] | null;
  created_at: string;
}

function rowToMessage(r: MessageRow): Message {
  return {
    id: r.id,
    threadId: r.thread_id,
    role: r.role,
    content: r.content,
    timestamp: new Date(r.created_at),
    attachments: r.attachments ?? undefined,
  };
}

interface DecisionRow {
  id: string;
  title: string;
  summary: string;
  risk: Decision['risk'];
  estimated_cost: number | string;
  confidence: number;
  recommendation: string;
  status: Decision['status'];
  proposed_by: string;
  tags: string[] | null;
  created_at: string;
}

function rowToDecision(r: DecisionRow): Decision {
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    risk: r.risk,
    estimatedCost: Number(r.estimated_cost),
    confidence: r.confidence,
    recommendation: r.recommendation,
    status: r.status,
    createdAt: new Date(r.created_at),
    proposedBy: r.proposed_by,
    tags: r.tags ?? [],
  };
}

interface AgentRow {
  id: string;
  name: string;
  role: string;
  division: Agent['division'];
  status: Agent['status'];
  monthly_cost: number | string;
  value_created: number | string;
  roi: number | string;
  recommendation: string;
  capabilities: string[] | null;
  avatar: string;
  last_active: string;
  permission_level: number | null;
  risk_status: string | null;
}

function rowToAgent(r: AgentRow): Agent {
  return {
    id: r.id,
    name: r.name,
    role: r.role,
    division: r.division,
    status: r.status,
    monthlyCost: Number(r.monthly_cost),
    valueCreated: Number(r.value_created),
    roi: Number(r.roi),
    recommendation: r.recommendation,
    capabilities: r.capabilities ?? [],
    lastActive: new Date(r.last_active),
    avatar: r.avatar,
    permissionLevel: (r.permission_level ?? 2) as Agent['permissionLevel'],
    riskStatus: (r.risk_status ?? 'green') as Agent['riskStatus'],
  };
}

interface SubscriptionRow {
  id: string;
  name: string;
  provider: string;
  monthly_cost: number | string;
  renewal_date: string;
  usage: Subscription['usage'];
  value_score: number | string;
  recommendation: string;
  category: string;
  logo_emoji: string;
}

function rowToSubscription(r: SubscriptionRow): Subscription {
  return {
    id: r.id,
    name: r.name,
    provider: r.provider,
    monthlyCost: Number(r.monthly_cost),
    renewalDate: new Date(r.renewal_date),
    usage: r.usage,
    valueScore: Number(r.value_score),
    recommendation: r.recommendation,
    category: r.category,
    logoEmoji: r.logo_emoji,
  };
}

interface AchievementRow {
  id: string;
  title: string;
  description: string;
  value_created: number | string;
  responsible_agent: string;
  category: Achievement['category'];
  achieved_at: string;
  verified: boolean;
}

function rowToAchievement(r: AchievementRow): Achievement {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    valueCreated: Number(r.value_created),
    responsibleAgent: r.responsible_agent,
    category: r.category,
    date: new Date(r.achieved_at),
    verified: r.verified,
  };
}

interface IdeaRow {
  id: string;
  title: string;
  summary: string;
  opportunity_score: number;
  recommended_path: string;
  capital_required: number | string;
  next_action: string;
  stage: Idea['stage'];
  tags: string[] | null;
  created_at: string;
}

function rowToIdea(r: IdeaRow): Idea {
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    opportunityScore: r.opportunity_score,
    recommendedPath: r.recommended_path,
    capitalRequired: Number(r.capital_required),
    nextAction: r.next_action,
    stage: r.stage,
    createdAt: new Date(r.created_at),
    tags: r.tags ?? [],
  };
}

interface KnowledgeRow {
  id: string;
  title: string;
  category: KnowledgeDoc['category'];
  content: string;
  tags: string[] | null;
  division: string | null;
  visibility: KnowledgeDoc['visibility'];
  authority_level: KnowledgeAuthority | null;
  applies_to: KnowledgeScope[] | null;
  status: KnowledgeStatus | null;
  version: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  supersedes_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToKnowledge(r: KnowledgeRow): KnowledgeDoc {
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    content: r.content,
    tags: r.tags ?? [],
    division: r.division,
    visibility: r.visibility,
    authorityLevel: r.authority_level ?? 'reference',
    appliesTo: r.applies_to ?? ['global'],
    status: r.status ?? 'active',
    version: r.version ?? '1.0',
    reviewedAt: r.reviewed_at ? new Date(r.reviewed_at) : null,
    reviewedBy: r.reviewed_by ?? null,
    supersedesId: r.supersedes_id ?? null,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}
