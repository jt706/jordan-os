'use client';

import { useState, useRef, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Message } from '@/lib/types';
import { Send, Paperclip, Camera, Mic } from 'lucide-react';
import { Brain, Robot } from '@phosphor-icons/react';
import { createClient } from '@/lib/supabase/client';

interface ActiveAgent {
  id: string;
  name: string;
  role: string;
  avatar: string;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit' });
}

function MessageBubble({ msg, agentName, agentAvatar }: { msg: Message; agentName?: string; agentAvatar?: string }) {
  const isUser = msg.role === 'user';
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isUser ? 'row-reverse' : 'row',
        gap: 10,
        alignItems: 'flex-start',
        maxWidth: '100%',
      }}
    >
      {/* Avatar */}
      {!isUser && (
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(0,200,255,0.2), rgba(168,85,247,0.2))',
            border: '1px solid rgba(0,200,255,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            flexShrink: 0,
          }}
        >
          {agentAvatar ?? <Brain size={16} weight="fill" color="var(--accent)" />}
        </div>
      )}

      <div style={{ maxWidth: '75%', display: 'flex', flexDirection: 'column', gap: 4, alignItems: isUser ? 'flex-end' : 'flex-start' }}>
        <div
          style={{
            padding: '10px 14px',
            borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
            background: isUser
              ? 'linear-gradient(135deg, rgba(0,200,255,0.15), rgba(0,144,184,0.1))'
              : 'var(--bg-elevated)',
            border: `1px solid ${isUser ? 'rgba(0,200,255,0.25)' : 'var(--border)'}`,
            fontSize: 14,
            lineHeight: 1.6,
            color: 'var(--text)',
            whiteSpace: 'pre-wrap',
          }}
        >
          {/* Render markdown-ish bold */}
          {msg.content.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
            part.startsWith('**') && part.endsWith('**') ? (
              <strong key={i} style={{ color: 'var(--accent)' }}>
                {part.slice(2, -2)}
              </strong>
            ) : (
              <span key={i}>{part}</span>
            )
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
          {isUser ? 'Jordan' : (agentName ?? 'CEO Agent')} · {formatTime(new Date(msg.timestamp))}
        </div>
      </div>
    </div>
  );
}

// Map a Supabase row → Message
interface MessageRow {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  attachments: string[] | null;
}
function rowToMessage(r: MessageRow): Message {
  return {
    id: r.id,
    threadId: r.thread_id,
    role: r.role,
    content: r.content,
    timestamp: new Date(r.created_at),
    attachments: r.attachments ?? undefined,
  };
}

export default function ChatPage() {
  // Next.js 15+ requires anything that calls useSearchParams() to be wrapped
  // in Suspense so the static-prerender pass can bail cleanly. Inner component
  // does the real work; this thin wrapper provides the boundary.
  return (
    <Suspense fallback={null}>
      <ChatPageInner />
    </Suspense>
  );
}

