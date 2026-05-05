'use client';

import { useState } from 'react';
import { Save, Shield, Bot, Bell, Palette, Database } from 'lucide-react';

const sections = [
  {
    id: 'identity',
    label: 'Identity',
    icon: Bot,
    fields: [
      { id: 'name', label: 'Your Name', type: 'text', value: 'JT', description: 'Used in CEO Agent greetings' },
      { id: 'org', label: 'Organisation Name', type: 'text', value: 'JT OS', description: 'Displayed in sidebar header' },
      { id: 'timezone', label: 'Timezone', type: 'text', value: 'Pacific/Auckland', description: 'Used for scheduling and timestamps' },
    ],
  },
  {
    id: 'ai',
    label: 'AI Models',
    icon: Bot,
    fields: [
      { id: 'primaryModel', label: 'Primary CEO Agent Model', type: 'select', value: 'claude-3-7-sonnet', options: ['claude-3-7-sonnet', 'claude-opus-4-5', 'gpt-4o', 'gpt-4o-mini'], description: 'Model powering the CEO Agent' },
      { id: 'fallbackModel', label: 'Fallback Model', type: 'select', value: 'gpt-4o-mini', options: ['gpt-4o-mini', 'claude-3-haiku', 'ollama/llama3'], description: 'Used when primary model is unavailable' },
      { id: 'localModel', label: 'Local Ollama Model', type: 'text', value: 'llama3:70b', description: 'For zero-cost non-critical tasks' },
    ],
  },
  {
    id: 'safety',
    label: 'Safety & Autonomy',
    icon: Shield,
    toggles: [
      { id: 'requireApproval', label: 'Require approval for all executions', value: true, description: 'JT must approve before Hermes or any agent acts' },
      { id: 'noRealWorld', label: 'Block autonomous real-world actions (v0.1)', value: true, description: 'No emails sent, no forms submitted, no purchases made without approval', locked: true },
      { id: 'highRiskAlert', label: 'Alert on high-risk decisions', value: true, description: 'CEO Agent flags decisions with risk > medium' },
      { id: 'autoKill', label: 'Auto-bench agents with negative ROI for 60+ days', value: false, description: 'Automatically bench underperforming agents' },
    ],
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: Bell,
    toggles: [
      { id: 'pendingDecisions', label: 'Daily decision brief from CEO Agent', value: true },
      { id: 'renewalAlerts', label: 'Subscription renewal alerts (7 days out)', value: true },
      { id: 'agentAlerts', label: 'Agent status change alerts', value: false },
      { id: 'achievementNotifs', label: 'Achievement unlocked notifications', value: true },
    ],
  },
  {
    id: 'appearance',
    label: 'Appearance',
    icon: Palette,
    toggles: [
      { id: 'darkMode', label: 'Dark mode', value: true, locked: true, description: 'Always on in v0.1' },
      { id: 'animations', label: 'Enable animations', value: true },
      { id: 'compactMode', label: 'Compact card view', value: false },
    ],
  },
];

export default function SettingsPage() {
  const [saved, setSaved] = useState(false);
  const [toggles, setToggles] = useState<Record<string, boolean>>({
    requireApproval: true,
    noRealWorld: true,
    highRiskAlert: true,
    autoKill: false,
    pendingDecisions: true,
    renewalAlerts: true,
    agentAlerts: false,
    achievementNotifs: true,
    darkMode: true,
    animations: true,
    compactMode: false,
  });

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ padding: 24, maxWidth: 700 }}>
      <div className="animate-fade-up" style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 4 }}>
          Settings
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
          JT OS v0.1 configuration
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {sections.map((section, si) => {
          const Icon = section.icon;
          return (
            <div
              key={section.id}
              className={`card animate-fade-up delay-${Math.min(si + 1, 8)}`}
              style={{ overflow: 'hidden' }}
            >
              <div
                style={{
                  padding: '14px 16px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <Icon size={14} color="var(--accent)" />
                <span style={{ fontWeight: 700, fontSize: 14 }}>{section.label}</span>
              </div>
              <div style={{ padding: '8px 0' }}>
                {'fields' in section &&
                  section.fields?.map((field) => (
                    <div key={field.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', display: 'block', marginBottom: 4 }}>
                        {field.label}
                      </label>
                      {field.description && (
                        <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 6 }}>{field.description}</div>
                      )}
                      {field.type === 'select' ? (
                        <select
                          defaultValue={field.value}
                          style={{
                            background: 'var(--bg-elevated)',
                            border: '1px solid var(--border)',
                            borderRadius: 8,
                            color: 'var(--text)',
                            padding: '7px 12px',
                            fontSize: 13,
                            fontFamily: 'var(--font-mono)',
                            outline: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          {field.options?.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="input"
                          type="text"
                          defaultValue={field.value}
                          style={{ fontFamily: 'var(--font-mono)', maxWidth: 320 }}
                        />
                      )}
                    </div>
                  ))}
                {'toggles' in section &&
                  section.toggles?.map((toggle, ti) => (
                    <div
                      key={toggle.id}
                      style={{
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        borderBottom: ti < (section.toggles?.length ?? 0) - 1 ? '1px solid var(--border-subtle)' : 'none',
                        opacity: toggle.locked ? 0.7 : 1,
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: toggle.description ? 2 : 0 }}>
                          {toggle.label}
                          {toggle.locked && (
                            <span className="badge" style={{ background: 'rgba(0,200,255,0.1)', color: 'var(--accent)', fontSize: 9, marginLeft: 6 }}>
                              LOCKED
                            </span>
                          )}
                        </div>
                        {toggle.description && (
                          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{toggle.description}</div>
                        )}
                      </div>
                      <button
                        disabled={toggle.locked}
                        onClick={() => !toggle.locked && setToggles((prev) => ({ ...prev, [toggle.id]: !prev[toggle.id] }))}
                        style={{
                          width: 44,
                          height: 24,
                          borderRadius: 12,
                          border: 'none',
                          background: toggles[toggle.id] ? 'var(--accent)' : 'var(--bg-elevated)',
                          cursor: toggle.locked ? 'not-allowed' : 'pointer',
                          position: 'relative',
                          transition: 'background 0.2s',
                          flexShrink: 0,
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            top: 3,
                            left: toggles[toggle.id] ? 23 : 3,
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            background: 'white',
                            transition: 'left 0.2s',
                          }}
                        />
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          );
        })}

        {/* Version info */}
        <div className="card animate-fade-up delay-6" style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Database size={14} color="var(--text-dim)" />
            <span style={{ fontWeight: 700, fontSize: 14 }}>System Info</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              { label: 'Version', value: 'v0.1.0' },
              { label: 'Database', value: 'Mock (Supabase coming)' },
              { label: 'Framework', value: 'Next.js 15 + TypeScript' },
              { label: 'Styling', value: 'Tailwind + Custom CSS' },
              { label: 'Agent Runtime', value: 'Claude + GPT-4o' },
              { label: 'Execution Layer', value: 'Hermes v0.1 (mock)' },
            ].map((info) => (
              <div key={info.label}>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: 2 }}>
                  {info.label}
                </div>
                <div className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{info.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Save button */}
        <button
          className="btn btn-cyan animate-fade-up delay-7"
          style={{ alignSelf: 'flex-start', padding: '10px 24px', fontSize: 14 }}
          onClick={handleSave}
        >
          <Save size={14} />
          {saved ? '✓ Saved' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
