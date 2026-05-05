import Link from 'next/link';
import { listAgents, listDecisions, listIdeas } from '@/lib/data/queries';
import { listActions } from '@/lib/hermes';
import { ArrowRight, Lightning, Robot, Terminal, ChatCircleDots, CheckCircle, XCircle, ArrowClockwise, Clock, Brain, Handshake, SealCheck, Lightbulb, ChartLineUp, MagnifyingGlass, Wrench, Money, Megaphone, Gear } from '@phosphor-icons/react/dist/ssr';
import type { Icon } from '@phosphor-icons/react';

const divisionConfig: Record<string, { icon: Icon; color: string; bg: string }> = {
  Strategy:    { icon: ChartLineUp,      color: '#c2ff00',  bg: 'rgba(194,255,0,0.1)' },
  Research:    { icon: MagnifyingGlass,  color: '#5bbcff',  bg: 'rgba(91,188,255,0.1)' },
  Execution:   { icon: Wrench,           color: '#ff9500',  bg: 'rgba(255,149,0,0.1)' },
  Finance:     { icon: Money,            color: '#00e096',  bg: 'rgba(0,224,150,0.1)' },
  Marketing:   { icon: Megaphone,        color: '#ff4466',  bg: 'rgba(255,68,102,0.1)' },
  Operations:  { icon: Gear,             color: '#a855f7',  bg: 'rgba(168,85,247,0.1)' },
  Development: { icon: Terminal,         color: '#c2ff00',  bg: 'rgba(194,255,0,0.1)' },
};

// Dashboard is server-rendered. Every number on this page comes from the
// database — no mocks. If a table is empty, the card shows zero. That's the
// honest state. Don't paper over it with placeholder values.

export const dynamic = 'force-dynamic';

function relativeTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}

function statusIcon(status: string) {
  switch (status) {
    case 'completed':
      return <CheckCircle size={13} weight="fill" color="var(--green)" />;
    case 'failed':
      return <XCircle size={13} weight="fill" color="var(--red)" />;
    case 'running':
      return <ArrowClockwise size={13} weight="bold" color="var(--accent)" />;
    case 'pending_approval':
      return <Clock size={13} weight="fill" color="var(--yellow)" />;
    default:
      return <Clock size={13} weight="regular" color="var(--text-dim)" />;
  }
}

