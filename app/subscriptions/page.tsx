import { listSubscriptions } from '@/lib/data/queries';
import { Subscription } from '@/lib/types';
import { Lightbulb } from '@phosphor-icons/react/dist/ssr';

const usageColors = {
  low: { bg: 'rgba(244,63,94,0.1)', text: 'var(--red)' },
  medium: { bg: 'rgba(245,158,11,0.1)', text: 'var(--yellow)' },
  high: { bg: 'rgba(34,211,160,0.1)', text: 'var(--green)' },
};

function daysUntil(date: Date) {
  const diff = new Date(date).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

export default async function SubscriptionsPage() {
  const subs = await listSubscriptions();

  const totalMonthly = subs.reduce((s, sub) => s + sub.monthlyCost, 0);
  const toCancel = subs.filter((s) => s.valueScore < 5);
  const renewal7Days = subs.filter((s) => daysUntil(s.renewalDate) <= 7);

  return (
    <div style={{ padding: 24, maxWidth: 860 }}>
      <div className="animate-fade-up" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 4 }}>
          Subscription Log
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          Every subscription must justify its cost. No passengers.
        </p>
      </div>

      {/* Summary */}
      <div className="animate-fade-up delay-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, marginBottom: 24 }}>
        <div className="card" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>MONTHLY TOTAL</div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--red)' }}>${totalMonthly}</div>
        </div>
        <div className="card" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>ANNUAL COST</div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>${(totalMonthly * 12).toLocaleString()}</div>
        </div>
        <div className="card" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>CANCEL CANDIDATES</div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--yellow)' }}>{toCancel.length}</div>
        </div>
        <div className="card" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>RENEWING SOON</div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: renewal7Days.length > 0 ? 'var(--accent)' : 'var(--text)' }}>
            {renewal7Days.length}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
        {subs.map((sub, i) => (
          <SubscriptionCard key={sub.id} sub={sub} index={i} />
        ))}
      </div>
    </div>
  );
}

function SubscriptionCard({ sub, index }: { sub: Subscription; index: number }) {
  const days = daysUntil(sub.renewalDate);
  const uc = usageColors[sub.usage];
  const scoreColor = sub.valueScore >= 7 ? 'var(--green)' : sub.valueScore >= 5 ? 'var(--yellow)' : 'var(--red)';
  const isRenewingSoon = days <= 7;

  return (
    <div
      className={`card animate-fade-up delay-${Math.min(index + 2, 8)}`}
      style={{
        padding: '16px',
        borderColor: isRenewingSoon ? 'rgba(0,200,255,0.2)' : undefined,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            flexShrink: 0,
          }}
        >
          {sub.logoEmoji}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{sub.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{sub.provider}</div>
        </div>
        <div className="mono" style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', flexShrink: 0 }}>
          ${sub.monthlyCost}<span style={{ fontSize: 10, color: 'var(--text-dim)' }}>/mo</span>
        </div>
      </div>

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: 3 }}>Usage</div>
          <span className="badge" style={{ background: uc.bg, color: uc.text }}>{sub.usage.toUpperCase()}</span>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: 3 }}>Value Score</div>
          <div className="mono" style={{ fontSize: 14, fontWeight: 700, color: scoreColor }}>
            {sub.valueScore.toFixed(1)}<span style={{ fontSize: 10, color: 'var(--text-dim)' }}>/10</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: 3 }}>Category</div>
          <span className="badge" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)', fontSize: 10 }}>
            {sub.category}
          </span>
        </div>
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: 3 }}>Renewal</div>
          <div className="mono" style={{ fontSize: 12, fontWeight: 600, color: isRenewingSoon ? 'var(--accent)' : 'var(--text-muted)' }}>
            {days <= 0 ? 'Today' : `${days}d`}
          </div>
        </div>
      </div>

      {/* Score bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ height: 3, background: 'var(--bg-elevated)', borderRadius: 2 }}>
          <div
            style={{
              height: '100%',
              width: `${sub.valueScore * 10}%`,
              background: scoreColor,
              borderRadius: 2,
              transition: 'width 0.4s ease',
            }}
          />
        </div>
      </div>

      {/* Recommendation */}
      <div
        style={{
          fontSize: 12,
          color: 'var(--text-muted)',
          lineHeight: 1.5,
          borderTop: '1px solid var(--border)',
          paddingTop: 10,
        }}
      >
        <Lightbulb size={13} weight="fill" color="var(--yellow)" style={{ display: 'inline', verticalAlign: 'middle', marginRight: 5 }} />
        {sub.recommendation}
      </div>
    </div>
  );
}
