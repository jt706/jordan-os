'use client';

// Client view for the Decisions page. Receives initial decisions from the
// server and provides filter + status-update interactivity. Status changes
// are local-only for now (don't persist back to Supabase yet).

import { useState } from 'react';
import { Decision, DecisionStatus } from '@/lib/types';
import { Check, RefreshCw, Pause, X, Filter } from 'lucide-react';

const riskColors: Record<string, { bg: string; text: string }> = {
  low: { bg: 'rgba(34,211,160,0.1)', text: 'var(--green)' },
  medium: { bg: 'rgba(245,158,11,0.1)', text: 'var(--yellow)' },
  high: { bg: 'rgba(244,63,94,0.1)', text: 'var(--red)' },
  critical: { bg: 'rgba(244,63,94,0.2)', text: 'var(--red)' },
};

const statusColors: Record<DecisionStatus, { bg: string; text: string }> = {
  pending: { bg: 'rgba(0,200,255,0.1)', text: 'var(--accent)' },
  approved: { bg: 'rgba(34,211,160,0.1)', text: 'var(--green)' },
  revised: { bg: 'rgba(168,85,247,0.1)', text: 'var(--accent2)' },
  parked: { bg: 'rgba(245,158,11,0.1)', text: 'var(--yellow)' },
  killed: { bg: 'rgba(244,63,94,0.1)', text: 'var(--red)' },
};

export default function DecisionsView({
  initialDecisions,
}: {
  initialDecisions: Decision[];
}) {
  const [decisions, setDecisions] = useState<Decision[]>(initialDecisions);
  const [filter, setFilter] = useState<DecisionStatus | 'all'>('all');

  const updateStatus = (id: string, status: DecisionStatus) => {
    setDecisions((prev) => prev.map((d) => (d.id === id ? { ...d, status } : d)));
  };

  const filtered = filter === 'all' ? decisions : decisions.filter((d) => d.status === filter);

  const counts = {
    all: decisions.length,
    pending: decisions.filter((d) => d.status === 'pending').length,
    approved: decisions.filter((d) => d.status === 'approved').length,
    parked: decisions.filter((d) => d.status === 'parked').length,
    killed: decisions.filter((d) => d.status === 'killed').length,
    revised: decisions.filter((d) => d.status === 'revised').length,
  };

  return (
    <div style={{ padding: 24, maxWidth: 860 }}>
      <div className="animate-fade-up" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 4 }}>
          Decision Board
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          Every important decision ends with: Approve · Revise · Park · Kill
        </p>
      </div>

      {/* Filter tabs */}
      <div className="animate-fade-up delay-1" style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {(['all', 'pending', 'approved', 'parked', 'killed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '5px 12px',
              borderRadius: 20,
              border: '1px solid',
              borderColor: filter === f ? 'rgba(0,200,255,0.3)' : 'var(--border)',
              background: filter === f ? 'rgba(0,200,255,0.1)' : 'transparent',
              color: filter === f ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              transition: 'all 0.15s',
            }}
          >
            <Filter size={10} />
            {f.charAt(0).toUpperCase() + f.slice(1)}
            <span style={{ opacity: 0.7 }}>{counts[f]}</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.map((d, i) => (
          <DecisionCard
            key={d.id}
            decision={d}
            index={i}
            onAction={updateStatus}
          />
        ))}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-dim)', fontSize: 14 }}>
            No decisions in this category.
          </div>
        )}
      </div>
    </div>
  );
}

function DecisionCard({
  decision: d,
  index,
  onAction,
}: {
  decision: Decision;
  index: number;
  onAction: (id: string, status: DecisionStatus) => void;
}) {
  const isPending = d.status === 'pending';
  const rc = riskColors[d.risk];
  const sc = statusColors[d.status];

  return (
    <div
      className={`card animate-fade-up delay-${Math.min(index + 2, 8)}`}
      style={{ padding: '18px 20px' }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
            <span
              className="badge"
              style={{ background: sc.bg, color: sc.text }}
            >
              {d.status.toUpperCase()}
            </span>
            <span
              className="badge"
              style={{ background: rc.bg, color: rc.text }}
            >
              {d.risk.toUpperCase()} RISK
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
              via {d.proposedBy}
            </span>
          </div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4 }}>
            {d.title}
          </h3>
        </div>
      </div>

      <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        {d.summary}
      </p>

      {/* Metrics row */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          marginBottom: 14,
          flexWrap: 'wrap',
        }}
      >
        <Metric label="Est. Cost" value={d.estimatedCost === 0 ? '$0' : `$${d.estimatedCost.toLocaleString()}`} />
        <Metric
          label="Confidence"
          value={`${d.confidence}%`}
          color={d.confidence > 80 ? 'var(--green)' : d.confidence > 60 ? 'var(--yellow)' : 'var(--red)'}
        />
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: 4 }}>
            CEO Agent Recommendation
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{d.recommendation}</div>
        </div>
      </div>

      {/* Tags */}
      <div style={{ display: 'flex', gap: 6, marginBottom: isPending ? 14 : 0, flexWrap: 'wrap' }}>
        {d.tags.map((tag) => (
          <span
            key={tag}
            className="badge"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)', border: '1px solid var(--border)' }}
          >
            {tag}
          </span>
        ))}
      </div>

      {/* Action buttons */}
      {isPending && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <button className="btn btn-green" onClick={() => onAction(d.id, 'approved')}>
            <Check size={12} /> Approve
          </button>
          <button className="btn btn-yellow" onClick={() => onAction(d.id, 'revised')}>
            <RefreshCw size={12} /> Revise
          </button>
          <button className="btn btn-ghost" onClick={() => onAction(d.id, 'parked')}>
            <Pause size={12} /> Park
          </button>
          <button className="btn btn-red" onClick={() => onAction(d.id, 'killed')}>
            <X size={12} /> Kill
          </button>
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: 2 }}>
        {label}
      </div>
      <div className="mono" style={{ fontSize: 16, fontWeight: 700, color: color ?? 'var(--text)' }}>
        {value}
      </div>
    </div>
  );
}
