import { listIdeas } from '@/lib/data/queries';
import { Idea, IdeaStage } from '@/lib/types';
import { Lightbulb, TrendingUp, DollarSign, ArrowRight } from 'lucide-react';

const stageConfig: Record<IdeaStage, { label: string; bg: string; text: string }> = {
  raw: { label: 'Raw', bg: 'rgba(100,116,139,0.15)', text: 'var(--text-muted)' },
  validated: { label: 'Validated', bg: 'rgba(0,200,255,0.1)', text: 'var(--accent)' },
  'in-progress': { label: 'In Progress', bg: 'rgba(168,85,247,0.1)', text: 'var(--accent2)' },
  paused: { label: 'Paused', bg: 'rgba(245,158,11,0.1)', text: 'var(--yellow)' },
  shipped: { label: 'Shipped', bg: 'rgba(34,211,160,0.1)', text: 'var(--green)' },
  killed: { label: 'Killed', bg: 'rgba(244,63,94,0.1)', text: 'var(--red)' },
};

function getScoreColor(score: number) {
  if (score >= 75) return 'var(--green)';
  if (score >= 55) return 'var(--yellow)';
  return 'var(--red)';
}

export default async function IdeasPage() {
  const ideas = await listIdeas();
  const sorted = [...ideas].sort((a, b) => b.opportunityScore - a.opportunityScore);

  return (
    <div style={{ padding: 24, maxWidth: 860 }}>
      <div className="animate-fade-up" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 4 }}>
          Business Idea Pipeline
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          Ranked by opportunity score. Every idea has a recommended path.
        </p>
      </div>

      {/* Stage legend */}
      <div className="animate-fade-up delay-1" style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {Object.entries(stageConfig).map(([stage, config]) => {
          const count = ideas.filter((i) => i.stage === stage).length;
          return count > 0 ? (
            <span
              key={stage}
              className="badge"
              style={{ background: config.bg, color: config.text, fontSize: 11 }}
            >
              {config.label} ({count})
            </span>
          ) : null;
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sorted.map((idea, i) => (
          <IdeaCard key={idea.id} idea={idea} index={i} rank={i + 1} />
        ))}
      </div>
    </div>
  );
}

function IdeaCard({ idea, index, rank }: { idea: Idea; index: number; rank: number }) {
  const sc = stageConfig[idea.stage];
  const scoreColor = getScoreColor(idea.opportunityScore);

  return (
    <div
      className={`card animate-fade-up delay-${Math.min(index + 2, 8)}`}
      style={{ padding: '18px 20px' }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
        <div
          className="mono"
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: rank <= 3 ? 'var(--accent)' : 'var(--text-dim)',
            width: 28,
            flexShrink: 0,
            lineHeight: 1,
          }}
        >
          {rank}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{idea.title}</h3>
            <span className="badge" style={{ background: sc.bg, color: sc.text }}>{sc.label}</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{idea.summary}</p>
        </div>
      </div>

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 12 }}>
        <MetricBlock
          icon={<TrendingUp size={12} />}
          label="Opportunity Score"
          value={`${idea.opportunityScore}/100`}
          color={scoreColor}
          bar={idea.opportunityScore}
        />
        <MetricBlock
          icon={<DollarSign size={12} />}
          label="Capital Required"
          value={idea.capitalRequired === 0 ? '$0 — free' : `$${idea.capitalRequired.toLocaleString()}`}
          color={idea.capitalRequired === 0 ? 'var(--green)' : 'var(--text)'}
        />
        <div>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Lightbulb size={10} />
            Recommended Path
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{idea.recommendedPath}</div>
        </div>
      </div>

      {/* Tags */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {idea.tags.map((tag) => (
          <span key={tag} className="badge" style={{ background: 'var(--bg-elevated)', color: 'var(--text-dim)', border: '1px solid var(--border)', fontSize: 10 }}>
            {tag}
          </span>
        ))}
      </div>

      {/* Next action */}
      <div
        style={{
          borderTop: '1px solid var(--border)',
          paddingTop: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <ArrowRight size={13} color="var(--accent)" />
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>Next action:</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{idea.nextAction}</div>
      </div>
    </div>
  );
}

function MetricBlock({
  icon,
  label,
  value,
  color,
  bar,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  bar?: number;
}) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
        {icon}{label}
      </div>
      <div className="mono" style={{ fontSize: 15, fontWeight: 700, color, marginBottom: bar !== undefined ? 4 : 0 }}>{value}</div>
      {bar !== undefined && (
        <div style={{ height: 3, background: 'var(--bg-elevated)', borderRadius: 2 }}>
          <div style={{ height: '100%', width: `${bar}%`, background: color, borderRadius: 2 }} />
        </div>
      )}
    </div>
  );
}