function prettyKind(kind: string): string {
  // create_calendar_event → "Create calendar event"
  const s = kind.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function Dashboard() {
  const [decisions, agents, ideas, allRecent, pendingActions] = await Promise.all([
    listDecisions(),
    listAgents(),
    listIdeas(),
    listActions({ limit: 200 }),
    listActions({ status: 'pending_approval', limit: 100 }),
  ]);

  const pendingDecisions = decisions.filter((d) => d.status === 'pending');
  const activeAgents = agents.filter((a) => a.status === 'active').length;
  const pendingApprovals = pendingActions.length;

  // Slice the same 200-row pull for both the recent feed and the weekly
  // counter — one round trip instead of three.
  const recentActions = allRecent.slice(0, 6);
  const weekAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const actionsThisWeek = allRecent.filter(
    (a) => a.status === 'completed' && new Date(a.created_at).getTime() >= weekAgoMs
  ).length;

  const validatedIdeas = ideas.filter((i) => i.stage === 'validated').length;

  // Quick action banner — only show signal that's real.
  const bannerBits: string[] = [];
  if (pendingDecisions.length > 0) {
    bannerBits.push(`${pendingDecisions.length} pending decision${pendingDecisions.length === 1 ? '' : 's'}`);
  }
  if (pendingApprovals > 0) {
    bannerBits.push(`${pendingApprovals} Hermes approval${pendingApprovals === 1 ? '' : 's'} waiting`);
  }
  if (bannerBits.length === 0) {
    bannerBits.push('Nothing waiting on you. Inbox zero.');
  }

  return (
    <div style={{ padding: '24px', maxWidth: 1100 }}>
      {/* Header */}
      <div className="animate-fade-up" style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 8 }}>
          JT OS · Mission Control
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, letterSpacing: '-0.04em' }}>
          <span className="gradient-text">Good morning, JT</span>
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 6, marginBottom: 0, fontFamily: 'var(--font-mono)' }}>
          <span style={{ color: 'var(--accent)' }}>●</span>
          {' '}CEO online · {activeAgents} agent{activeAgents === 1 ? '' : 's'} active · {pendingDecisions.length} decision{pendingDecisions.length === 1 ? '' : 's'} pending
        </p>
      </div>

      {/* Quick action banner */}
      <div
        className="animate-fade-up delay-1"
        style={{
          background: 'linear-gradient(135deg, rgba(124,58,237,0.15) 0%, rgba(194,255,0,0.05) 100%)',
          border: '1px solid rgba(124,58,237,0.3)',
          borderRadius: 12,
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginBottom: 24,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', marginBottom: 2 }}>
            <Brain size={16} weight="fill" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />
            CEO Agent Summary
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {bannerBits.join(' · ')}
          </div>
        </div>
        <Link href="/chat" className="btn btn-cyan">
          <ChatCircleDots size={16} weight="fill" />
          Open Chat
        </Link>
      </div>

      {/* Stats grid — every number derived from a real table */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 12,
          marginBottom: 28,
        }}
      >
        <StatCard
          icon={Robot}
          iconColor="var(--accent)"
          value={activeAgents}
          label="Active Agents"
          sub={`${agents.length} total`}
          delay={2}
        />
        <StatCard
          icon={Lightning}
          iconColor="var(--yellow)"
          value={pendingDecisions.length}
          label="Pending Decisions"
          sub={`${decisions.length} total`}
          tone={pendingDecisions.length > 0 ? 'negative' : 'neutral'}
          delay={3}
        />
        <StatCard
          icon={Handshake}
          iconColor="var(--red)"
          value={pendingApprovals}
          label="Hermes Approvals"
          sub={pendingApprovals > 0 ? 'Awaiting your call' : 'None waiting'}
          tone={pendingApprovals > 0 ? 'negative' : 'neutral'}
          delay={4}
        />
        <StatCard
          icon={SealCheck}
          iconColor="var(--green)"
          value={actionsThisWeek}
          label="Actions This Week"
          sub="Hermes completed runs"
          tone={actionsThisWeek > 0 ? 'positive' : 'neutral'}
          delay={5}
        />
        <StatCard
          icon={Lightbulb}
          iconColor="var(--accent2-bright)"
          value={ideas.length}
          label="Ideas Tracked"
          sub={`${validatedIdeas} validated`}
          delay={6}
        />
      </div>

      {/* Two column: decisions + agents */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }} className="md:grid-cols-2">

        {/* Pending decisions */}
        <div className="card animate-fade-up delay-3">
          <div
            style={{
              padding: '16px 16px 12px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Lightning size={16} weight="fill" color="var(--yellow)" />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Pending Decisions</span>
            </div>
            <Link href="/decisions" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              All <ArrowRight size={13} weight="bold" />
            </Link>
          </div>
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pendingDecisions.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', padding: '6px 0' }}>
                No pending decisions.
              </div>
            )}
            {pendingDecisions.slice(0, 3).map((d) => (
              <div key={d.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{d.title}</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span
                    className="badge"
                    style={{
                      background: d.risk === 'high' ? 'rgba(244,63,94,0.12)' : d.risk === 'medium' ? 'rgba(245,158,11,0.12)' : 'rgba(34,211,160,0.12)',
                      color: d.risk === 'high' ? 'var(--red)' : d.risk === 'medium' ? 'var(--yellow)' : 'var(--green)',
                    }}
                  >
                    {d.risk} risk
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                    {d.confidence}% confidence
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Agent status */}
        <div className="card animate-fade-up delay-4">
          <div
            style={{
              padding: '16px 16px 12px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Robot size={16} weight="fill" color="var(--accent)" />
              <span style={{ fontSize: 13, fontWeight: 600 }}>Agent Status</span>
            </div>
            <Link href="/agents" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
              All <ArrowRight size={13} weight="bold" />
            </Link>
          </div>
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {agents.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                No agents in registry.
              </div>
            )}
            {agents.slice(0, 5).map((a) => {
              const div = divisionConfig[a.division] ?? divisionConfig['Operations'];
              const DivIcon = div.icon;
              return (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  className={`pulse-${a.status === 'active' ? 'online' : a.status === 'idle' ? 'degraded' : 'offline'}`}
                />
                <div style={{
                  width: 28, height: 28, borderRadius: 7, flexShrink: 0,
                  background: div.bg,
                  border: `1px solid color-mix(in srgb, ${div.color} 30%, transparent)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <DivIcon size={13} weight="fill" color={div.color} />
                </div>
                <span style={{ fontSize: 13, flex: 1, color: 'var(--text)' }}>{a.name}</span>
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    color: a.status === 'active' ? 'var(--green)' : a.status === 'idle' ? 'var(--yellow)' : 'var(--red)',
                  }}
                >
                  {a.status}
                </span>
              </div>
            );
            })}
          </div>
        </div>
      </div>

      {/* Execution hub — recent Hermes activity, all real */}
      <div className="card animate-fade-up delay-5">
        <div
          style={{
            padding: '16px 16px 12px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Terminal size={16} weight="fill" color="var(--accent2-bright)" />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Hermes — Recent Activity</span>
          </div>
          <Link href="/execution" style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
            {pendingApprovals > 0 ? `${pendingApprovals} pending` : 'All'} <ArrowRight size={13} weight="bold" />
          </Link>
        </div>
        <div style={{ padding: '4px 0' }}>
          {recentActions.length === 0 && (
            <div style={{ padding: '14px 16px', fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
              No actions yet. Ask the CEO Agent to do something.
            </div>
          )}
          {recentActions.map((a, i) => (
            <div
              key={a.id}
              style={{
                padding: '10px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                borderBottom: i < recentActions.length - 1 ? '1px solid var(--border-subtle)' : 'none',
              }}
            >
              {statusIcon(a.status)}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                  {prettyKind(a.kind)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                  {a.proposed_by} · {relativeTime(new Date(a.created_at))}
                </div>
              </div>
              <span
                className="badge"
                style={{
                  background:
                    a.status === 'completed' ? 'rgba(34,211,160,0.12)' :
                    a.status === 'failed'    ? 'rgba(244,63,94,0.12)'  :
                    a.status === 'pending_approval' ? 'rgba(245,158,11,0.12)' :
                    'var(--bg-elevated)',
                  color:
                    a.status === 'completed' ? 'var(--green)' :
                    a.status === 'failed'    ? 'var(--red)'   :
                    a.status === 'pending_approval' ? 'var(--yellow)' :
                    'var(--text-muted)',
                  fontSize: 10,
                }}
              >
                {a.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Small inline component to keep the stats grid readable.
function StatCard({
  icon: IconComponent,
  iconColor = 'var(--accent)',
  value,
  label,
  sub,
  tone = 'neutral',
  delay,
}: {
  icon: Icon;
  iconColor?: string;
  value: number | string;
  label: string;
  sub: string;
  tone?: 'positive' | 'negative' | 'neutral';
  delay: number;
}) {
  const subColor =
    tone === 'positive' ? 'var(--green)' :
    tone === 'negative' ? 'var(--red)' :
    'var(--text-dim)';
  return (
    <div className={`card animate-fade-up delay-${Math.min(delay, 8)}`} style={{ padding: '18px' }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10, marginBottom: 12,
        background: `color-mix(in srgb, ${iconColor} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${iconColor} 25%, transparent)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <IconComponent size={18} weight="fill" color={iconColor} />
      </div>
      <div
        className="mono"
        style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em', marginBottom: 3, lineHeight: 1 }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: subColor }}>
        {sub}
      </div>
    </div>
  );
}
