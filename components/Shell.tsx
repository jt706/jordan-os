'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  SquaresFour,
  ChatCircleDots,
  GitBranch,
  Lightning,
  Robot,
  CreditCard,
  Trophy,
  Lightbulb,
  CurrencyDollar,
  Terminal,
  PlugsConnected,
  Gear,
} from '@phosphor-icons/react';

const navItems = [
  { href: '/',              label: 'Dashboard',     icon: SquaresFour },
  { href: '/chat',          label: 'CEO Agent',     icon: ChatCircleDots },
  { href: '/threads',       label: 'Threads',       icon: GitBranch },
  { href: '/decisions',     label: 'Decisions',     icon: Lightning },
  { href: '/agents',        label: 'Agents',        icon: Robot },
  { href: '/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { href: '/achievements',  label: 'Achievements',  icon: Trophy },
  { href: '/ideas',         label: 'Ideas',         icon: Lightbulb },
  { href: '/money',         label: 'Money',         icon: CurrencyDollar },
  { href: '/execution',     label: 'Execution',     icon: Terminal },
  { href: '/integrations',  label: 'Integrations',  icon: PlugsConnected },
  { href: '/settings',      label: 'Settings',      icon: Gear },
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
          width: 220,
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
        {/* ── Logo block ── */}
        <div style={{ padding: '14px 10px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            {/* JT monogram — bold isometric-inspired box */}
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #7c3aed 0%, #c2ff00 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'var(--font-mono)',
                fontSize: 14,
                fontWeight: 700,
                color: '#0d0520',
                letterSpacing: '-0.03em',
                flexShrink: 0,
                boxShadow: '0 4px 16px rgba(124,58,237,0.4)',
              }}
            >
              JT
            </div>
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 16,
                  fontWeight: 700,
                  color: 'var(--text)',
                  letterSpacing: '-0.04em',
                  lineHeight: 1.1,
                }}
              >
                JT OS
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  color: 'var(--text-muted)',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginTop: 2,
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
              gap: 6,
              background: 'rgba(194,255,0,0.07)',
              border: '1px solid rgba(194,255,0,0.18)',
              borderRadius: 8,
              padding: '3px 10px',
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
              fontWeight: 700,
            }}>
              v0.1 · ALPHA
            </span>
          </div>
        </div>

        {/* ── Nav label ── */}
        <div style={{
          padding: '0 10px 8px',
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          color: 'var(--text-dim)',
          letterSpacing: '0.12em',
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
              <Icon
                size={17}
                weight={isActive ? 'fill' : 'regular'}
              />
              {item.label}
              {item.href === '/decisions' && badges.decisions > 0 && (
                <span style={{
                  marginLeft: 'auto',
                  background: 'rgba(255,68,102,0.15)',
                  color: 'var(--red)',
                  fontSize: 9,
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 6px',
                  borderRadius: 6,
                  fontWeight: 700,
                }}>
                  {badges.decisions}
                </span>
              )}
              {item.href === '/execution' && badges.execution > 0 && (
                <span style={{
                  marginLeft: 'auto',
                  background: 'rgba(255,170,0,0.15)',
                  color: 'var(--yellow)',
                  fontSize: 9,
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 6px',
                  borderRadius: 6,
                  fontWeight: 700,
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
            marginBottom: 14,
          }} />
          {/* Status card */}
          <div style={{
            background: 'rgba(194,255,0,0.05)',
            border: '1px solid rgba(194,255,0,0.12)',
            borderRadius: 10,
            padding: '8px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}>
            <div className="pulse-online" />
            <div>
              <div style={{ fontSize: 11, color: 'var(--text)', fontWeight: 600, lineHeight: 1.2 }}>
                CEO Agent
              </div>
              <div style={{ fontSize: 9, color: 'var(--accent)', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
                ONLINE
              </div>
            </div>
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
        {/* Subtle dot grid overlay */}
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(124,58,237,0.2) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          pointerEvents: 'none',
          zIndex: 0,
        }} />
        <div style={{ flex: 1, paddingBottom: 80, position: 'relative', zIndex: 1 }} className="md:pb-0">
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
          background: 'rgba(13,5,32,0.94)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
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
              <Icon size={22} weight={isActive ? 'fill' : 'regular'} />
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
          <Gear size={22} weight={pathname === '/settings' ? 'fill' : 'regular'} />
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
