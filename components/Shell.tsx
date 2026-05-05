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
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/chat', label: 'CEO Agent', icon: MessageSquare },
  { href: '/threads', label: 'Threads', icon: GitBranch },
  { href: '/decisions', label: 'Decisions', icon: Zap },
  { href: '/agents', label: 'Agents', icon: Bot },
  { href: '/subscriptions', label: 'Subscriptions', icon: CreditCard },
  { href: '/achievements', label: 'Achievements', icon: Trophy },
  { href: '/ideas', label: 'Ideas', icon: Lightbulb },
  { href: '/money', label: 'Money', icon: DollarSign },
  { href: '/execution', label: 'Execution', icon: Terminal },
  { href: '/integrations', label: 'Integrations', icon: Plug },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [badges, setBadges] = useState<{ decisions: number; execution: number }>({
    decisions: 0,
    execution: 0,
  });

  // Pull live counts on mount and whenever the route changes — cheap server
  // call, fails open to zeros so the badges never show fake numbers.
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
      .catch(() => {
        /* fail open — keep zeros */
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden' }}>
      {/* Desktop Sidebar */}
      <aside
        style={{
          width: 220,
          flexShrink: 0,
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          padding: '16px 10px',
          gap: 4,
          overflowY: 'auto',
        }}
        className="hidden md:flex"
      >
        {/* Logo */}
        <div style={{ padding: '8px 12px 20px', marginBottom: 4 }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-dim)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            Jordan OS
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              color: 'var(--accent)',
              fontWeight: 600,
              letterSpacing: '-0.02em',
            }}
          >
            Mission Control
            <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}> v0.1</span>
          </div>
        </div>

        {/* Nav items */}
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} className={`nav-item ${isActive ? 'active' : ''}`}>
              <Icon size={16} strokeWidth={isActive ? 2.5 : 2} />
              {item.label}
              {item.href === '/decisions' && badges.decisions > 0 && (
                <span
                  style={{
                    marginLeft: 'auto',
                    background: 'rgba(244,63,94,0.15)',
                    color: 'var(--red)',
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    padding: '1px 5px',
                    borderRadius: 4,
                  }}
                >
                  {badges.decisions}
                </span>
              )}
              {item.href === '/execution' && badges.execution > 0 && (
                <span
                  style={{
                    marginLeft: 'auto',
                    background: 'rgba(245,158,11,0.15)',
                    color: 'var(--yellow)',
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    padding: '1px 5px',
                    borderRadius: 4,
                  }}
                >
                  {badges.execution}
                </span>
              )}
            </Link>
          );
        })}

        {/* Bottom status */}
        <div style={{ marginTop: 'auto', padding: '16px 12px 0' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 0',
              borderTop: '1px solid var(--border)',
            }}
          >
            <div className="pulse-online" />
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>CEO Agent online</span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        <div style={{ flex: 1, paddingBottom: 80 }} className="md:pb-0">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Nav */}
      <nav
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: 'var(--bg-surface)',
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
              <span
                style={{
                  fontSize: 9,
                  fontWeight: isActive ? 700 : 400,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
              >
                {item.label.split(' ')[0]}
              </span>
            </Link>
          );
        })}
        {/* More menu placeholder */}
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
          <span
            style={{
              fontSize: 9,
              fontWeight: 400,
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            More
          </span>
        </Link>
      </nav>
    </div>
  );
}
