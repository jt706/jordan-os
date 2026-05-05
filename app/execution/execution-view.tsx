'use client';

// Client view for the Execution Hub. Renders Hermes' action queue grouped by
// status (pending approval → recent). Approve/Cancel buttons hit the API and
// refresh the server data.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Check, X, Clock, Activity, Shield, CheckCircle2, AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react';
import { POLICIES, type ActionKind } from '@/lib/hermes/policy';
import type { ActionRow, ActionStatus } from '@/lib/hermes';

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const statusMeta: Record<ActionStatus, { label: string; bg: string; color: string }> = {
  pending_approval: { label: 'Pending approval', bg: 'rgba(245,158,11,0.1)',  color: 'var(--yellow)' },
  queued:           { label: 'Queued',            bg: 'rgba(34,211,160,0.07)', color: 'var(--green)' },
  running:          { label: 'Running',           bg: 'rgba(59,130,246,0.1)',  color: '#60a5fa' },
  completed:        { label: 'Completed',         bg: 'rgba(34,211,160,0.1)',  color: 'var(--green)' },
  failed:           { label: 'Failed',            bg: 'rgba(244,63,94,0.1)',   color: 'var(--red)' },
  cancelled:        { label: 'Cancelled',         bg: 'var(--bg-elevated)',    color: 'var(--text-dim)' },
};

export default function ExecutionView({ actions }: { actions: ActionRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const pending = actions.filter((a) => a.status === 'pending_approval');
  const recent = actions.filter((a) => a.status !== 'pending_approval');

  async function approve(id: string) {
    setBusy(id);
    try {
      await fetch(`/api/actions/${id}/approve`, { method: 'POST' });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function cancel(id: string) {
    if (!confirm('Cancel this action? This cannot be undone.')) return;
    setBusy(id);
    try {
      await fetch(`/api/actions/${id}/cancel`, { method: 'POST' });
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div className="animate-fade-up" style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-end', gap: 12 }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 4 }}>
            Execution Hub
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
            Hermes&apos; action queue. Every side-effect — calendar events, future tasks and emails — flows through here.
          </p>
        </div>
        <button onClick={() => router.refresh()} className="btn btn-ghost" style={{ fontSize: 12 }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Status banner */}
      <div
        className="animate-fade-up delay-1"
        style={{
          background: pending.length > 0 ? 'rgba(245,158,11,0.07)' : 'rgba(34,211,160,0.07)',
          border: `1px solid ${pending.length > 0 ? 'rgba(245,158,11,0.2)' : 'rgba(34,211,160,0.2)'}`,
          borderRadius: 10,
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 20,
          fontSize: 13,
          color: pending.length > 0 ? 'var(--yellow)' : 'var(--green)',
        }}
      >
        <Shield size={14} />
        <strong>{pending.length > 0 ? `${pending.length} action${pending.length === 1 ? '' : 's'} awaiting approval` : 'Queue clear'}</strong>
        <span style={{ color: 'var(--text-muted)', marginLeft: 4 }}>
          · Hermes auto-executes low-risk actions; material actions queue for your review.
        </span>
      </div>

      {/* Pending approvals */}
      {pending.length > 0 && (
        <div className="animate-fade-up delay-2" style={{ marginBottom: 24 }}>
          <SectionHeader label={`Pending approval (${pending.length})`} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pending.map((a) => (
              <PendingCard
                key={a.id}
                action={a}
                busy={busy === a.id}
                onApprove={() => approve(a.id)}
                onCancel={() => cancel(a.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recent */}
      <div className="animate-fade-up delay-3">
        <SectionHeader label={`Recent (${recent.length})`} />
        {recent.length === 0 ? (
          <div className="card" style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
            No actions yet. Ask the Bellion to schedule something and it&apos;ll show up here.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recent.map((a) => (
              <RecentRow key={a.id} action={a} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
      {label}
    </div>
  );
}

function PendingCard({
  action,
  busy,
  onApprove,
  onCancel,
}: {
  action: ActionRow;
  busy: boolean;
  onApprove: () => void;
  onCancel: () => void;
}) {
  const policy = POLICIES[action.kind as ActionKind];
  const summary = policy?.summarize(action.payload) ?? action.kind;
  const description = policy?.description ?? action.kind;

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <AlertTriangle size={14} color="var(--yellow)" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{summary}</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
            {description} · {action.proposed_by} · {timeAgo(action.created_at)}
          </div>
        </div>
        <span className="badge" style={{ background: statusMeta.pending_approval.bg, color: statusMeta.pending_approval.color, flexShrink: 0 }}>
          {statusMeta.pending_approval.label}
        </span>
      </div>
      <div style={{ borderTop: '1px solid var(--border)', display: 'flex', gap: 8, padding: '10px 16px' }}>
        <button onClick={onApprove} disabled={busy} className="btn btn-green" style={{ flex: 1, fontSize: 12 }}>
          <Check size={12} /> {busy ? 'Approving…' : 'Approve & run'}
        </button>
        <button onClick={onCancel} disabled={busy} className="btn btn-red" style={{ flex: 1, fontSize: 12 }}>
          <X size={12} /> Cancel
        </button>
      </div>
    </div>
  );
}

function RecentRow({ action }: { action: ActionRow }) {
  const meta = statusMeta[action.status];
  const policy = POLICIES[action.kind as ActionKind];
  const summary = policy?.summarize(action.payload) ?? action.kind;

  // Calendar events have an htmlLink in the result
  const htmlLink = (() => {
    if (action.status !== 'completed' || !action.result || typeof action.result !== 'object') return null;
    const link = (action.result as { htmlLink?: unknown }).htmlLink;
    return typeof link === 'string' ? link : null;
  })();

  return (
    <div className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
      {action.status === 'completed' ? (
        <CheckCircle2 size={14} color="var(--green)" style={{ flexShrink: 0 }} />
      ) : action.status === 'failed' ? (
        <AlertTriangle size={14} color="var(--red)" style={{ flexShrink: 0 }} />
      ) : action.status === 'running' ? (
        <Activity size={14} color="#60a5fa" style={{ flexShrink: 0 }} />
      ) : (
        <Clock size={14} color="var(--text-dim)" style={{ flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {summary}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          {action.kind} · {action.proposed_by} · {timeAgo(action.completed_at ?? action.created_at)}
          {action.error ? ` · ${action.error}` : ''}
        </div>
      </div>
      {htmlLink && (
        <a href={htmlLink} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ fontSize: 11 }}>
          <ExternalLink size={11} /> Open
        </a>
      )}
      <span className="badge" style={{ background: meta.bg, color: meta.color, flexShrink: 0 }}>
        {meta.label}
      </span>
    </div>
  );
}
