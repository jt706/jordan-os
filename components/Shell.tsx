'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  MessageSquare,
  GitBranch,
  Zap,
  Bot,
  CreditCard,
  Trophy,
  Lightbulb,
  DollarSign,
  Terminal,
  Plug,
  Settings,
} from 'lucide-react';

const navItems = [
  { href: '/',              label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/chat',          label: 'CEO Agent',    icon: MessageSquare },
  { href: '/threads',       label: 'Threads',      icon: GitBranch },
  { href: '/decisions',     label: 'Decisions',    icon: Zap },
  { href: '/agents',        label: 'Agents',       icon: Bot },
  { href: '/subscriptions', label: 'Subscriptions',icon: CreditCard },
  { href: '/achievements',  label: 'Achievements', icon: Trophy },
  { href: '/ideas',         label: 'Ideas',        icon: Lightbulb },
  { href: '/money',         label: 'Money',        icon: DollarSign },
  { href: '/execution',     label: 'Execution',    icon: Terminal },
  { href: '/integrations',  label: 'Integrations', icon: Plug },
  { href: '/settings',      label: 'Settings',     icon: Settings },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [badges, setBadges] = useState<{ decisions: number; execution: number }>({
    decisions: 0,
    execution: 0,
  });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/badges', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setBadges({
            decisions: Number(data.decisions ?? 0),
            execution: Number(data.execution ?? 0),
          });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [pathname]);

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden' }}>

      {/* ── Desktop Sidebar ── */}
      <aside
        style={{
          width: 216,
          flexShrink: 0,
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          padding: '12px 8px 12px',
          gap: 2,
          overflowY: 'auto',
        }}
        className="hidden md:flex"
      >
        {/* ── JT OS Logo ── */}
        <div style={{ padding: '12px 10px 20px' }}>
          {/* Monogram + wordmark */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            {/* JT monogram */}
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                background: 'linear-gradient(135deg, rgba(124,58,237,0.3), rgba(194,255,0,0.1))',
                border: '1px solid rgba(124,58,237,0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--accent)',
                letterSpacing: '-0.02em',
                flexShrink: 0,
              }}
            >
              JT
            </div>
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 15,
                  fontWeight: 700,
                  color: 'var(--text)',
                  letterSpacing: '-0.03em',
                  lineHeight: 1.1,
                }}
              >
                JT OS
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  color: 'var(--text-dim)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  marginTop: 1,
                }}
              >
                Mission Control
              </div>
            </div>
          </div>

          {/* Version pill */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              background: 'rgba(194,255,0,0.07)',
              border: '1px solid rgba(194,255,0,0.15)',
              borderRadius: 6,
              padding: '2px 8px',
            }}
          >
            <div style={{
              width: 5, height: 5, borderRadius: '50%',
              background: 'var(--accent)',
              boxShadow: '0 0 8px var(--accent)',
            }} />
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: 'var(--accent)',
              letterSpacing: '0.06em',
              fontWeight: 500,
            }}>
              v0.1 · ALPHA
            </span>
          </div>
        </div>

        {/* ── Nav label ── */}
        <div style={{
          padding: '0 10px 6px',
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: 'var(--text-dim)',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
        }}>
          Navigate
        </div>

        {/* ── Nav items ── */}
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} className={`nav-item ${isActive ? 'active' : ''}`}>
              <Icon size={15} strokeWidth={isActive ? 2.5 : 1.8} />
              {item.label}
              {item.href === '/decisions' && badges.decisions > 0 && (
                <span style={{
                  marginLeft: 'auto',
                  background: 'rgba(255,68,102,0.12)',
                  color: 'var(--red)',
                  fontSize: 9,
                  fontFamily: 'var(--font-mono)',
                  padding: '1px 5px',
                  borderRadius: 5,
                  fontWeight: 600,
                }}>
                  {badges.decisions}
                </span>
              )}
              {item.href === '/execution' && badges.execution > 0 && (
                <span style={{
                  marginLeft: 'auto',
                  background: 'rgba(245,166,35,0.12)',
                  color: 'var(--yellow)',
                  fontSize: 9,
                  fontFamily: 'var(--font-mono)',
                  padding: '1px 5px',
                  borderRadius: 5,
                  fontWeight: 600,
                }}>
                  {badges.execution}
                </span>
              )}
            </Link>
          );
        })}

        {/* ── Bottom status ── */}
        <div style={{ marginTop: 'auto', padding: '16px 10px 4px' }}>
          <div style={{
            height: 1,
            background: 'linear-gradient(90deg, transparent, var(--border-bright), transparent)',
            marginBottom: 12,
          }} />
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 4px',
          }}>
            <div className="pulse-online" />
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>
              CEO Agent online
            </span>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main style={{
        flex: 1,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        background: 'var(--bg)',
      }}>
        <div style={{ flex: 1, paddingBottom: 80 }} className="md:pb-0">
          {children}
        </div>
      </main>

      {/* ── Mobile Bottom Nav ── */}
      <nav
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'rgba(8,8,16,0.92)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          justifyContent: 'space-around',
          padding: '8px 0 max(8px, env(safe-area-inset-bottom))',
          zIndex: 50,
        }}
        className="md:hidden"
      >
        {navItems.slice(0, 6).map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 3,
                padding: '4px 8px',
                color: isActive ? 'var(--accent)' : 'var(--text-dim)',
                textDecoration: 'none',
                transition: 'color 0.15s',
                minWidth: 44,
              }}
            >
              <Icon size={20} strokeWidth={isActive ? 2.5 : 1.5} />
              <span style={{
                fontSize: 9,
                fontWeight: isActive ? 700 : 400,
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}>
                {item.label.split(' ')[0]}
              </span>
            </Link>
          );
        })}
        <Link
          href="/settings"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
            padding: '4px 8px',
            color: pathname === '/settings' ? 'var(--accent)' : 'var(--text-dim)',
            textDecoration: 'none',
            transition: 'color 0.15s',
            minWidth: 44,
          }}
        >
          <Settings size={20} strokeWidth={pathname === '/settings' ? 2.5 : 1.5} />
          <span style={{
            fontSize: 9,
            fontWeight: 400,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}>
            More
          </span>
        </Link>
      </nav>
    </div>
  );
}
