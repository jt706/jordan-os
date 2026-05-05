'use client';

// Client view for the Agents page. Receives initial agents from the server
// and provides:
//   • Sort interactivity (ROI / value / cost)
//   • Hire button (opens an inline form, POSTs /api/agents/hire)
//   • Bench / Activate / Fire buttons on each card (POST /api/agents/:id/:action)
//   • Optimistic UI: hide a row that's been killed, swap status badges instantly
//
// Every button hits Hermes, which writes an audit row before changing the
// underlying agents table. Fire is approval-gated — UI shows the row as
// "pending fire" until Jordan approves on /execution.

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Agent, AgentDivision, AgentStatus } from '@/lib/types';
import { Activity, UserPlus, X, Search, Sparkles, ExternalLink, History, DollarSign, ChevronDown, ChevronUp } from 'lucide-react';
import { Lightbulb, Robot, ChartLineUp, MagnifyingGlass, Wrench, Money, Megaphone, Gear, Terminal, type Icon } from '@phosphor-icons/react';

const divisionConfig: Record<string, { icon: Icon; color: string; bg: string }> = {
  Strategy:    { icon: ChartLineUp,     color: '#c2ff00',  bg: 'rgba(194,255,0,0.1)' },
  Research:    { icon: MagnifyingGlass, color: '#5bbcff',  bg: 'rgba(91,188,255,0.1)' },
  Execution:   { icon: Wrench,          color: '#ff9500',  bg: 'rgba(255,149,0,0.1)' },
  Finance:     { icon: Money,           color: '#00e096',  bg: 'rgba(0,224,150,0.1)' },
  Marketing:   { icon: Megaphone,       color: '#ff4466',  bg: 'rgba(255,68,102,0.1)' },
  Operations:  { icon: Gear,            color: '#a855f7',  bg: 'rgba(168,85,247,0.1)' },
  Development: { icon: Terminal,        color: '#c2ff00',  bg: 'rgba(194,255,0,0.1)' },
};

const statusConfig: Record<AgentStatus, { label: string; color: string; dotClass: string }> = {
  active:  { label: 'Active',  color: 'var(--green)',    dotClass: 'pulse-online' },
  idle:    { label: 'Idle',    color: 'var(--yellow)',   dotClass: 'pulse-degraded' },
  benched: { label: 'Benched', color: 'var(--red)',      dotClass: 'pulse-offline' },
  killed:  { label: 'Killed',  color: 'var(--text-dim)', dotClass: 'pulse-offline' },
};

const DIVISIONS: AgentDivision[] = ['Strategy', 'Research', 'Execution', 'Finance', 'Marketing', 'Operations', 'Development'];

// Classify agent role into hierarchy tier
function getTier(role: string): 'lead' | 'senior' | 'agent' {
  const r = role.toLowerCase();
  if (/head of|general manager|chief of staff|director|ceo|foreman|owner|vp /.test(r)) return 'lead';
  if (/manager|strategist|architect|lead |senior|coordinator/.test(r)) return 'senior';
  return 'agent';
}

const tierConfig = {
  lead:   { label: 'Leadership',    color: '#c2ff00',  bg: 'rgba(194,255,0,0.08)' },
  senior: { label: 'Senior',        color: '#5bbcff',  bg: 'rgba(91,188,255,0.08)' },
  agent:  { label: 'Specialists',   color: '#a855f7',  bg: 'rgba(168,85,247,0.06)' },
};

