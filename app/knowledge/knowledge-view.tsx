'use client';

import { useState, useMemo } from 'react';
import type { KnowledgeDoc, KnowledgeCategory, KnowledgeVisibility } from '@/lib/types';
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
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';

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

const visibilityConfig: Record<KnowledgeVisibility, { label: string; icon: Icon; color: string }> = {
  bellion:  { label: 'Bellion only', icon: Robot,  color: 'var(--accent)' },
  all:      { label: 'All agents',   icon: Globe,  color: '#4ade80'       },
  private:  { label: 'Private',      icon: Lock,   color: 'var(--text-muted)' },
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface DocFormState {
  title: string;
  category: KnowledgeCategory;
  content: string;
  tags: string;
  division: string;
  visibility: KnowledgeVisibility;
}

const EMPTY_FORM: DocFormState = {
  title: '',
  category: 'Reference',
  content: '',
  tags: '',
  division: '',
  visibility: 'bellion',
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function KnowledgeView({ initialDocs }: { initialDocs: KnowledgeDoc[] }) {
  const [docs, setDocs] = useState<KnowledgeDoc[]>(initialDocs);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<KnowledgeCategory | 'All'>('All');
  const [selectedDoc, setSelectedDoc] = useState<KnowledgeDoc | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingDoc, setEditingDoc] = useState<KnowledgeDoc | null>(null);
  const [form, setForm] = useState<DocFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ─── Filter + search ───────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let out = docs;
    if (activeCategory !== 'All') out = out.filter((d) => d.category === activeCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(
        (d) =>
          d.title.toLowerCase().includes(q) ||
          d.content.toLowerCase().includes(q) ||
          d.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return out;
  }, [docs, search, activeCategory]);

  const grouped = useMemo(() => {
    const map: Record<string, KnowledgeDoc[]> = {};
    for (const doc of filtered) {
      if (!map[doc.category]) map[doc.category] = [];
      map[doc.category].push(doc);
    }
    return map;
  }, [filtered]);

  // ─── Form helpers ──────────────────────────────────────────────────────────

  function openNew() {
    setEditingDoc(null);
    setForm(EMPTY_FORM);
    setError(null);
    setShowForm(true);
  }

  function openEdit(doc: KnowledgeDoc) {
    setEditingDoc(doc);
    setForm({
      title: doc.title,
      category: doc.category,
      content: doc.content,
      tags: doc.tags.join(', '),
      division: doc.division ?? '',
      visibility: doc.visibility,
    });
    setError(null);
    setShowForm(true);
    setSelectedDoc(null);
  }

  function closeForm() {
    setShowForm(false);
    setEditingDoc(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.content.trim()) {
      setError('Title and content are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: form.title.trim(),
        category: form.category,
        content: form.content.trim(),
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        division: form.division.trim() || null,
        visibility: form.visibility,
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
      setError(e instanceof Error ? e.message : 'Save failed');
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

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '32px 28px', maxWidth: 1200, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28, gap: 16 }}>
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
              {docs.length} doc{docs.length !== 1 ? 's' : ''} · Bellion's source of truth
            </p>
          </div>
        </div>
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

      {/* Search + category filter */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', minWidth: 200 }}>
          <MagnifyingGlass
            size={15}
            style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', pointerEvents: 'none' }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, content, tags…"
            style={{
              width: '100%', padding: '8px 12px 8px 33px',
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 8, color: 'var(--text)', fontSize: 13, outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['All', ...CATEGORIES] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                padding: '6px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                cursor: 'pointer', border: '1px solid var(--border)',
                background: activeCategory === cat ? 'rgba(194,255,0,0.12)' : 'transparent',
                color: activeCategory === cat ? '#c2ff00' : 'var(--text-muted)',
                borderColor: activeCategory === cat ? 'rgba(194,255,0,0.3)' : 'var(--border)',
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Main content: list + detail */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>

        {/* Doc list */}
        <div style={{ flex: selectedDoc ? '0 0 380px' : 1, minWidth: 0 }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-dim)' }}>
              <BookOpen size={40} weight="thin" style={{ marginBottom: 12, opacity: 0.4 }} />
              <div style={{ fontSize: 14 }}>No docs found</div>
              <div style={{ fontSize: 12, marginTop: 4, opacity: 0.6 }}>
                {search ? 'Try a different search' : 'Add your first doc'}
              </div>
            </div>
          ) : (
            Object.entries(grouped).map(([cat, catDocs]) => {
              const cfg = categoryConfig[cat as KnowledgeCategory];
              const CatIcon = cfg?.icon ?? Bookmarks;
              return (
                <div key={cat} style={{ marginBottom: 24 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    marginBottom: 10, padding: '0 2px',
                  }}>
                    <CatIcon size={14} color={cfg?.color ?? 'var(--text-dim)'} weight="duotone" />
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {cat}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)', marginLeft: 2 }}>
                      {catDocs.length}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {catDocs.map((doc) => {
                      const vis = visibilityConfig[doc.visibility];
                      const VisIcon = vis.icon;
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
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1, minWidth: 0 }}>
                              {doc.title}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                              <VisIcon size={12} color={vis.color} />
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
                          {doc.tags.length > 0 && (
                            <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
                              {doc.tags.slice(0, 5).map((tag) => (
                                <span key={tag} style={{
                                  fontSize: 10, padding: '2px 7px',
                                  background: 'rgba(255,255,255,0.05)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 20, color: 'var(--text-muted)',
                                }}>
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                            {doc.content.slice(0, 160)}
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
          <div style={{
            flex: 1, minWidth: 0,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 12, padding: '20px 24px',
            position: 'sticky', top: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  {(() => {
                    const cfg = categoryConfig[selectedDoc.category];
                    const CatIcon = cfg?.icon ?? Bookmarks;
                    return (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                        background: cfg?.bg ?? 'rgba(255,255,255,0.05)',
                        color: cfg?.color ?? 'var(--text-muted)',
                        border: `1px solid ${cfg?.color ? cfg.color + '30' : 'var(--border)'}`,
                      }}>
                        <CatIcon size={11} weight="duotone" />
                        {selectedDoc.category}
                      </span>
                    );
                  })()}
                  {(() => {
                    const vis = visibilityConfig[selectedDoc.visibility];
                    const VisIcon = vis.icon;
                    return (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: vis.color }}>
                        <VisIcon size={11} />
                        {vis.label}
                      </span>
                    );
                  })()}
                </div>
                <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.03em', margin: 0 }}>
                  {selectedDoc.title}
                </h2>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => openEdit(selectedDoc)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '6px 12px', background: 'rgba(255,255,255,0.05)',
                    border: '1px solid var(--border)', borderRadius: 7,
                    color: 'var(--text)', fontSize: 12, cursor: 'pointer',
                  }}
                >
                  <Pencil size={12} />
                  Edit
                </button>
                <button
                  onClick={() => setSelectedDoc(null)}
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

            {selectedDoc.tags.length > 0 && (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 16 }}>
                <Tag size={12} color="var(--text-dim)" style={{ marginTop: 3 }} />
                {selectedDoc.tags.map((tag) => (
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

            <div style={{
              fontSize: 13, lineHeight: 1.8, color: 'var(--text)',
              whiteSpace: 'pre-wrap', maxHeight: 480, overflowY: 'auto',
              borderTop: '1px solid var(--border)', paddingTop: 16,
            }}>
              {selectedDoc.content}
            </div>

            <div style={{ marginTop: 16, fontSize: 11, color: 'var(--text-dim)', display: 'flex', gap: 16 }}>
              <span>Added {selectedDoc.createdAt.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              {selectedDoc.updatedAt.getTime() !== selectedDoc.createdAt.getTime() && (
                <span>Updated {selectedDoc.updatedAt.toLocaleDateString('en-NZ', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              )}
              {selectedDoc.division && <span>Division: {selectedDoc.division}</span>}
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit form modal */}
      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(8px)', zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border)',
            borderRadius: 16, padding: '28px 28px 24px', width: '100%', maxWidth: 640,
            maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                {editingDoc ? `Edit — ${editingDoc.title}` : 'New knowledge doc'}
              </h3>
              <button onClick={closeForm} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: 4 }}>
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
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                  Title *
                </label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Jordan Constitution"
                  style={{
                    width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--border)', borderRadius: 8,
                    color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Category + Visibility row */}
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                    Category
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as KnowledgeCategory }))}
                    style={{
                      width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.04)',
                      border: '1px solid var(--border)', borderRadius: 8,
                      color: 'var(--text)', fontSize: 13, outline: 'none',
                    }}
                  >
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                    Visibility
                  </label>
                  <select
                    value={form.visibility}
                    onChange={(e) => setForm((f) => ({ ...f, visibility: e.target.value as KnowledgeVisibility }))}
                    style={{
                      width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.04)',
                      border: '1px solid var(--border)', borderRadius: 8,
                      color: 'var(--text)', fontSize: 13, outline: 'none',
                    }}
                  >
                    <option value="bellion">Bellion only</option>
                    <option value="all">All agents</option>
                    <option value="private">Private (JT only)</option>
                  </select>
                </div>
              </div>

              {/* Content */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                  Content *
                </label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  placeholder="Write the knowledge content here. Plain text, markdown-style headings (##), bullet points (-) all work well."
                  rows={12}
                  style={{
                    width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--border)', borderRadius: 8,
                    color: 'var(--text)', fontSize: 13, outline: 'none',
                    fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6,
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Tags + Division row */}
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 2 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                    Tags <span style={{ fontWeight: 400, textTransform: 'none' }}>(comma separated)</span>
                  </label>
                  <input
                    value={form.tags}
                    onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                    placeholder="e.g. values, delegation, rules"
                    style={{
                      width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.04)',
                      border: '1px solid var(--border)', borderRadius: 8,
                      color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                    Division
                  </label>
                  <input
                    value={form.division}
                    onChange={(e) => setForm((f) => ({ ...f, division: e.target.value }))}
                    placeholder="Optional"
                    style={{
                      width: '100%', padding: '9px 12px', background: 'rgba(255,255,255,0.04)',
                      border: '1px solid var(--border)', borderRadius: 8,
                      color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
              <button
                onClick={closeForm}
                style={{
                  padding: '8px 16px', background: 'transparent',
                  border: '1px solid var(--border)', borderRadius: 8,
                  color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
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
      )}
    </div>
  );
}

// ─── Row helper (raw API response → typed KnowledgeDoc) ───────────────────────

function rowToDoc(r: Record<string, unknown>): KnowledgeDoc {
  return {
    id: String(r.id),
    title: String(r.title),
    category: r.category as KnowledgeDoc['category'],
    content: String(r.content),
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    division: typeof r.division === 'string' ? r.division : null,
    visibility: (r.visibility ?? 'bellion') as KnowledgeDoc['visibility'],
    createdAt: new Date(String(r.created_at)),
    updatedAt: new Date(String(r.updated_at)),
  };
}
