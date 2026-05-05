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
  BookOpen,
} from '@phosphor-icons/react';

const navItems = [
  { href: '/',              label: 'Dashboard',     icon: SquaresFour },
  { href: '/chat',          label: 'Bellion',     icon: ChatCircleDots },
  { href: '/threads',       label: 'Threads',       icon: GitBranch },
  { href: '/decisions',     label: 'Decisions',     icon: Lightning },
  { href: '/agents',        label: 'Agents',        icon: Robot },
  { href: '/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { href: '/achievements',  label: 'Achievements',  icon: Trophy },
  { href: '/ideas',         label: 'Ideas',         icon: Lightbulb },
  { href: '/money',         label: 'Money',         icon: CurrencyDollar },
  { href: '/knowledge',     label: 'Knowledge',     icon: BookOpen },
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
        <div style={{ padding: '20px 12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 9,
              background: 'linear-gradient(135deg, #7c3aed 0%, #c2ff00 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 800, color: '#0d0520',
              letterSpacing: '-0.02em', flexShrink: 0,
              boxShadow: '0 2px 12px rgba(124,58,237,0.35)',
            }}>
              JT
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', letterSpacing: '-0.03em', lineHeight: 1.2 }}>
                JT OS
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1, fontWeight: 400 }}>
                Mission Control
              </div>
            </div>
          </div>
        </div>

        {/* ── Nav items ── */}
        <div style={{ padding: '4px 0', flex: 1 }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} className={`nav-item ${isActive ? 'active' : ''}`}>
                <Icon size={16} weight={isActive ? 'fill' : 'regular'} style={{ opacity: isActive ? 1 : 0.6 }} />
                {item.label}
                {item.href === '/decisions' && badges.decisions > 0 && (
                  <span style={{
                    marginLeft: 'auto', background: 'rgba(255,68,102,0.12)',
                    color: 'var(--red)', fontSize: 10, padding: '1px 6px',
                    borderRadius: 20, fontWeight: 600,
                  }}>
                    {badges.decisions}
                  </span>
                )}
                {item.href === '/execution' && badges.execution > 0 && (
                  <span style={{
                    marginLeft: 'auto', background: 'rgba(255,170,0,0.12)',
                    color: 'var(--yellow)', fontSize: 10, padding: '1px 6px',
                    borderRadius: 20, fontWeight: 600,
                  }}>
                    {badges.execution}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* ── Bottom status ── */}
        <div style={{ padding: '12px 12px 8px', borderTop: '1px solid var(--border)' }}>
          <Link href="/chat" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', textDecoration: 'none', borderRadius: 8, transition: 'background 0.15s' }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
              border: '1px solid rgba(124,58,237,0.5)',
              boxShadow: '0 0 10px rgba(124,58,237,0.35)',
              position: 'relative',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/bellion.png" alt="Bellion" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{
                position: 'absolute', bottom: 0, right: 0,
                width: 8, height: 8, borderRadius: '50%',
                background: 'var(--accent)', border: '1.5px solid var(--bg-surface)',
              }} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>Bellion</div>
              <div style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 400 }}>Grand Marshall</div>
            </div>
          </Link>
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
                fontSize: 10,
                fontWeight: isActive ? 600 : 400,
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
          <span style={{ fontSize: 10, fontWeight: 400 }}>More</span>
        </Link>
      </nav>
    </div>
  );
}