export default function AgentsView({ initialAgents }: { initialAgents: Agent[] }) {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [view, setView] = useState<'org' | 'list'>('org');
  const [sortBy, setSortBy] = useState<'roi' | 'value' | 'cost'>('roi');
  const [showHire, setShowHire] = useState(false);
  const [pendingFire, setPendingFire] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();

  const sorted = [...agents].sort((a, b) => {
    if (sortBy === 'roi') return b.roi - a.roi;
    if (sortBy === 'value') return b.valueCreated - a.valueCreated;
    return b.monthlyCost - a.monthlyCost;
  });

  const totalValue = agents.reduce((s, a) => s + a.valueCreated, 0);
  const totalCost = agents.reduce((s, a) => s + a.monthlyCost, 0);

  // ─── Action callers ────────────────────────────────────────────────────────

  async function callAction(id: string, action: 'bench' | 'activate' | 'fire', body?: Record<string, unknown>) {
    const res = await fetch(`/api/agents/${id}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!res.ok) {
      alert(`${action} failed: ${json.error ?? res.statusText}`);
      return null;
    }
    return json as { actionId: string; status: 'completed' | 'failed' | 'pending_approval'; result?: unknown; error?: string };
  }

  async function onBench(id: string) {
    setAgents((curr) => curr.map((a) => (a.id === id ? { ...a, status: 'benched' as const } : a)));
    const r = await callAction(id, 'bench');
    if (!r || r.status === 'failed') startTransition(() => router.refresh());
  }

  async function onActivate(id: string) {
    setAgents((curr) => curr.map((a) => (a.id === id ? { ...a, status: 'active' as const } : a)));
    const r = await callAction(id, 'activate');
    if (!r || r.status === 'failed') startTransition(() => router.refresh());
  }

  async function onFire(id: string, name: string) {
    const reason = window.prompt(`Why are you firing ${name}? (audit log)`);
    if (!reason || !reason.trim()) return;
    const r = await callAction(id, 'fire', { reason });
    if (!r) return;
    if (r.status === 'pending_approval') {
      setPendingFire((s) => new Set(s).add(id));
      alert(`Fire queued for approval. Approve on /execution to make it stick.`);
    } else {
      startTransition(() => router.refresh());
    }
  }

  // Log a value-attribution entry — bumps agents.value_created + roi server-side.
  async function onLogValue(id: string, name: string) {
    const raw = window.prompt(`Value created by ${name}? (NZD, e.g. 250)`);
    if (!raw) return;
    const amount = parseFloat(raw);
    if (!Number.isFinite(amount)) {
      alert('Need a number.');
      return;
    }
    const note = window.prompt(`Note (what produced the value)?`) ?? '';
    const res = await fetch(`/api/agents/${id}/log-value`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, note }),
    });
    const json = await res.json();
    if (!res.ok) {
      alert(`Log failed: ${json.error ?? res.statusText}`);
      return;
    }
    // Optimistic local update + refresh from server.
    setAgents((curr) =>
      curr.map((a) =>
        a.id === id
          ? { ...a, valueCreated: json.rollup.value_created, roi: json.rollup.roi }
          : a,
      ),
    );
    startTransition(() => router.refresh());
  }

  return (
    <div style={{ padding: 24, maxWidth: 960 }}>
      <div className="animate-fade-up" style={{ marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 4 }}>
            Agent Registry
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
            Hire, train, bench, or fire your AI agents. Every change is audited by Hermes.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* View toggle */}
          <div style={{ display: 'flex', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 3, gap: 2 }}>
            {(['org', 'list'] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: '4px 12px', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: 11,
                fontFamily: 'var(--font-mono)', fontWeight: 600, transition: 'all 0.15s',
                background: view === v ? 'var(--bg-surface)' : 'transparent',
                color: view === v ? 'var(--accent)' : 'var(--text-muted)',
                boxShadow: view === v ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
              }}>
                {v === 'org' ? 'ORG' : 'LIST'}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowHire((s) => !s)}
            className="btn btn-cyan"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px' }}
          >
            {showHire ? <X size={14} /> : <UserPlus size={14} />}
            {showHire ? 'Cancel' : 'Hire agent'}
          </button>
        </div>
      </div>

      {showHire && (
        <HireForm
          onCancel={() => setShowHire(false)}
          onHired={() => {
            setShowHire(false);
            startTransition(() => router.refresh());
          }}
        />
      )}

      {/* Summary cards */}
      <div className="animate-fade-up delay-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 24 }}>
        {[
          { label: 'Total Value', value: `$${totalValue.toLocaleString()}`, color: 'var(--green)' },
          { label: 'Monthly Cost', value: `$${totalCost}`, color: 'var(--red)' },
          { label: 'Net ROI', value: `${Math.round(totalValue / Math.max(totalCost, 1))}x`, color: 'var(--accent)' },
          { label: 'Active Agents', value: agents.filter((a) => a.status === 'active').length.toString(), color: 'var(--text)' },
        ].map((s) => (
          <div key={s.label} className="card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: 4 }}>{s.label}</div>
            <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── ORG VIEW ── */}
      {view === 'org' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, opacity: isPending ? 0.6 : 1 }}>
          {DIVISIONS.map((divName) => {
            const divAgents = agents.filter((a) => a.division === divName);
            if (divAgents.length === 0) return null;
            const cfg = divisionConfig[divName];
            const DivIcon = cfg.icon;
            const leads   = divAgents.filter((a) => getTier(a.role) === 'lead');
            const seniors = divAgents.filter((a) => getTier(a.role) === 'senior');
            const agts    = divAgents.filter((a) => getTier(a.role) === 'agent');
            return (
              <div key={divName} className="card animate-fade-up" style={{ overflow: 'hidden' }}>
                {/* Division header */}
                <div style={{
                  padding: '14px 18px',
                  background: cfg.bg,
                  borderBottom: `1px solid color-mix(in srgb, ${cfg.color} 20%, transparent)`,
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: `color-mix(in srgb, ${cfg.color} 15%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${cfg.color} 30%, transparent)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <DivIcon size={18} weight="fill" color={cfg.color} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', letterSpacing: '-0.02em' }}>{divName}</div>
                    <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: cfg.color, marginTop: 1 }}>
                      {divAgents.length} agent{divAgents.length !== 1 ? 's' : ''} · {divAgents.filter(a => a.status === 'active').length} active
                    </div>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    {(['lead', 'senior', 'agent'] as const).map((tier) => {
                      const count = divAgents.filter(a => getTier(a.role) === tier).length;
                      if (count === 0) return null;
                      const tc = tierConfig[tier];
                      return (
                        <span key={tier} style={{
                          fontSize: 10, fontFamily: 'var(--font-mono)', fontWeight: 600,
                          background: tc.bg, color: tc.color, padding: '2px 8px',
                          borderRadius: 6, border: `1px solid color-mix(in srgb, ${tc.color} 20%, transparent)`,
                        }}>
                          {count} {tc.label}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Tiers */}
                {([['lead', leads], ['senior', seniors], ['agent', agts]] as const).map(([tier, list]) => {
                  if (list.length === 0) return null;
                  const tc = tierConfig[tier];
                  return (
                    <div key={tier} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <div style={{
                        padding: '6px 18px', fontSize: 9, fontFamily: 'var(--font-mono)',
                        color: tc.color, letterSpacing: '0.1em', textTransform: 'uppercase',
                        background: `color-mix(in srgb, ${tc.color} 4%, transparent)`,
                        borderBottom: `1px solid color-mix(in srgb, ${tc.color} 10%, transparent)`,
                      }}>
                        {tc.label}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
                        {list.map((agent, idx) => {
                          const sc = statusConfig[agent.status];
                          return (
                            <div key={agent.id} style={{
                              padding: '10px 18px',
                              display: 'flex', alignItems: 'center', gap: 10,
                              borderRight: idx % 2 === 0 ? '1px solid var(--border-subtle)' : 'none',
                              borderBottom: '1px solid var(--border-subtle)',
                            }}>
                              <div style={{
                                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                                background: cfg.bg,
                                border: `1px solid color-mix(in srgb, ${cfg.color} 25%, transparent)`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                <DivIcon size={13} weight="fill" color={cfg.color} />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {agent.name}
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {agent.role.length > 40 ? agent.role.slice(0, 40) + '…' : agent.role}
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                <div className={sc.dotClass} style={{ width: 6, height: 6 }} />
                                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: sc.color }}>{agent.status}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {view === 'list' && <>

      {/* Leaderboard */}
      <div className="card animate-fade-up delay-2" style={{ marginBottom: 20 }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Activity size={14} color="var(--accent)" />
          <span style={{ fontWeight: 700, fontSize: 14 }}>Value Leaderboard</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {(['roi', 'value', 'cost'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                style={{
                  padding: '3px 8px',
                  borderRadius: 6,
                  border: '1px solid',
                  borderColor: sortBy === s ? 'rgba(0,200,255,0.3)' : 'var(--border)',
                  background: sortBy === s ? 'rgba(0,200,255,0.1)' : 'transparent',
                  color: sortBy === s ? 'var(--accent)' : 'var(--text-muted)',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {s.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding: '10px 0' }}>
          {sorted.map((agent, i) => {
            const sc = statusConfig[agent.status];
            const barWidth = Math.min((agent.valueCreated / Math.max(sorted[0].valueCreated, 1)) * 100, 100);
            const div = divisionConfig[agent.division] ?? divisionConfig['Operations'];
            const DivIcon = div.icon;
            return (
              <div
                key={agent.id}
                style={{
                  padding: '10px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  borderBottom: i < sorted.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                }}
              >
                <div className="mono" style={{ width: 20, fontSize: 12, color: 'var(--text-dim)', flexShrink: 0 }}>
                  #{i + 1}
                </div>
                <div style={{
                  width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                  background: div.bg,
                  border: `1px solid color-mix(in srgb, ${div.color} 30%, transparent)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <DivIcon size={15} weight="fill" color={div.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                    <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{agent.name}</span>
                    <div className={sc.dotClass} />
                    <span style={{ fontSize: 11, color: sc.color, fontFamily: 'var(--font-mono)' }}>{sc.label}</span>
                  </div>
                  {/* Value bar */}
                  <div style={{ height: 3, background: 'var(--bg-elevated)', borderRadius: 2 }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${barWidth}%`,
                        background: agent.roi > 0 ? 'var(--green)' : 'var(--red)',
                        borderRadius: 2,
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: agent.valueCreated > 0 ? 'var(--green)' : 'var(--text-muted)' }}>
                    ${agent.valueCreated.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                    ROI {agent.roi > 0 ? '+' : ''}{agent.roi === 9999 ? '∞' : `${agent.roi}%`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Agent cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, opacity: isPending ? 0.6 : 1 }}>
        {agents.map((agent, i) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            index={i}
            pendingFire={pendingFire.has(agent.id)}
            onBench={() => onBench(agent.id)}
            onActivate={() => onActivate(agent.id)}
            onFire={() => onFire(agent.id, agent.name)}
            onLogValue={() => onLogValue(agent.id, agent.name)}
          />
        ))}
      </div>
      </>}
    </div>
  );
}

// ─── Hire form ───────────────────────────────────────────────────────────────

interface TemplateSummary {
  id: string;
  name: string;
  category: string;
  description: string;
  sourceUrl: string;
}

function HireForm({ onCancel, onHired }: { onCancel: () => void; onHired: () => void }) {
  const [tab, setTab] = useState<'manual' | 'browse'>('manual');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [division, setDivision] = useState<AgentDivision>('Operations');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [capabilities, setCapabilities] = useState('');
  const [avatar, setAvatar] = useState('🤖');
  const [hireReason, setHireReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function handleTemplatePicked(t: { id: string; name: string; description: string; content: string; sourceUrl: string }) {
    setName(prettifyName(t.name));
    setRole(t.description || prettifyName(t.name));
    setSystemPrompt(t.content);
    setHireReason(`Hired from aitmpl template: ${t.id}`);
    setTab('manual');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/agents/hire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          role: role.trim(),
          division,
          systemPrompt: systemPrompt.trim(),
          capabilities: capabilities.split(',').map((s) => s.trim()).filter(Boolean),
          avatar: avatar.trim() || '🤖',
          hireReason: hireReason.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setErr(json.error ?? 'hire failed');
        return;
      }
      onHired();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'unknown error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card animate-fade-up" style={{ padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>Hire a new agent</div>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-elevated)', padding: 3, borderRadius: 6, border: '1px solid var(--border)' }}>
          <TabButton active={tab === 'manual'} onClick={() => setTab('manual')}>Manual</TabButton>
          <TabButton active={tab === 'browse'} onClick={() => setTab('browse')}>
            <Sparkles size={11} /> Browse templates
          </TabButton>
        </div>
      </div>

      {tab === 'browse' && <TemplateBrowser onPick={handleTemplatePicked} />}

      {tab === 'manual' && (
      <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '60px 1fr 1fr', gap: 8 }}>
        <Input label="Avatar" value={avatar} onChange={setAvatar} placeholder="🤖" />
        <Input label="Name" value={name} onChange={setName} placeholder="Atlas" required />
        <Input label="Role" value={role} onChange={setRole} placeholder="Research analyst" required />
      </div>
      <Field label="Division">
        <select
          value={division}
          onChange={(e) => setDivision(e.target.value as AgentDivision)}
          style={inputStyle}
        >
          {DIVISIONS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </Field>
      <Field label="System prompt (4–8 lines: role, scope, what to do, what NOT to do, tone)">
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={6}
          required
          style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.5 }}
          placeholder="You are Atlas, a research analyst for Jordan Tuhura. Your job is to..."
        />
      </Field>
      <Input label="Capabilities (comma-separated)" value={capabilities} onChange={setCapabilities} placeholder="web search, summarise PDFs, scoring" />
      <Input label="Hire reason (one line, optional)" value={hireReason} onChange={setHireReason} placeholder="Need someone to scan grant deadlines weekly" />
      {err && <div style={{ color: 'var(--red)', fontSize: 12 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }}>Cancel</button>
        <button type="submit" disabled={submitting} className="btn btn-cyan" style={{ fontSize: 12, padding: '6px 12px' }}>
          {submitting ? 'Hiring…' : 'Hire'}
        </button>
      </div>
      </form>
      )}
    </div>
  );
}

// ─── Template browser (AITMPL) ──────────────────────────────────────────────

function TemplateBrowser({ onPick }: { onPick: (t: { id: string; name: string; description: string; content: string; sourceUrl: string }) => void }) {
  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetch('/api/agent-templates')
      .then((r) => r.json())
      .then((j) => {
        if (!mounted) return;
        if (j.error) setLoadErr(j.error);
        setTemplates(Array.isArray(j.templates) ? j.templates : []);
      })
      .catch((e) => mounted && setLoadErr(e instanceof Error ? e.message : 'fetch failed'));
    return () => { mounted = false; };
  }, []);

  async function pick(id: string) {
    setPicking(id);
    try {
      const res = await fetch(`/api/agent-templates/${encodeURIComponent(id)}`);
      const j = await res.json();
      if (!res.ok || !j.template) {
        alert(`Template fetch failed: ${j.error ?? res.statusText}`);
        return;
      }
      onPick(j.template);
    } finally {
      setPicking(null);
    }
  }

  const filtered = (templates ?? []).filter((t) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q) || t.description.toLowerCase().includes(q);
  });

  // Group by category
  const grouped = filtered.reduce<Record<string, TemplateSummary[]>>((acc, t) => {
    (acc[t.category] = acc[t.category] ?? []).push(t);
    return acc;
  }, {});

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
        <input
          type="text"
          placeholder="Search 600+ agent templates from aitmpl.com…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ ...inputStyle, paddingLeft: 32 }}
        />
      </div>

      {loadErr && (
        <div style={{ fontSize: 11, color: 'var(--yellow)', fontFamily: 'var(--font-mono)' }}>
          ⚠ Registry unreachable ({loadErr}) — switch to Manual to write your own.
        </div>
      )}

      {!templates && !loadErr && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading templates…</div>
      )}

      {templates && templates.length === 0 && !loadErr && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Registry returned no agents. Check AITMPL_REGISTRY_URL or use Manual.
        </div>
      )}

      <div style={{ maxHeight: 360, overflowY: 'auto', display: 'grid', gap: 12 }}>
        {Object.entries(grouped).map(([cat, items]) => (
          <div key={cat}>
            <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: 4, letterSpacing: '0.05em' }}>
              {cat} <span style={{ color: 'var(--text-dim)' }}>({items.length})</span>
            </div>
            <div style={{ display: 'grid', gap: 4 }}>
              {items.slice(0, 50).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pick(t.id)}
                  disabled={picking === t.id}
                  style={{
                    textAlign: 'left',
                    padding: '8px 10px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    color: 'var(--text)',
                    cursor: picking === t.id ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'rgba(0,200,255,0.4)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 12 }}>{prettifyName(t.name)}</div>
                    {t.description && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.description}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                    {picking === t.id ? '…' : 'use'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 10, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 4 }}>
        <ExternalLink size={10} />
        <span>Templates from <a href="https://www.aitmpl.com/agents" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>aitmpl.com</a> — 600+ pre-built agents.</span>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '4px 10px',
        borderRadius: 4,
        border: 'none',
        background: active ? 'var(--bg)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        boxShadow: active ? '0 1px 3px rgba(0,0,0,0.2)' : 'none',
      }}
    >
      {children}
    </button>
  );
}

function prettifyName(s: string): string {
  if (!s) return s;
  return s
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 10px',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text)',
  fontSize: 13,
  outline: 'none',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>{label}</span>
      {children}
    </label>
  );
}

function Input({ label, value, onChange, placeholder, required }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean }) {
  return (
    <Field label={label}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        style={inputStyle}
      />
    </Field>
  );
}

// ─── Agent card ──────────────────────────────────────────────────────────────

function AgentCard({
  agent,
  index,
  pendingFire,
  onBench,
  onActivate,
  onFire,
  onLogValue,
}: {
  agent: Agent;
  index: number;
  pendingFire: boolean;
  onBench: () => void;
  onActivate: () => void;
  onFire: () => void;
  onLogValue: () => void;
}) {
  const sc = statusConfig[agent.status];
  const div = divisionConfig[agent.division] ?? divisionConfig['Operations'];
  const DivIcon = div.icon;
  const [showHistory, setShowHistory] = useState(false);
  const isLive = agent.status !== 'killed';
  return (
    <div
      className={`card animate-fade-up delay-${Math.min(index + 3, 8)}`}
      style={{ padding: '16px', opacity: agent.status === 'killed' ? 0.5 : 1 }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10, flexShrink: 0,
          background: div.bg,
          border: `1px solid color-mix(in srgb, ${div.color} 30%, transparent)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <DivIcon size={20} weight="fill" color={div.color} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{agent.name}</span>
            <div className={sc.dotClass} />
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{agent.role}</div>
          <span className="badge" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)', border: '1px solid var(--border)', fontSize: 10 }}>
            {agent.division}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
        <MiniMetric label="Cost/mo" value={agent.monthlyCost === 0 ? 'Free' : `$${agent.monthlyCost}`} />
        <MiniMetric label="Value" value={`$${agent.valueCreated.toLocaleString()}`} color="var(--green)" />
        <MiniMetric
          label="ROI"
          value={agent.roi === 9999 ? '∞' : `${agent.roi > 0 ? '+' : ''}${agent.roi}%`}
          color={agent.roi > 200 ? 'var(--green)' : agent.roi > 0 ? 'var(--yellow)' : 'var(--red)'}
        />
      </div>

      {agent.recommendation && (
        <div
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '8px 10px',
            fontSize: 12,
            color: 'var(--text-muted)',
            lineHeight: 1.5,
            marginBottom: 12,
          }}
        >
          <Lightbulb size={13} weight="fill" color="var(--yellow)" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }} />
          {agent.recommendation}
        </div>
      )}

      {pendingFire && (
        <div
          style={{
            background: 'rgba(255,180,0,0.08)',
            border: '1px solid rgba(255,180,0,0.3)',
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 11,
            color: 'var(--yellow)',
            marginBottom: 12,
            fontFamily: 'var(--font-mono)',
          }}
        >
          ⏳ Fire pending — approve on /execution
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {agent.status === 'active' && (
          <>
            <button onClick={onBench} className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }}>Bench</button>
            <button onClick={onFire} className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px', color: 'var(--red)' }} disabled={pendingFire}>Fire</button>
          </>
        )}
        {agent.status === 'benched' && (
          <>
            <button onClick={onActivate} className="btn btn-cyan" style={{ fontSize: 11, padding: '4px 10px' }}>Activate</button>
            <button onClick={onFire} className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px', color: 'var(--red)' }} disabled={pendingFire}>Fire</button>
          </>
        )}
        {agent.status === 'idle' && (
          <button onClick={onActivate} className="btn btn-cyan" style={{ fontSize: 11, padding: '4px 10px' }}>Activate</button>
        )}
        {agent.status === 'killed' && (
          <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>fired</span>
        )}
        {isLive && (
          <button
            onClick={onLogValue}
            className="btn btn-ghost"
            style={{ fontSize: 11, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--green)' }}
            title="Log value created by this agent"
          >
            <DollarSign size={11} /> Value
          </button>
        )}
        <button
          onClick={() => setShowHistory((s) => !s)}
          className="btn btn-ghost"
          style={{ fontSize: 11, padding: '4px 10px', marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-dim)' }}
          title="Training & value history"
        >
          <History size={11} /> {showHistory ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>
      </div>

      {showHistory && <AgentHistory agentId={agent.id} />}
    </div>
  );
}

// ─── Per-agent history (training + value log) ──────────────────────────────

interface TrainingEvent {
  id: string;
  kind: 'prompt_rewrite' | 'capability_add' | 'capability_remove' | 'feedback';
  feedback: string;
  capability: string | null;
  trained_by: string;
  created_at: string;
}

interface ValueEntry {
  id: string;
  amount: number;
  note: string;
  created_at: string;
}

function AgentHistory({ agentId }: { agentId: string }) {
  const [events, setEvents] = useState<TrainingEvent[] | null>(null);
  const [entries, setEntries] = useState<ValueEntry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      fetch(`/api/agents/${agentId}/training?limit=10`).then((r) => r.json()),
      fetch(`/api/agents/${agentId}/log-value?limit=10`).then((r) => r.json()),
    ])
      .then(([t, v]) => {
        if (!mounted) return;
        if (t.error) setErr(t.error);
        setEvents(Array.isArray(t.events) ? t.events : []);
        setEntries(Array.isArray(v.entries) ? v.entries : []);
      })
      .catch((e) => mounted && setErr(e instanceof Error ? e.message : 'fetch failed'));
    return () => { mounted = false; };
  }, [agentId]);

  return (
    <div
      style={{
        marginTop: 10,
        paddingTop: 10,
        borderTop: '1px solid var(--border-subtle)',
        display: 'grid',
        gap: 10,
      }}
    >
      {err && <div style={{ fontSize: 11, color: 'var(--red)' }}>{err}</div>}

      <div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: 4 }}>
          Training ({events?.length ?? '…'})
        </div>
        {events && events.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>No training yet.</div>
        )}
        {events && events.map((e) => (
          <div key={e.id} style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, lineHeight: 1.4 }}>
            <span className="mono" style={{ color: 'var(--accent)' }}>{e.kind}</span>
            {e.capability && <span className="mono" style={{ color: 'var(--text-dim)' }}> · {e.capability}</span>}
            <span style={{ color: 'var(--text-dim)' }}> · {new Date(e.created_at).toLocaleDateString('en-NZ')}</span>
            <div style={{ color: 'var(--text)', marginTop: 1 }}>{e.feedback}</div>
          </div>
        ))}
      </div>

      <div>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: 4 }}>
          Value log ({entries?.length ?? '…'})
        </div>
        {entries && entries.length === 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>No value logged yet.</div>
        )}
        {entries && entries.map((v) => (
          <div key={v.id} style={{ fontSize: 11, marginBottom: 3, display: 'flex', gap: 8 }}>
            <span className="mono" style={{ color: v.amount >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700, minWidth: 60 }}>
              {v.amount >= 0 ? '+' : ''}${Number(v.amount).toLocaleString()}
            </span>
            <span style={{ color: 'var(--text-muted)', flex: 1 }}>{v.note || '(no note)'}</span>
            <span style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
              {new Date(v.created_at).toLocaleDateString('en-NZ')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniMetric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
      <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: color ?? 'var(--text)' }}>{value}</div>
    </div>
  );
}
