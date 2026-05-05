import { listSubscriptions } from '@/lib/data/queries';
import { Minus, CurrencyDollar } from '@phosphor-icons/react/dist/ssr';

// Money page reads from the real `subscriptions` table only. Anything we
// can't compute from a real source (value created, ROI, monthly trend)
// has been removed — fake numbers distort decisions. When Hermes gets a
// billing-source integration (Stripe, bank feed, manual entry) the
// removed metrics can come back, sourced for real.

export const dynamic = 'force-dynamic';

const categoryColors: Record<string, string> = {
  'AI Models': 'var(--accent)',
  'Dev Tools': 'var(--accent2)',
  'AI Research': '#22d3a0',
  'Infrastructure': '#f59e0b',
  'Project Management': '#a78bfa',
  'Productivity': '#f43f5e',
  'AI Image': '#fb923c',
};

export default async function MoneyPage() {
  const subs = await listSubscriptions();

  const totalMonthlyCost = subs.reduce((s, sub) => s + sub.monthlyCost, 0);
  const annualCost = totalMonthlyCost * 12;

  // Cost by category — computed live from the rows we just read.
  const costsByCategory: Record<string, number> = {};
  for (const sub of subs) {
    costsByCategory[sub.category] = (costsByCategory[sub.category] ?? 0) + sub.monthlyCost;
  }

  return (
    <div style={{ padding: 24, maxWidth: 960 }}>
      <div className="animate-fade-up" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 4 }}>
          Cost Dashboard
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          Every dollar spent must create disproportionate value.
        </p>
      </div>

      {/* Empty state if no subscriptions tracked */}
      {subs.length === 0 && (
        <div
          className="card animate-fade-up delay-1"
          style={{ padding: 24, textAlign: 'center', marginBottom: 16 }}
        >
          <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}>
            <CurrencyDollar size={40} color="var(--text-dim)" weight="thin" />
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
            No subscriptions tracked yet.
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Add rows to the <code>subscriptions</code> table or build the manual entry UI.
          </div>
        </div>
      )}

      {subs.length > 0 && (
        <>
          {/* Key metrics — only the ones we can actually compute */}
          <div
            className="animate-fade-up delay-1"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 10,
              marginBottom: 24,
            }}
          >
            <div className="card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                MONTHLY COST
              </div>
              <div className="mono" style={{ fontSize: 24, fontWeight: 700, color: 'var(--red)' }}>
                ${totalMonthlyCost.toLocaleString()}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {subs.length} subscription{subs.length === 1 ? '' : 's'}
              </div>
            </div>
            <div className="card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                ANNUAL PROJECTION
              </div>
              <div className="mono" style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>
                ${annualCost.toLocaleString()}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                if nothing changes
              </div>
            </div>
            <div className="card" style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                AVG / SUBSCRIPTION
              </div>
              <div className="mono" style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>
                ${(totalMonthlyCost / subs.length).toFixed(0)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                per month
              </div>
            </div>
          </div>

          {/* By category */}
          <div className="card animate-fade-up delay-2" style={{ padding: '16px', marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12 }}>By Category</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(costsByCategory)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, cost]) => {
                  const pct = Math.round((cost / totalMonthlyCost) * 100);
                  const color = categoryColors[cat] ?? 'var(--text-muted)';
                  return (
                    <div key={cat}>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: 4,
                          fontSize: 12,
                          color: 'var(--text-muted)',
                        }}
                      >
                        <span style={{ color }}>{cat}</span>
                        <span className="mono" style={{ fontWeight: 600 }}>
                          ${cost} <span style={{ color: 'var(--text-dim)' }}>({pct}%)</span>
                        </span>
                      </div>
                      <div style={{ height: 3, background: 'var(--bg-elevated)', borderRadius: 2 }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Line items table */}
          <div className="card animate-fade-up delay-3">
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>
              All Line Items
            </div>
            <div>
              {[...subs]
                .sort((a, b) => b.monthlyCost - a.monthlyCost)
                .map((sub, i, arr) => {
                  // No real trend data — show a flat dash. Trend tracking
                  // requires snapshot history, which we don't have yet.
                  const TrendIcon = Minus;
                  const trendColor = 'var(--text-dim)';
                  return (
                    <div
                      key={sub.id}
                      style={{
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        borderBottom: i < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>
                          {sub.logoEmoji} {sub.name}
                        </div>
                        <span
                          className="badge"
                          style={{
                            background: 'var(--bg-elevated)',
                            color: 'var(--text-dim)',
                            border: '1px solid var(--border)',
                            fontSize: 10,
                          }}
                        >
                          {sub.category}
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: trendColor }}>
                        <TrendIcon size={13} />
                        <span className="mono" style={{ fontSize: 11 }}>—</span>
                      </div>
                      <div
                        className="mono"
                        style={{
                          fontSize: 15,
                          fontWeight: 700,
                          color: 'var(--text)',
                          textAlign: 'right',
                          minWidth: 60,
                        }}
                      >
                        ${sub.monthlyCost}
                        <span style={{ fontSize: 10, color: 'var(--text-dim)', fontWeight: 400 }}>/mo</span>
                      </div>
                    </div>
                  );
                })}
            </div>
            <div
              style={{
                padding: '12px 16px',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Total</span>
              <span className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--red)' }}>
                ${totalMonthlyCost.toLocaleString()}/mo
              </span>
            </div>
          </div>
        </>
      )}

      {/* Honest "what's not tracked" footer */}
      <div
        className="animate-fade-up delay-4"
        style={{
          marginTop: 16,
          padding: '12px 16px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          fontSize: 12,
          color: 'var(--text-muted)',
          lineHeight: 1.5,
        }}
      >
        <strong style={{ color: 'var(--text)' }}>Not yet tracked:</strong> AI API usage (Claude / OpenAI),
        ad spend, contractor costs, value created. When Hermes gets a billing-source integration these
        will appear here, sourced for real. No fabricated numbers.
      </div>

    </div>
  );
}