function ChatPageInner() {
  const searchParams = useSearchParams();
  const requestedThreadId = searchParams.get('threadId');

  const [messages, setMessages] = useState<Message[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [activeAgent, setActiveAgent] = useState<ActiveAgent | null>(null);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Bootstrap: pick the active thread.
  //   1. If a ?threadId= is in the URL (e.g. from /agents → "Talk"), use that.
  //   2. Otherwise: most-recent pinned thread, then most-recent overall, then
  //      create a default CEO thread.
  // Also resolves the bound agent so the header reflects whose chat this is.
  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const supabase = createClient();
        let activeId: string | undefined;

        if (requestedThreadId) {
          const { data: t, error: tErr } = await supabase
            .from('threads')
            .select('id')
            .eq('id', requestedThreadId)
            .maybeSingle();
          if (tErr) throw tErr;
          if (t?.id) activeId = t.id;
        }

        if (!activeId) {
          const { data: threads, error: tErr } = await supabase
            .from('threads')
            .select('id')
            .is('agent_id', null)            // CEO thread = not bound to a sub-agent
            .order('pinned', { ascending: false })
            .order('updated_at', { ascending: false })
            .limit(1);
          if (tErr) throw tErr;
          activeId = threads?.[0]?.id as string | undefined;
        }

        // No threads yet → create a default CEO one so chat can persist.
        if (!activeId) {
          const { data: created, error: cErr } = await supabase
            .from('threads')
            .insert({ title: 'CEO Agent — Mission Control', tags: ['CEO'], pinned: true })
            .select('id')
            .single();
          if (cErr) throw cErr;
          activeId = created.id;
        }

        // Look up agent_id on the chosen thread so we can show the right header.
        const { data: thread } = await supabase
          .from('threads')
          .select('agent_id')
          .eq('id', activeId)
          .maybeSingle();
        let agent: ActiveAgent | null = null;
        if (thread?.agent_id) {
          const { data: a } = await supabase
            .from('agents')
            .select('id, name, role, avatar')
            .eq('id', thread.agent_id)
            .maybeSingle();
          if (a) agent = { id: a.id, name: a.name, role: a.role, avatar: a.avatar ?? '' };
        }

        const { data: msgs, error: mErr } = await supabase
          .from('messages')
          .select('*')
          .eq('thread_id', activeId)
          .order('created_at', { ascending: true });
        if (mErr) throw mErr;

        if (cancelled || !activeId) return;
        setThreadId(activeId);
        setActiveAgent(agent);
        setMessages((msgs ?? []).map(rowToMessage));
      } catch (e) {
        // Schema not applied yet, network down, etc. — surface honestly
        // instead of papering over with mock data.
        if (!cancelled) {
          const m = e instanceof Error ? e.message : 'unknown';
          console.warn('[chat] failed to load thread:', m);
          setError(`Couldn't load chat history: ${m}. Apply Supabase migrations and refresh.`);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestedThreadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    setError(null);

    // If we have no thread (e.g. migration not applied), fail gracefully.
    if (!threadId) {
      setError(
        'Database not ready. Apply supabase/migrations/0001_initial_schema.sql in the Supabase SQL editor, then refresh.'
      );
      return;
    }

    // Optimistic user message
    const userMsg: Message = {
      id: `pending-${Date.now()}`,
      threadId,
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId, message: text }),
      });

      if (!res.ok) {
        const { error: errMsg } = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        // Surface to the dev console too — when the red banner is easy to miss
        // (long page, scrolled away) this still shows up in DevTools.
        console.error('[chat] /api/chat failed', res.status, errMsg);
        throw new Error(errMsg ?? `Request failed (${res.status})`);
      }

      const reply = (await res.json()) as {
        id: string;
        threadId: string;
        role: 'assistant';
        content: string;
        timestamp: string;
      };

      const agentMsg: Message = {
        id: reply.id,
        threadId: reply.threadId,
        role: reply.role,
        content: reply.content,
        timestamp: new Date(reply.timestamp),
      };
      setMessages((prev) => [...prev, agentMsg]);
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Unknown error';
      setError(m);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'var(--bg-surface)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(0,200,255,0.2), rgba(168,85,247,0.2))',
            border: '1px solid rgba(0,200,255,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
          }}
        >
          {activeAgent ? activeAgent.avatar : <Brain size={20} weight="fill" color="var(--accent)" />}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {activeAgent ? activeAgent.name : 'CEO Agent'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
            <div className="pulse-online" />
            {activeAgent
              ? `Sub-agent · ${activeAgent.role}`
              : 'Online · JT OS Mission Control'}
          </div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <span className="badge" style={{ background: 'rgba(0,200,255,0.1)', color: 'var(--accent)', fontSize: 10 }}>
            claude-sonnet-4-6
          </span>
          {isLoading ? (
            <span
              className="badge"
              style={{ background: 'rgba(0,200,255,0.1)', color: 'var(--accent)', fontSize: 10 }}
            >
              LOADING
            </span>
          ) : error ? (
            <span
              className="badge"
              style={{ background: 'rgba(244,63,94,0.12)', color: 'var(--red)', fontSize: 10 }}
              title="Database error — see banner."
            >
              ERROR
            </span>
          ) : (
            <span className="badge" style={{ background: 'rgba(34,211,160,0.1)', color: 'var(--green)', fontSize: 10 }}>
              LIVE
            </span>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div
          style={{
            padding: '10px 20px',
            background: 'rgba(239,68,68,0.08)',
            borderBottom: '1px solid rgba(239,68,68,0.25)',
            color: '#fca5a5',
            fontSize: 12,
            fontFamily: 'var(--font-mono)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexShrink: 0,
          }}
        >
          <span>⚠ {error}</span>
          <button
            onClick={() => setError(null)}
            style={{
              background: 'none',
              border: 'none',
              color: '#fca5a5',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Date separator */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: 'var(--text-dim)',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
          }}
        >
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          Today
          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        {!isLoading && messages.length === 0 && !error && (
          <div
            style={{
              padding: '24px',
              textAlign: 'center',
              color: 'var(--text-dim)',
              fontSize: 13,
              fontFamily: 'var(--font-mono)',
            }}
          >
            No messages yet. Say hi to get started.
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            agentName={activeAgent?.name}
            agentAvatar={activeAgent?.avatar}
          />
        ))}

        {/* Typing indicator */}
        {isTyping && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, rgba(0,200,255,0.2), rgba(168,85,247,0.2))',
                border: '1px solid rgba(0,200,255,0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                flexShrink: 0,
              }}
            >
              {activeAgent?.avatar ?? <Brain size={16} weight="fill" color="var(--accent)" />}
            </div>
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '14px 14px 14px 4px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                display: 'flex',
                gap: 4,
                alignItems: 'center',
              }}
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    opacity: 0.6,
                    animation: 'pulse-dot 1.2s ease-in-out infinite',
                    animationDelay: `${i * 0.2}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div
        style={{
          padding: '12px 20px 16px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-surface)',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 14,
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            transition: 'border-color 0.15s',
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${activeAgent?.name ?? 'CEO Agent'}… (Enter to send, Shift+Enter for new line)`}
            rows={2}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text)',
              fontSize: 14,
              fontFamily: 'var(--font-body)',
              lineHeight: 1.5,
              resize: 'none',
              width: '100%',
              caretColor: 'var(--accent)',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                title="Attach file"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-dim)',
                  padding: '4px 6px',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim)')}
              >
                <Paperclip size={16} />
              </button>
              <button
                title="Screenshot"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-dim)',
                  padding: '4px 6px',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-dim)')}
              >
                <Camera size={16} />
              </button>
              <button
                title="Voice (coming soon)"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'not-allowed',
                  color: 'var(--text-dim)',
                  padding: '4px 6px',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  opacity: 0.5,
                }}
              >
                <Mic size={16} />
              </button>
            </div>

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
              style={{
                background: input.trim() && !isTyping ? 'var(--accent)' : 'var(--bg-hover)',
                color: input.trim() && !isTyping ? 'var(--bg)' : 'var(--text-dim)',
                border: 'none',
                borderRadius: 8,
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 700,
                cursor: input.trim() && !isTyping ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'all 0.15s',
                fontFamily: 'var(--font-body)',
              }}
            >
              <Send size={13} />
              Send
            </button>
          </div>
        </div>

        <div
          style={{
            fontSize: 11,
            color: 'var(--text-dim)',
            textAlign: 'center',
            marginTop: 8,
            fontFamily: 'var(--font-mono)',
          }}
        >
          Jordan has final authority · CEO Agent coordinates all agents
        </div>
      </div>
    </div>
  );
}
