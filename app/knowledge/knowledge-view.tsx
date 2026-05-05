'use client';

import { useState, useMemo } from 'react';
import type {
  KnowledgeDoc,
  KnowledgeCategory,
  KnowledgeVisibility,
  KnowledgeAuthority,
  KnowledgeScope,
  KnowledgeStatus,
} from '@/lib/types';
import {
  BookOpen,
  Plus,
  MagnifyingGlass,
  Pencil,
  Trash,
  X,
  FloppyDisk,
  Tag,
  Globe,
  Lock,
  Robot,
  Scroll,
  Gear,
  Palette,
  CurrencyDollar,
  Users,
  Package,
  Strategy,
  Bookmarks,
  ShieldStar,
  Scales,
  Buildings,
  FileText,
  Archive,
  Warning,
  CheckCircle,
  Clock,
  GitBranch,
  ArrowsClockwise,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';

// ─── Authority level config ───────────────────────────────────────────────────

const AUTHORITY_LEVELS: { value: KnowledgeAuthority; label: string; level: string; color: string; bg: string; icon: Icon; description: string }[] = [
  { value: 'constitutional', label: 'Constitutional', level: 'L1', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',   icon: ShieldStar, description: 'Highest authority — applies to all agents, cannot be overridden' },
  { value: 'policy',         label: 'System Policy',  level: 'L2', color: '#f97316', bg: 'rgba(249,115,22,0.1)',   icon: Scales,     description: 'Hermes, permissions, approval rules — binding on all agents' },
  { value: 'division_rule',  label: 'Division Doctrine', level: 'L3', color: '#5bbcff', bg: 'rgba(91,188,255,0.1)', icon: Buildings,  description: 'Division-specific rules — binding within that division' },
  { value: 'sop',            label: 'SOP / Process',  level: 'L4', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', icon: FileText,   description: 'How work gets done — operational guidance' },
  { value: 'reference',      label: 'Reference',      level: 'L5', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', icon: Bookmarks,  description: 'Useful info — not binding, context only' },
  { value: 'draft',          label: 'Draft',          level: '—',  color: '#64748b', bg: 'rgba(100,116,139,0.08)', icon: FileText,  description: 'Work in progress — not yet authoritative' },
];

const authorityMap = Object.fromEntries(AUTHORITY_LEVELS.map((a) => [a.value, a]));

// ─── Category config ──────────────────────────────────────────────────────────

const categoryConfig: Record<KnowledgeCategory, { icon: Icon; color: string; bg: string }> = {
  Constitution: { icon: Scroll,         color: '#c2ff00', bg: 'rgba(194,255,0,0.08)'     },
  Process:      { icon: Gear,           color: '#5bbcff', bg: 'rgba(91,188,255,0.08)'    },
  Brand:        { icon: Palette,        color: '#ff6eb4', bg: 'rgba(255,110,180,0.08)'   },
  Finance:      { icon: CurrencyDollar, color: '#4ade80', bg: 'rgba(74,222,128,0.08)'    },
  People:       { icon: Users,          color: '#fb923c', bg: 'rgba(251,146,60,0.08)'    },
  Product:      { icon: Package,        color: '#a78bfa', bg: 'rgba(167,139,250,0.08)'   },
  Strategy:     { icon: Strategy,       color: '#fbbf24', bg: 'rgba(251,191,36,0.08)'    },
  Reference:    { icon: Bookmarks,      color: '#94a3b8', bg: 'rgba(148,163,184,0.08)'   },
};

const CATEGORIES: KnowledgeCategory[] = [
  'Constitution', 'Process', 'Brand', 'Finance', 'People', 'Product', 'Strategy', 'Reference',
];

const SCOPES: KnowledgeScope[] = [
  'global', 'bellion', 'hermes', 'agent_hr', 'tuatahi', 'noa',
  'sidekick_ai', 'personal', 'shared_services', 'all_agents',
];

const statusConfig: Record<KnowledgeStatus, { label: string; icon: Icon; color: string }> = {
  active:      { label: 'Active',      icon: CheckCircle,    color: '#4ade80' },
  draft:       { label: 'Draft',       icon: Clock,          color: '#94a3b8' },
  deprecated:  { label: 'Deprecated',  icon: Warning,        color: '#f97316' },
  archived:    { label: 'Archived',    icon: Archive,        color: '#64748b' },
};

const visibilityConfig: Record<KnowledgeVisibility, { label: string; icon: Icon; color: string }> = {
  bellion:  { label: 'Bellion only', icon: Robot,  color: 'var(--accent)' },
  all:      { label: 'All agents',   icon: Globe,  color: '#4ade80'       },
  private:  { label: 'Private',      icon: Lock,   color: 'var(--text-muted)' },
};

// ─── Form state ───────────────────────────────────────────────────────────────

interface DocFormState {
  title: string;
  category: KnowledgeCategory;
  content: string;
  tags: string;
  division: string;
  visibility: KnowledgeVisibility;
  authorityLevel: KnowledgeAuthority;
  appliesTo: string; // comma-separated
  status: KnowledgeStatus;
  version: string;
  reviewedBy: string;
}

const EMPTY_FORM: DocFormState = {
  title: '',
  category: 'Reference',
  content: '',
  tags: '',
  division: '',
  visibility: 'bellion',
  authorityLevel: 'reference',
  appliesTo: 'global',
  status: 'active',
  version: '1.0',
  reviewedBy: '',
};

// ─── Main component ───────────────────────────────────────────────────────────

export default function KnowledgeView({ initialDocs }: { initialDocs: KnowledgeDoc[] }) {
  const [docs, setDocs] = useState<KnowledgeDoc[]>(initialDocs);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<KnowledgeCategory | 'All'>('All');
  const [activeAuthority, setActiveAuthority] = useState<KnowledgeAuthority | 'All'>('All');
  const [selectedDoc, setSelectedDoc] = useState<KnowledgeDoc | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingDoc, setEditingDoc] = useState<KnowledgeDoc | null>(null);
  const [form, setForm] = useState<DocFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showHierarchy, setShowHierarchy] = useState(false);

  // ─── Filter ─────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let out = docs;
    if (activeCategory !== 'All') out = out.filter((d) => d.category === activeCategory);
    if (activeAuthority !== 'All') out = out.filter((d) => d.authorityLevel === activeAuthority);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.content.toLowerCase().includes(q) ||
          d.tags.some((t) => t.toLowerCase().includes(q)) ||
          d.appliesTo.some((s) => s.toLowerCase().includes(q)),
      );
    }
    // Sort by authority level order, then title
    const order: Record<KnowledgeAuthority, number> = {
      constitutional: 1, policy: 2, division_rule: 3, sop: 4, reference: 5, draft: 6,
    };
    return out.sort((a, b) => {
      const diff = (order[a.authorityLevel] ?? 5) - (order[b.authorityLevel] ?? 5);
      return diff !== 0 ? diff : a.title.localeCompare(b.title);
    });
  }, [docs, search, activeCategory, activeAuthority]);

  // Group by authority level
  const grouped = useMemo(() => {
    const map: Partial<Record<KnowledgeAuthority, KnowledgeDoc[]>> = {};
    for (const doc of filtered) {
      if (!map[doc.authorityLevel]) map[doc.authorityLevel] = [];
      map[doc.authorityLevel]!.push(doc);
    }
    return map;
  }, [filtered]);

  // Stats
  const activeDocs  = docs.filter((d) => d.status === 'active').length;
  const draftDocs   = docs.filter((d) => d.status === 'draft').length;
  const constDocs   = docs.filter((d) => d.authorityLevel === 'constitutional').length;

  // ─── Form helpers ────────────────────────────────────────────────────────────

  function openNew() {
    setEditingDoc(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(doc: KnowledgeDoc) {
    setEditingDoc(doc);
    setForm({
      title:          doc.title,
      category:       doc.category,
      content:        doc.content,
      tags:           doc.tags.join(', '),
      division:       doc.division ?? '',
      visibility:     doc.visibility,
      authorityLevel: doc.authorityLevel,
      appliesTo:      doc.appliesTo.join(', '),
      status:         doc.status,
      version:        doc.version,
      reviewedBy:     doc.reviewedBy ?? '',
    });
    setFormError(null);
    setShowForm(true);
    setSelectedDoc(null);
  }

  function closeForm() {
    setShowForm(false);
    setEditingDoc(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.content.trim()) {
      setFormError('Title and content are required.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        title:           form.title.trim(),
        category:        form.category,
        content:         form.content.trim(),
        tags:            form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        division:        form.division.trim() || null,
        visibility:      form.visibility,
        authority_level: form.authorityLevel,
        applies_to:      form.appliesTo.split(',').map((s) => s.trim()).filter(Boolean),
        status:          form.status,
        version:         form.version.trim() || '1.0',
        reviewed_by:     form.reviewedBy.trim() || null,
      };

      if (editingDoc) {
        const res = await fetch(`/api/knowledge/${editingDoc.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Save failed');
        const updated = rowToDoc(json.doc);
        setDocs((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
        setSelectedDoc(updated);
      } else {
        const res = await fetch('/api/knowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Save failed');
        const created = rowToDoc(json.doc);
        setDocs((prev) => [created, ...prev]);
        setSelectedDoc(created);
      }
      closeForm();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(doc: KnowledgeDoc) {
    if (!confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    setDeleting(doc.id);
    try {
      const res = await fetch(`/api/knowledge/${doc.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? 'Delete failed');
      }
      setDocs((prev) => prev.filter((d) => d.id !== doc.id));
      if (selectedDoc?.id === doc.id) setSelectedDoc(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(null);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '32px 28px', maxWidth: 1200, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'rgba(194,255,0,0.1)', border: '1px solid rgba(194,255,0,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <BookOpen size={20} color="#c2ff00" weight="duotone" />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.04em', margin: 0 }}>
              Knowledge Base
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '3px 0 0' }}>
              {activeDocs} active · {draftDocs > 0 ? `${draftDocs} draft · ` : ''}{constDocs} constitutional · Bellion's source of truth
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowHierarchy(!showHierarchy)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'transparent', border: '1px solid var(--border)',
              borderRadius: 8, padding: '8px 14px',
              fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer',
            }}
          >
            <Scales size={15} />
            Authority hierarchy
          </button>
          <button
            onClick={openNew}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--accent)', color: '#0d0520',
              border: 'none', borderRadius: 8, padding: '8px 14px',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Plus size={15} weight="bold" />
            New doc
          </button>
        </div>
      </div>

      {/* Authority hierarchy legend */}
      {showHierarchy && (
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '16px 20px', marginBottom: 20,
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Authority hierarchy — higher levels override lower
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {AUTHORITY_LEVELS.map((a) => {
              const AIcon = a.icon;
              const count = docs.filter((d) => d.authorityLevel === a.value).length;
              return (
                <div key={a.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: a.color,
                    background: a.bg, border: `1px solid ${a.color}30`,
                    padding: '2px 8px', borderRadius: 20, minWidth: 28, textAlign: 'center', flexShrink: 0,
                  }}>
                    {a.level}
                  </span>
                  <AIcon size={14} color={a.color} style={{ marginTop: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: a.color }}>{a.label}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 8 }}>{a.description}</span>
                  </div>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)', flexShrink: 0 }}>{count} doc{count !== 1 ? 's' : ''}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Search + filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <MagnifyingGlass
            size={15}
            style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', pointerEvents: 'none' }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, content, tags, scope…"
            style={{
              width: '100%', padding: '8px 12px 8px 33px',
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Authority filter pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveAuthority('All')}
          style={{
            padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
            cursor: 'pointer', border: '1px solid var(--border)',
            background: activeAuthority === 'All' ? 'rgba(194,255,0,0.12)' : 'transparent',
            color: activeAuthority === 'All' ? '#c2ff00' : 'var(--text-muted)',
            borderColor: activeAuthority === 'All' ? 'rgba(194,255,0,0.3)' : 'var(--border)',
          }}
        >
          All levels
        </button>
        {AUTHORITY_LEVELS.map((a) => (
          <button
            key={a.value}
            onClick={() => setActiveAuthority(activeAuthority === a.value ? 'All' : a.value)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
              cursor: 'pointer', border: '1px solid',
              background: activeAuthority === a.value ? a.bg : 'transparent',
              color: activeAuthority === a.value ? a.color : 'var(--text-muted)',
              borderColor: activeAuthority === a.value ? `${a.color}50` : 'var(--border)',
            }}
          >
            <span style={{ opacity: 0.7, fontSize: 10 }}>{a.level}</span>
            {a.label}
          </button>
        ))}
      </div>

      {/* Category filter pills */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 24, flexWrap: 'wrap' }}>
        {(['All', ...CATEGORIES] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500,
              cursor: 'pointer', border: '1px solid var(--border)',
              background: activeCategory === cat ? 'rgba(255,255,255,0.07)' : 'transparent',
              color: activeCategory === cat ? 'var(--text)' : 'var(--text-dim)',
              borderColor: activeCategory === cat ? 'rgba(255,255,255,0.15)' : 'var(--border)',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Main layout: list + detail */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

        {/* Doc list */}
        <div style={{ flex: selectedDoc ? '0 0 400px' : 1, minWidth: 0 }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-dim)' }}>
              <BookOpen size={40} weight="thin" style={{ marginBottom: 12, opacity: 0.4 }} />
              <div style={{ fontSize: 14 }}>No docs found</div>
              <div style={{ fontSize: 12, marginTop: 4, opacity: 0.6 }}>
                {search ? 'Try a different search' : 'Add your first doc'}
              </div>
            </div>
          ) : (
            AUTHORITY_LEVELS
              .filter((a) => grouped[a.value]?.length)
              .map((a) => {
                const catDocs = grouped[a.value]!;
                const AIcon = a.icon;
                return (
                  <div key={a.value} style={{ marginBottom: 24 }}>
                    {/* Authority section header */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      marginBottom: 8, padding: '6px 10px',
                      background: a.bg, borderRadius: 8,
                      border: `1px solid ${a.color}20`,
                    }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: a.color,
                        background: `${a.color}20`, padding: '1px 7px', borderRadius: 20,
                      }}>
                        {a.level}
                      </span>
                      <AIcon size={13} color={a.color} weight="duotone" />
                      <span style={{ fontSize: 12, fontWeight: 600, color: a.color }}>
                        {a.label}
                      </span>
                      <span style={{ fontSize: 11, color: a.color, opacity: 0.6, marginLeft: 'auto' }}>
                        {catDocs.length} doc{catDocs.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {catDocs.map((doc) => {
                        const catCfg = categoryConfig[doc.category];
                        const CatIcon = catCfg?.icon ?? Bookmarks;
                        const stCfg = statusConfig[doc.status];
                        const StIcon = stCfg.icon;
                        const isSelected = selectedDoc?.id === doc.id;
                        return (
                          <div
                            key={doc.id}
                            onClick={() => setSelectedDoc(isSelected ? null : doc)}
                            style={{
                              padding: '11px 14px',
                              background: isSelected ? 'rgba(194,255,0,0.06)' : 'var(--bg-surface)',
                              border: `1px solid ${isSelected ? 'rgba(194,255,0,0.25)' : 'var(--border)'}`,
                              borderRadius: 10, cursor: 'pointer',
                              transition: 'all 0.15s',
                              opacity: doc.status === 'archived' || doc.status === 'deprecated' ? 0.6 : 1,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 }}>
                                <CatIcon size={13} color={catCfg?.color ?? 'var(--text-dim)'} weight="duotone" />
                                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {doc.title}
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                                {doc.status !== 'active' && (
                                  <StIcon size={11} color={stCfg.color} aria-label={stCfg.label} />
                                )}
                                <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>v{doc.version}</span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); openEdit(doc); }}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, color: 'var(--text-dim)', display: 'flex' }}
                                  title="Edit"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDelete(doc); }}
                                  disabled={deleting === doc.id}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 3, color: 'var(--red)', opacity: deleting === doc.id ? 0.4 : 1, display: 'flex' }}
                                  title="Delete"
                                >
                                  <Trash size={13} />
                                </button>
                              </div>
                            </div>

                            {/* Scope tags */}
                            {doc.appliesTo.length > 0 && !doc.appliesTo.includes('global') && (
                              <div style={{ display: 'flex', gap: 4, marginTop: 5, flexWrap: 'wrap' }}>
                                {doc.appliesTo.slice(0, 4).map((s) => (
                                  <span key={s} style={{
                                    fontSize: 10, padding: '1px 6px',
                                    background: 'rgba(124,58,237,0.1)',
                                    border: '1px solid rgba(124,58,237,0.2)',
                                    borderRadius: 20, color: 'var(--accent)',
                                  }}>
                                    {s}
                                  </span>
                                ))}
                              </div>
                            )}

                            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 5, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                              {doc.content.replace(/#+\s/g, '').slice(0, 140)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
          )}
        </div>

        {/* Detail panel */}
        {selectedDoc && (
          <DetailPanel
            doc={selectedDoc}
            onEdit={openEdit}
            onClose={() => setSelectedDoc(null)}
          />
        )}
      </div>

      {/* Form modal */}
      {showForm && (
        <FormModal
          form={form}
          setForm={setForm}
          editingDoc={editingDoc}
          onSave={handleSave}
          onClose={closeForm}
          saving={saving}
          error={formError}
        />
      )}
    </div>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({
  doc, onEdit, onClose,
}: {
  doc: KnowledgeDoc;
  onEdit: (doc: KnowledgeDoc) => void;
  onClose: () => void;
}) {
  const catCfg = categoryConfig[doc.category];
  const CatIcon = catCfg?.icon ?? Bookmarks;
  const aCfg = authorityMap[doc.authorityLevel];
  const AIcon = aCfg?.icon ?? Bookmarks;
  const stCfg = statusConfig[doc.status];
  const StIcon = stCfg.icon;
  const visCfg = visibilityConfig[doc.visibility];
  const VisIcon = visCfg.icon;

  return (
    <div style={{
      flex: 1, minWidth: 0,
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      borderRadius: 12, padding: '20px 24px',
      position: 'sticky', top: 20,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          {/* Authority badge — most prominent */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px', borderRadius: 20, marginBottom: 8,
            background: aCfg?.bg ?? 'rgba(255,255,255,0.05)',
            border: `1px solid ${aCfg?.color ?? 'var(--border)'}30`,
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: aCfg?.color }}>
              {aCfg?.level}
            </span>
            <AIcon size={12} color={aCfg?.color} weight="duotone" />
            <span style={{ fontSize: 11, fontWeight: 600, color: aCfg?.color }}>
              {aCfg?.label}
            </span>
          </div>

          <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.03em', margin: 0, lineHeight: 1.3 }}>
            {doc.title}
          </h2>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={() => onEdit(doc)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '6px 12px', background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border)', borderRadius: 7,
              color: 'var(--text)', fontSize: 12, cursor: 'pointer',
            }}
          >
            <Pencil size={12} /> Edit
          </button>
          <button
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center',
              padding: 6, background: 'none',
              border: '1px solid var(--border)', borderRadius: 7,
              color: 'var(--text-dim)', cursor: 'pointer',
            }}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Meta row */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
        {/* Category */}
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
          background: catCfg?.bg ?? 'rgba(255,255,255,0.05)',
          color: catCfg?.color ?? 'var(--text-muted)',
          border: `1px solid ${catCfg?.color ? catCfg.color + '30' : 'var(--border)'}`,
        }}>
          <CatIcon size={11} weight="duotone" /> {doc.category}
        </span>

        {/* Status */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: stCfg.color }}>
          <StIcon size={11} weight="duotone" /> {stCfg.label}
        </span>

        {/* Version */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-dim)' }}>
          <GitBranch size={11} /> v{doc.version}
        </span>

        {/* Visibility */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: visCfg.color }}>
          <VisIcon size={11} /> {visCfg.label}
        </span>
      </div>

      {/* Applies to */}
      {doc.appliesTo.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 }}>
            Applies to
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {doc.appliesTo.map((s) => (
              <span key={s} style={{
                fontSize: 11, padding: '2px 8px',
                background: 'rgba(124,58,237,0.1)',
                border: '1px solid rgba(124,58,237,0.2)',
                borderRadius: 20, color: 'var(--accent)',
              }}>
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {doc.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 14 }}>
          <Tag size={12} color="var(--text-dim)" style={{ marginTop: 3 }} />
          {doc.tags.map((tag) => (
            <span key={tag} style={{
              fontSize: 11, padding: '2px 8px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border)',
              borderRadius: 20, color: 'var(--text-muted)',
            }}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Content */}
      <div style={{
        fontSize: 13, lineHeight: 1.8, color: 'var(--text)',
        whiteSpace: 'pre-wrap', maxHeight: 400, overflowY: 'auto',
      }}>
        {doc.content}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 14, fontSize: 11, color: 'var(--text-dim)', display: 'flex', gap: 14, flexWrap: 'wrap', paddingTop: 14, borderTop: '1px solid var(--border)' }}>
        <span>Added {doc.createdAt.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        {doc.updatedAt.getTime() !== doc.createdAt.getTime() && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <ArrowsClockwise size={10} />
            Updated {doc.updatedAt.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        )}
        {doc.reviewedBy && (
          <span>Reviewed by {doc.reviewedBy}{doc.reviewedAt ? ` · ${doc.reviewedAt.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</span>
        )}
        {doc.division && <span>Division: {doc.division}</span>}
      </div>
    </div>
  );
}

// ─── Form modal ───────────────────────────────────────────────────────────────

function FormModal({
  form, setForm, editingDoc, onSave, onClose, saving, error,
}: {
  form: DocFormState;
  setForm: React.Dispatch<React.SetStateAction<DocFormState>>;
  editingDoc: KnowledgeDoc | null;
  onSave: () => void;
  onClose: () => void;
  saving: boolean;
  error: string | null;
}) {
  const f = (key: keyof DocFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid var(--border)', borderRadius: 8,
    color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
    letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: 5,
  };

  const selectedAuth = AUTHORITY_LEVELS.find((a) => a.value === form.authorityLevel);

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
      backdropFilter: 'blur(8px)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '24px 28px 20px', width: '100%', maxWidth: 700,
        maxHeight: '92vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
            {editingDoc ? `Edit — ${editingDoc.title}` : 'New knowledge doc'}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {error && (
          <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 16, padding: '8px 12px', background: 'rgba(255,68,102,0.1)', borderRadius: 8 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Title */}
          <div>
            <label style={labelStyle}>Title *</label>
            <input value={form.title} onChange={f('title')} placeholder="e.g. Bellion Role Charter" style={inputStyle} />
          </div>

          {/* Authority level — full width, highlighted */}
          <div style={{
            padding: '12px 14px', borderRadius: 10,
            background: selectedAuth?.bg ?? 'rgba(255,255,255,0.03)',
            border: `1px solid ${selectedAuth?.color ? selectedAuth.color + '30' : 'var(--border)'}`,
          }}>
            <label style={{ ...labelStyle, color: selectedAuth?.color ?? 'var(--text-muted)' }}>
              Authority level
            </label>
            <select value={form.authorityLevel} onChange={f('authorityLevel')} style={{ ...inputStyle, background: 'rgba(0,0,0,0.2)' }}>
              {AUTHORITY_LEVELS.map((a) => (
                <option key={a.value} value={a.value}>{a.level} — {a.label}: {a.description.split('—')[0].trim()}</option>
              ))}
            </select>
            {selectedAuth && (
              <div style={{ fontSize: 11, color: selectedAuth.color, marginTop: 6, opacity: 0.8 }}>
                {selectedAuth.description}
              </div>
            )}
          </div>

          {/* Row: category + status */}
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Category</label>
              <select value={form.category} onChange={f('category')} style={inputStyle}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Status</label>
              <select value={form.status} onChange={f('status')} style={inputStyle}>
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="deprecated">Deprecated</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          {/* Applies to + visibility */}
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 2 }}>
              <label style={labelStyle}>Applies to <span style={{ fontWeight: 400, textTransform: 'none' }}>(comma separated)</span></label>
              <input value={form.appliesTo} onChange={f('appliesTo')}
                placeholder="e.g. global, bellion, hermes, all_agents"
                style={inputStyle} />
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
                Options: {SCOPES.join(', ')}
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Visibility</label>
              <select value={form.visibility} onChange={f('visibility')} style={inputStyle}>
                <option value="bellion">Bellion only</option>
                <option value="all">All agents</option>
                <option value="private">Private (JT only)</option>
              </select>
            </div>
          </div>

          {/* Content */}
          <div>
            <label style={labelStyle}>Content *</label>
            <textarea
              value={form.content} onChange={f('content')}
              placeholder="Write the knowledge content. Markdown-style headings (## Section), bullets (-), and bold (**key term**) all work."
              rows={13}
              style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.65 }}
            />
          </div>

          {/* Tags + version */}
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 3 }}>
              <label style={labelStyle}>Tags <span style={{ fontWeight: 400, textTransform: 'none' }}>(comma separated)</span></label>
              <input value={form.tags} onChange={f('tags')} placeholder="e.g. values, delegation, rules" style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Version</label>
              <input value={form.version} onChange={f('version')} placeholder="1.0" style={inputStyle} />
            </div>
          </div>

          {/* Division + reviewed by */}
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Division</label>
              <input value={form.division} onChange={f('division')} placeholder="Optional" style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Reviewed by</label>
              <input value={form.reviewedBy} onChange={f('reviewedBy')} placeholder="e.g. JT" style={inputStyle} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px', background: 'transparent',
              border: '1px solid var(--border)', borderRadius: 8,
              color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onSave} disabled={saving}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 18px', background: 'var(--accent)',
              border: 'none', borderRadius: 8,
              color: '#0d0520', fontSize: 13, fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
            }}
          >
            <FloppyDisk size={14} />
            {saving ? 'Saving…' : editingDoc ? 'Save changes' : 'Add doc'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Row helper ───────────────────────────────────────────────────────────────

function rowToDoc(r: Record<string, unknown>): KnowledgeDoc {
  return {
    id:             String(r.id),
    title:          String(r.title),
    category:       r.category as KnowledgeDoc['category'],
    content:        String(r.content),
    tags:           Array.isArray(r.tags) ? (r.tags as string[]) : [],
    division:       typeof r.division === 'string' ? r.division : null,
    visibility:     (r.visibility ?? 'bellion') as KnowledgeDoc['visibility'],
    authorityLevel: (r.authority_level ?? 'reference') as KnowledgeDoc['authorityLevel'],
    appliesTo:      Array.isArray(r.applies_to) ? (r.applies_to as KnowledgeDoc['appliesTo']) : ['global'],
    status:         (r.status ?? 'active') as KnowledgeDoc['status'],
    version:        typeof r.version === 'string' ? r.version : '1.0',
    reviewedAt:     r.reviewed_at ? new Date(String(r.reviewed_at)) : null,
    reviewedBy:     typeof r.reviewed_by === 'string' ? r.reviewed_by : null,
    supersedesId:   typeof r.supersedes_id === 'string' ? r.supersedes_id : null,
    createdAt:      new Date(String(r.created_at)),
    updatedAt:      new Date(String(r.updated_at)),
  };
}
