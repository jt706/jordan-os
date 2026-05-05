'use client';

// Client view for the Integrations page. Shows the connection state for each
// provider and lets Jordan kick off OAuth or disconnect.
//
// Note: the DB row is still keyed `google_calendar` (historical reasons) but
// the OAuth scope set now covers Calendar + Tasks + Gmail drafts. Treat the
// card as "Google" — one connection, multiple capabilities.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CheckCircle2, AlertTriangle, Plug, RefreshCw, Cloud, CheckSquare, Mail, MailSearch, Calendar } from 'lucide-react';

interface IntegrationRow {
  id: string;
  provider: string;
  status: 'connected' | 'disconnected' | 'expired' | 'error';
  account_email: string | null;
  scopes: string | null;
  last_error: string | null;
  last_sync_at: string | null;
}

export default function IntegrationsView({
  integrations,
  hasGoogleCreds,
  flash,
  migrationApplied,
}: {
  integrations: IntegrationRow[];
  hasGoogleCreds: boolean;
  flash: { google: string | null; reason: string | null };
  migrationApplied: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const google = integrations.find((i) => i.provider === 'google_calendar');

  async function disconnect(provider: string) {
    if (!confirm(`Disconnect ${provider.replace('_', ' ')}? Hermes will no longer have access.`)) return;
    setBusy(true);
    try {
      await fetch(`/api/integrations/${provider}/disconnect`, { method: 'POST' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 720 }}>
      <div className="animate-fade-up" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 4 }}>
          Integrations
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          Tools Hermes can read from on your behalf. Nothing happens autonomously.
        </p>
      </div>

      {/* Flash messages from the OAuth callback */}
      {flash.google === 'connected' && (
        <FlashCard tone="green">
          <CheckCircle2 size={14} /> Google connected. Calendar, Tasks, and Gmail drafts are now wired.
        </FlashCard>
      )}
      {flash.google === 'error' && (
        <FlashCard tone="red">
          <AlertTriangle size={14} /> Google connection failed{flash.reason ? `: ${flash.reason.replace(/_/g, ' ')}` : '.'}
        </FlashCard>
      )}
      {!migrationApplied && (
        <FlashCard tone="yellow">
          <AlertTriangle size={14} /> The integrations table isn&apos;t in Supabase yet. Apply <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>supabase/migrations/0002_integrations.sql</code> in the SQL editor.
        </FlashCard>
      )}

      {/* Google card — Calendar + Tasks + Gmail drafts (one OAuth connection) */}
      <div className="card animate-fade-up delay-1" style={{ padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Cloud size={20} color="var(--accent)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Google</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              One connection, four capabilities. Hermes can read and write events, manage tasks, search and read your inbox, and stage email drafts. Sending is blocked at the OAuth scope.
            </div>
          </div>
          <StatusPill row={google} />
        </div>

        {/* Capability chips — what this connection gives Hermes */}
        <div style={{ padding: '0 20px 14px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <CapabilityChip icon={<Calendar size={11} />} label="Calendar" detail="read + write events" />
          <CapabilityChip icon={<CheckSquare size={11} />} label="Tasks" detail="read + write tasks" />
          <CapabilityChip icon={<MailSearch size={11} />} label="Gmail Read" detail="search + read inbox" />
          <CapabilityChip icon={<Mail size={11} />} label="Gmail Drafts" detail="compose only — cannot send" />
        </div>

        {!hasGoogleCreds ? (
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text)' }}>Setup needed.</strong> Add{' '}
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>GOOGLE_CLIENT_ID</code> and{' '}
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>GOOGLE_CLIENT_SECRET</code> to your{' '}
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>.env.local</code> file, then restart the dev server. Instructions are in chat.
          </div>
        ) : google && google.status === 'connected' ? (
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Connected as <strong style={{ color: 'var(--text)' }}>{google.account_email ?? 'unknown account'}</strong>
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <a href="/api/integrations/google/start" className="btn btn-ghost" style={{ fontSize: 12 }}>
                <RefreshCw size={12} /> Reconnect
              </a>
              <button onClick={() => disconnect('google_calendar')} className="btn btn-red" disabled={busy} style={{ fontSize: 12 }}>
                Disconnect
              </button>
            </div>
          </div>
        ) : (
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Not connected. Click below and approve on Google&apos;s consent screen.
            </span>
            <a href="/api/integrations/google/start" className="btn btn-cyan" style={{ marginLeft: 'auto', fontSize: 12 }}>
              <Plug size={12} /> Connect Google
            </a>
          </div>
        )}
      </div>

      {/* Reconnect prompt if any of the current capabilities are missing from the grant */}
      {google && google.status === 'connected' && google.scopes && (
        (() => {
          const missing: string[] = [];
          if (!google.scopes.includes('tasks'))         missing.push('Tasks');
          if (!google.scopes.includes('gmail.compose')) missing.push('Drafts');
          if (!google.scopes.includes('gmail.readonly'))missing.push('Gmail Read');
          if (missing.length === 0) return null;
          return (
            <FlashCard tone="yellow">
              <AlertTriangle size={14} /> Reconnect needed to enable: <strong>{missing.join(', ')}</strong>. Click <strong>Reconnect</strong> on the card above.
            </FlashCard>
          );
        })()
      )}

      {/* Coming soon placeholders */}
      <div className="animate-fade-up delay-2" style={{ marginTop: 16 }}>
        <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
          Coming soon
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ComingSoonRow name="Apple Reminders" note="No public API — needs a local Mac helper or migration to a different task app." />
          <ComingSoonRow name="Stripe / Banking" note="For Money page. Requires production-grade encryption first." />
        </div>
      </div>
    </div>
  );
}

function CapabilityChip({ icon, label, detail }: { icon: React.ReactNode; label: string; detail: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 6,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
      }}
      title={detail}
    >
      <span style={{ color: 'var(--accent)', display: 'flex' }}>{icon}</span>
      <span style={{ color: 'var(--text)', fontWeight: 600 }}>{label}</span>
      <span style={{ color: 'var(--text-dim)' }}>· {detail}</span>
    </div>
  );
}

function StatusPill({ row }: { row: IntegrationRow | undefined }) {
  if (!row || row.status === 'disconnected') {
    return <span className="badge" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)', border: '1px solid var(--border)' }}>Not connected</span>;
  }
  if (row.status === 'connected') {
    return <span className="badge" style={{ background: 'rgba(34,211,160,0.1)', color: 'var(--green)' }}>Connected</span>;
  }
  if (row.status === 'expired') {
    return <span className="badge" style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--yellow)' }}>Reconnect needed</span>;
  }
  return <span className="badge" style={{ background: 'rgba(244,63,94,0.1)', color: 'var(--red)' }}>Error</span>;
}

function FlashCard({ tone, children }: { tone: 'green' | 'red' | 'yellow'; children: React.ReactNode }) {
  const map = {
    green:  { bg: 'rgba(34,211,160,0.07)', border: 'rgba(34,211,160,0.2)',  color: 'var(--green)' },
    red:    { bg: 'rgba(244,63,94,0.07)',  border: 'rgba(244,63,94,0.2)',   color: 'var(--red)' },
    yellow: { bg: 'rgba(245,158,11,0.07)', border: 'rgba(245,158,11,0.2)',  color: 'var(--yellow)' },
  }[tone];
  return (
    <div
      style={{
        background: map.bg,
        border: `1px solid ${map.border}`,
        color: map.color,
        borderRadius: 10,
        padding: '10px 14px',
        fontSize: 13,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  );
}

function ComingSoonRow({ name, note }: { name: string; note: string }) {
  return (
    <div className="card" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, opacity: 0.6 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{name}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{note}</div>
      </div>
      <span className="badge" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)', border: '1px solid var(--border)' }}>Coming soon</span>
    </div>
  );
}
