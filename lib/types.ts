// ─── Core Enums ─────────────────────────────────────────────────────────────

export type AgentStatus = 'active' | 'idle' | 'benched' | 'killed' | 'quarantined';

export type RiskStatus = 'green' | 'yellow' | 'orange' | 'red' | 'black';
export type PermissionLevel = 0 | 1 | 2 | 3 | 4 | 5;
export type AgentDivision =
  | 'Agent HR'
  | 'Tuatahi'
  | 'Noa'
  | 'Sidekick AI'
  | 'Personal'
  | 'Shared Services'
  | 'Marketing & Sales'
  | 'Venture Studio';

export type DecisionStatus = 'pending' | 'approved' | 'revised' | 'parked' | 'killed';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type UsageLevel = 'low' | 'medium' | 'high';

export type IdeaStage =
  | 'raw'
  | 'validated'
  | 'in-progress'
  | 'paused'
  | 'shipped'
  | 'killed';

export type AchievementCategory =
  | 'Revenue'
  | 'Efficiency'
  | 'Innovation'
  | 'Cost Saving'
  | 'Strategic'
  | 'Community';

export type ExecutionToolStatus = 'online' | 'offline' | 'degraded' | 'pending';
export type MessageRole = 'user' | 'assistant';

// ─── Chat ────────────────────────────────────────────────────────────────────

export interface Message {
  id: string;
  threadId: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  attachments?: string[];
}

export interface Thread {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
  messageCount: number;
  tags: string[];
  pinned?: boolean;
}

// ─── Decisions ───────────────────────────────────────────────────────────────

export interface Decision {
  id: string;
  title: string;
  summary: string;
  risk: RiskLevel;
  estimatedCost: number;
  confidence: number; // 0-100
  recommendation: string;
  status: DecisionStatus;
  createdAt: Date;
  proposedBy: string;
  tags: string[];
}

// ─── Agents ──────────────────────────────────────────────────────────────────

export interface Agent {
  id: string;
  name: string;
  role: string;
  division: AgentDivision;
  status: AgentStatus;
  monthlyCost: number;
  valueCreated: number;
  roi: number; // percentage
  recommendation: string;
  capabilities: string[];
  lastActive: Date;
  avatar: string; // emoji
  permissionLevel: PermissionLevel; // 0–5
  riskStatus: RiskStatus;           // green → black
}

// ─── Subscriptions ───────────────────────────────────────────────────────────

export interface Subscription {
  id: string;
  name: string;
  provider: string;
  monthlyCost: number;
  renewalDate: Date;
  usage: UsageLevel;
  valueScore: number; // 0-10
  recommendation: string;
  category: string;
  logoEmoji: string;
}

// ─── Achievements ────────────────────────────────────────────────────────────

export interface Achievement {
  id: string;
  title: string;
  description: string;
  valueCreated: number;
  responsibleAgent: string;
  category: AchievementCategory;
  date: Date;
  verified: boolean;
}

// ─── Ideas ───────────────────────────────────────────────────────────────────

export interface Idea {
  id: string;
  title: string;
  summary: string;
  opportunityScore: number; // 0-100
  recommendedPath: string;
  capitalRequired: number;
  nextAction: string;
  stage: IdeaStage;
  createdAt: Date;
  tags: string[];
}

// ─── Money ───────────────────────────────────────────────────────────────────

export interface CostEntry {
  id: string;
  name: string;
  category: string;
  monthlyCost: number;
  trend: 'up' | 'down' | 'stable';
  trendPercent: number;
}

export interface FinancialSummary {
  totalMonthlyCost: number;
  totalValueCreated: number;
  netROI: number;
  costsByCategory: Record<string, number>;
  monthlyTrend: { month: string; cost: number; value: number }[];
}

// ─── Execution ───────────────────────────────────────────────────────────────

export interface ExecutionTool {
  id: string;
  name: string;
  description: string;
  status: ExecutionToolStatus;
  type: 'agent' | 'tool' | 'model';
  pendingApprovals: PendingApproval[];
  lastRun?: Date;
  successRate?: number;
  logoEmoji: string;
}

export interface PendingApproval {
  id: string;
  task: string;
  requestedBy: string;
  createdAt: Date;
  riskLevel: RiskLevel;
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export interface DashboardStat {
  label: string;
  value: string;
  change: string;
  changeType: 'positive' | 'negative' | 'neutral';
  icon: string;
}
