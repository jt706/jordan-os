import { listAchievements, listAgents } from '@/lib/data/queries';
import { Achievement, AchievementCategory } from '@/lib/types';
import {
  Trophy,
  CheckCircle,
  Clock,
  CurrencyDollar,
  Lightning,
  Flask,
  Target,
  Strategy,
  Leaf,
  Robot,
} from '@phosphor-icons/react/dist/ssr';
import type { Icon } from '@phosphor-icons/react';

const categoryConfig: Record<AchievementCategory, { bg: string; text: string; icon: Icon }> = {
  Revenue:      { bg: 'rgba(194,255,0,0.08)',   text: 'var(--green)',         icon: CurrencyDollar },
  Efficiency:   { bg: 'rgba(194,255,0,0.08)',   text: 'var(--accent)',        icon: Lightning },
  Innovation:   { bg: 'rgba(168,85,247,0.1)',   text: 'var(--accent2-bright)',icon: Flask },
  'Cost Saving':{ bg: 'rgba(255,170,0,0.08)',   text: 'var(--yellow)',        icon: Target },
  Strategic:    { bg: 'rgba(91,188,255,0.08)',  text: 'var(--blue)',          icon: Strategy },
  Community:    { bg: 'rgba(168,85,247,0.1)',   text: 'var(--accent2-bright)',icon: Leaf },
};

export default async function AchievementsPage() {
  const [achievements, agents] = await Promise.all([
    listAchievements(),
    listAgents(),
  ]);

  const totalValue = achievements.reduce((s, a) => s + a.valueCreated, 0);

  const agentContrib: Record<string, number> = {};
  achievements.forEach((a) => {
    const key = a.responsibleAgent;
    agentContrib[key] = (agentContrib[key] ?? 0) + a.valueCreated;
  });
  const leaderboard = Object.entries(agentContrib)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div style={{ padding: 24, maxWidth: 900 }}>
      <div className="animate-fade-up" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 4 }}>
          Achievements
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          What the org has delivered — tracked by agent and value created
        </p>
      </div>

      {/* Stats */}
      <div className="animate-fade-up delay-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 24 }}>
        <div className="card" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>TOTAL VALUE</div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--green)' }}>${totalValue.toLocaleString()}</div>
        </div>
        <div className="card" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>ACHIEVEMENTS</div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{achievements.length}</div>
        </div>
        <div className="card" style={{ padding: '14px 16px' }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>VERIFIED</div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>{achievements.filter((a) => a.verified).length}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
        {/* Achievement cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {achievements.map((ach, i) => (
            <AchievementCard key={ach.id} achievement={ach} index={i} />
          ))}
        </div>

        {/* Leaderboard */}
        <div>
          <div className="card animate-fade-up delay-2" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Trophy size={15} weight="fill" color="var(--yellow)" />
              <span style={{ fontWeight: 700, fontSize: 14 }}>Agent Leaderboard</span>
            </div>
            <div style={{ padding: '8px 0' }}>
              {leaderboard.map(([name, value], i) => {
                const agent = agents.find((a) =>
                  name.toLowerCase().includes(a.name.toLowerCase().split(' ')[0].toLowerCase())
                );
                return (
                  <div
                    key={name}
                    style={{
                      padding: '10px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      borderBottom: i < leaderboard.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                    }}
                  >
                    <div className="mono" style={{ width: 20, fontSize: 12, color: i === 0 ? 'var(--yellow)' : 'var(--text-dim)' }}>
                      #{i + 1}
                    </div>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                      background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Robot size={14} weight="fill" color="var(--accent2-bright)" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{name}</div>
                      <div style={{ height: 2, background: 'var(--bg-elevated)', borderRadius: 1, marginTop: 4 }}>
                        <div style={{
                          height: '100%',
                          width: `${(value / leaderboard[0][1]) * 100}%`,
                          background: i === 0 ? 'var(--yellow)' : 'var(--accent)',
                          borderRadius: 1,
                        }} />
                      </div>
                    </div>
                    <div className="mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--green)', flexShrink: 0 }}>
                      ${value.toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AchievementCard({ achievement: a, index }: { achievement: Achievement; index: number }) {
  const cc = categoryConfig[a.category];
  const IconComponent = cc.icon;
  return (
    <div
      className={`card animate-fade-up delay-${Math.min(index + 2, 8)}`}
      style={{ padding: '16px 18px', display: 'flex', gap: 14, alignItems: 'flex-start' }}
    >
      <div style={{
        width: 42, height: 42, borderRadius: 10, background: cc.bg, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `1px solid color-mix(in srgb, ${cc.text} 20%, transparent)`,
      }}>
        <IconComponent size={20} weight="fill" color={cc.text} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>{a.title}</span>
          {a.verified
            ? <CheckCircle size={13} weight="fill" color="var(--green)" />
            : <Clock size={13} weight="regular" color="var(--text-dim)" />
          }
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>{a.description}</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: 'var(--green)' }}>
            +${a.valueCreated.toLocaleString()}
          </div>
          <span className="badge" style={{ background: cc.bg, color: cc.text }}>{a.category}</span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>by {a.responsibleAgent}</span>
        </div>
      </div>
    </div>
  );
}
