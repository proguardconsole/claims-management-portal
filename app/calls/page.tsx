'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// ─── types ─────────────────────────────────────────────────────────────────────

type CallRecord = {
  id: string
  direction: 'inbound' | 'outbound'
  did_label: string
  caller_phone: string
  caller_name: string | null
  agent_name: string
  started_at: string
  duration_sec: number
  answered: boolean
  inferred_summary: string | null
  inferred_topics: string[] | null
  inferred_sentiment: string | null
  inferred_risk_flags: string[] | null
  inferred_product: string | null
  recording_url: string | null
  transcript: string | null
  matched_claim_fsn: string | null
  matched_claim_id: string | null
  match_confidence: 'phone' | 'none'
}

type Meta = {
  total: number
  matched: number
  unmatched: number
  fetched_at: string
}

type ActiveTab  = 'all' | 'linked' | 'inbound' | 'outbound' | 'risk'
type AgentFilter = 'all' | 'cole' | 'shawn'
type DaysFilter  = 1 | 7 | 30

// ─── constants ─────────────────────────────────────────────────────────────────

const AUTH = `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? ''}`

const TABS: { key: ActiveTab; label: string }[] = [
  { key: 'all',      label: 'All' },
  { key: 'linked',   label: 'Linked to claim' },
  { key: 'inbound',  label: 'Inbound' },
  { key: 'outbound', label: 'Outbound' },
  { key: 'risk',     label: 'Risk flagged' },
]

const TH: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-tertiary)',
  padding: '0 10px 10px 0',
  whiteSpace: 'nowrap',
}

// ─── helpers ───────────────────────────────────────────────────────────────────

function formatWhen(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const diffMins = Math.floor(diffMs / 60_000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHrs = Math.floor(diffMins / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  if (diffHrs < 48) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDuration(sec: number, answered: boolean): string {
  if (!answered) return '—'
  if (sec < 60) return `${sec}s`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}m ${s}s`
}

function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
  if (d.length === 11 && d[0] === '1') return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`
  return phone
}

function toTitleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function toFirstName(name: string): string {
  return name.split(' ')[0] ?? name
}

function isRawNumber(s: string | null): boolean {
  return s === null || /^\+?[\d\s\-().]+$/.test(s)
}

function sentimentDot(sentiment: string | null): { color: string; label: string } {
  if (!sentiment) return { color: 'var(--text-tertiary)', label: '—' }
  const s = sentiment.toLowerCase()
  if (s.includes('positive')) return { color: '#4CAF82', label: 'Positive' }
  if (s.includes('negative') || s.includes('frustrated') || s.includes('angry'))
    return { color: '#E84A4A', label: 'Negative' }
  return { color: 'var(--text-tertiary)', label: 'Neutral' }
}

// ─── skeleton ──────────────────────────────────────────────────────────────────

function Skel({ w, h }: { w: number | string; h: number }) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: 4,
        background: 'var(--bg-elevated)',
        animation: 'clpulse 1.5s ease-in-out infinite',
      }}
    />
  )
}

function LoadingSkeleton() {
  return (
    <div style={{ padding: 24 }}>
      <style>{`@keyframes clpulse{0%,100%{opacity:.6}50%{opacity:.3}}`}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Skel w={120} h={22} />
        <Skel w={260} h={14} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[80, 120, 80, 90, 100].map((w, i) => <Skel key={i} w={w} h={32} />)}
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <Skel w={320} h={36} />
        <Skel w={160} h={36} />
        <Skel w={100} h={36} />
      </div>
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '0 0 4px',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12 }}>
          {[28, 90, 52, 80, 160, 70, 72, 90, 140, 200, 90].map((w, i) => (
            <Skel key={i} w={w} h={11} />
          ))}
        </div>
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div
            key={i}
            style={{
              padding: '14px 16px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              gap: 12,
              background: i % 2 === 0 ? 'var(--bg-elevated)' : 'transparent',
            }}
          >
            {[16, 70, 44, 60, 130, 50, 56, 70, 120, 180, 70].map((w, j) => (
              <Skel key={j} w={w} h={13} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── topic pill ────────────────────────────────────────────────────────────────

function TopicPill({ label }: { label: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 10,
        fontWeight: 500,
        padding: '2px 6px',
        borderRadius: 4,
        background: 'rgba(232,200,74,0.12)',
        color: '#E8C84A',
        whiteSpace: 'nowrap',
      }}
    >
      {toTitleCase(label)}
    </span>
  )
}

// ─── expanded row content ──────────────────────────────────────────────────────

function ExpandedRow({
  call,
  colSpan,
  showTranscript,
  onToggleTranscript,
}: {
  call: CallRecord
  colSpan: number
  showTranscript: boolean
  onToggleTranscript: () => void
}) {
  const hasRisk = (call.inferred_risk_flags?.length ?? 0) > 0
  const topics = call.inferred_topics ?? []

  return (
    <tr>
      <td
        colSpan={colSpan}
        style={{
          padding: 0,
          borderLeft: '3px solid #E8C84A',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-elevated)',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '60% 40%',
            padding: '16px 20px 16px 28px',
          }}
        >
          {/* LEFT — summary, risk, transcript */}
          <div style={{ paddingRight: 24 }}>
            {call.inferred_summary && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 6 }}>
                  Summary
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6 }}>
                  {call.inferred_summary}
                </div>
              </div>
            )}

            {hasRisk && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#E84A4A', marginBottom: 4 }}>
                  ⚠ Risk flags
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {(call.inferred_risk_flags ?? []).map((f) => (
                    <span
                      key={f}
                      style={{
                        fontSize: 10,
                        padding: '2px 6px',
                        borderRadius: 4,
                        background: 'rgba(232,74,74,0.15)',
                        color: '#E84A4A',
                        fontWeight: 500,
                      }}
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {call.transcript && (
              <div style={{ marginTop: 12 }}>
                <button
                  onClick={onToggleTranscript}
                  style={{
                    fontSize: 11,
                    color: '#E8C84A',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    textDecoration: 'underline',
                  }}
                >
                  {showTranscript ? 'Transcript ▴' : 'Transcript ▾'}
                </button>
                {showTranscript && (
                  <div
                    style={{
                      marginTop: 8,
                      maxHeight: 180,
                      overflowY: 'auto',
                      padding: '10px 12px',
                      background: 'rgba(0,0,0,0.2)',
                      borderRadius: 6,
                      fontSize: 12,
                      lineHeight: 1.6,
                      color: 'var(--text-secondary)',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {call.transcript}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* RIGHT — topics, recording */}
          <div>
            {topics.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 8 }}>
                  Topics
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {topics.map((t) => (
                    <span
                      key={t}
                      style={{
                        display: 'inline-block',
                        fontSize: 10,
                        fontWeight: 500,
                        padding: '3px 8px',
                        borderRadius: 4,
                        background: 'rgba(232,200,74,0.12)',
                        color: '#E8C84A',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {toTitleCase(t)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {call.recording_url && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 4 }}>
                  Recording
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {call.recording_url}
                </div>
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  )
}

// ─── main page ─────────────────────────────────────────────────────────────────

export default function CallLogsPage() {
  const router = useRouter()

  // data state
  const [calls, setCalls]     = useState<CallRecord[]>([])
  const [meta, setMeta]       = useState<Meta | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  // filter state
  const [activeTab,    setActiveTab]    = useState<ActiveTab>('all')
  const [topicFilter,  setTopicFilter]  = useState<string[]>([])
  const [searchQuery,  setSearchQuery]  = useState('')
  const [agentFilter,  setAgentFilter]  = useState<AgentFilter>('all')
  const [daysFilter,   setDaysFilter]   = useState<DaysFilter>(30)

  // UI state
  const [expandedId,       setExpandedId]       = useState<string | null>(null)
  const [showTranscript,   setShowTranscript]   = useState(false)
  const [topicOpen,        setTopicOpen]        = useState(false)
  const topicRef = useRef<HTMLDivElement>(null)

  // ── fetch ────────────────────────────────────────────────────────────────────

  const fetchCalls = useCallback(async (days: DaysFilter) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/calls?days=${days}`, {
        headers: { Authorization: AUTH },
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as { calls: CallRecord[]; meta: Meta }
      setCalls(data.calls ?? [])
      setMeta(data.meta ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchCalls(daysFilter) }, [daysFilter, fetchCalls])

  // ── close topic dropdown on outside click ────────────────────────────────────

  useEffect(() => {
    if (!topicOpen) return
    function handler(e: MouseEvent) {
      if (topicRef.current && !topicRef.current.contains(e.target as Node)) {
        setTopicOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [topicOpen])

  // ── derived data ─────────────────────────────────────────────────────────────

  const allTopics = useMemo(() => {
    const seen: Record<string, true> = {}
    for (const call of calls) {
      for (const t of call.inferred_topics ?? []) seen[t] = true
    }
    return Object.keys(seen).sort()
  }, [calls])

  const topicCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const call of calls) {
      for (const t of call.inferred_topics ?? []) {
        counts[t] = (counts[t] ?? 0) + 1
      }
    }
    return counts
  }, [calls])

  const filteredCalls = useMemo(() => {
    return calls.filter((call) => {
      if (activeTab === 'linked'   && call.match_confidence !== 'phone') return false
      if (activeTab === 'inbound'  && call.direction !== 'inbound')       return false
      if (activeTab === 'outbound' && call.direction !== 'outbound')      return false
      if (activeTab === 'risk'     && (call.inferred_risk_flags?.length ?? 0) === 0) return false

      if (agentFilter === 'cole'  && !call.agent_name.toLowerCase().includes('cole'))  return false
      if (agentFilter === 'shawn' && !call.agent_name.toLowerCase().includes('shawn')) return false

      if (topicFilter.length > 0) {
        const ct = call.inferred_topics ?? []
        if (!topicFilter.some((t) => ct.includes(t))) return false
      }

      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const match =
          call.caller_name?.toLowerCase().includes(q) ||
          call.caller_phone?.toLowerCase().includes(q) ||
          call.inferred_summary?.toLowerCase().includes(q) ||
          call.matched_claim_fsn?.toLowerCase().includes(q)
        if (!match) return false
      }

      return true
    })
  }, [calls, activeTab, agentFilter, topicFilter, searchQuery])

  // ── expand helpers ────────────────────────────────────────────────────────────

  function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null)
      setShowTranscript(false)
    } else {
      setExpandedId(id)
      setShowTranscript(false)
    }
  }

  // ── day filter change ─────────────────────────────────────────────────────────

  function handleDaysChange(d: DaysFilter) {
    setDaysFilter(d)
    setExpandedId(null)
  }

  // ── topic toggle ──────────────────────────────────────────────────────────────

  function toggleTopic(t: string) {
    setTopicFilter((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    )
  }

  // ── clear filters ─────────────────────────────────────────────────────────────

  function clearFilters() {
    setActiveTab('all')
    setTopicFilter([])
    setSearchQuery('')
    setAgentFilter('all')
  }

  // ── loading / error states ────────────────────────────────────────────────────

  if (loading) return <LoadingSkeleton />

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <div
          style={{
            background: 'rgba(232,74,74,0.08)',
            border: '1px solid rgba(232,74,74,0.35)',
            borderRadius: 6,
            padding: '20px 24px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 600, color: '#E84A4A' }}>Failed to load call logs</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{error}</div>
          <button
            onClick={() => void fetchCalls(daysFilter)}
            style={{
              alignSelf: 'flex-start',
              marginTop: 4,
              padding: '8px 18px',
              fontSize: 13,
              fontWeight: 500,
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const displayedCalls = filteredCalls.slice(0, 200)
  const COL_COUNT = 11

  return (
    <div style={{ padding: 24 }}>
      <style>{`@keyframes clpulse{0%,100%{opacity:.6}50%{opacity:.3}}`}</style>

      {/* ── page header ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Call Logs
        </h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {meta && (
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              {meta.total} calls · {meta.matched} linked to claims · Last {daysFilter}d
            </span>
          )}
          <div style={{ display: 'flex', gap: 2 }}>
            {([1, 7, 30] as DaysFilter[]).map((d) => {
              const active = daysFilter === d
              return (
                <button
                  key={d}
                  onClick={() => handleDaysChange(d)}
                  style={{
                    padding: '4px 10px',
                    fontSize: 12,
                    fontWeight: active ? 600 : 400,
                    background: 'transparent',
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    border: 'none',
                    borderBottom: active ? '2px solid #E8C84A' : '2px solid transparent',
                    cursor: 'pointer',
                  }}
                >
                  {d}d
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── tabs ─────────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
        {TABS.map(({ key, label }) => {
          const active = activeTab === key
          return (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              style={{
                padding: '8px 20px',
                fontSize: 14,
                fontWeight: active ? 600 : 400,
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: 'transparent',
                border: 'none',
                borderBottom: active ? '2px solid #E8C84A' : '2px solid transparent',
                cursor: 'pointer',
                marginBottom: -1,
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* ── secondary filters ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* search */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by caller, number, FSN, or summary..."
            style={{
              width: 320,
              padding: '7px 12px',
              fontSize: 13,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          />

          {/* agent pills */}
          <div style={{ display: 'flex', gap: 2 }}>
            {(['all', 'cole', 'shawn'] as AgentFilter[]).map((a) => {
              const active = agentFilter === a
              const label = a === 'all' ? 'All agents' : a === 'cole' ? 'Cole' : 'Shawn'
              return (
                <button
                  key={a}
                  onClick={() => setAgentFilter(a)}
                  style={{
                    padding: '5px 12px',
                    fontSize: 12,
                    fontWeight: active ? 600 : 400,
                    background: active ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                    color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                    border: `1px solid ${active ? 'var(--border-bright)' : 'var(--border)'}`,
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* topic dropdown */}
        {allTopics.length > 0 && (
          <div ref={topicRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setTopicOpen((p) => !p)}
              style={{
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 500,
                background: topicFilter.length > 0 ? 'rgba(232,200,74,0.1)' : 'var(--bg-elevated)',
                color: topicFilter.length > 0 ? '#E8C84A' : 'white',
                border: `1px solid ${topicFilter.length > 0 ? '#E8C84A' : 'var(--border-bright)'}`,
                borderRadius: 8,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              {topicFilter.length > 0 ? `Topics (${topicFilter.length}) ▾` : 'Topics ▾'}
            </button>

            {topicOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 4,
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-bright)',
                  borderRadius: 10,
                  padding: 8,
                  minWidth: 220,
                  maxHeight: 280,
                  overflowY: 'auto',
                  zIndex: 50,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                }}
              >
                {topicFilter.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
                    <button
                      onClick={() => setTopicFilter([])}
                      style={{ fontSize: 11, color: '#E8C84A', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                    >
                      Clear all
                    </button>
                  </div>
                )}
                {allTopics.map((t) => {
                  const checked = topicFilter.includes(t)
                  const count = topicCounts[t] ?? 0
                  return (
                    <label
                      key={t}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 8px',
                        fontSize: 12,
                        color: 'var(--text-primary)',
                        cursor: 'pointer',
                        borderRadius: 6,
                        background: checked ? 'rgba(255,255,255,0.06)' : 'transparent',
                      }}
                      onMouseEnter={(e) => {
                        if (!checked) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'
                      }}
                      onMouseLeave={(e) => {
                        if (!checked) (e.currentTarget as HTMLElement).style.background = 'transparent'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTopic(t)}
                        style={{ accentColor: '#E8C84A' }}
                      />
                      <span style={{ flex: 1 }}>{toTitleCase(t)}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>({count})</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── table ────────────────────────────────────────────────────────────── */}
      {filteredCalls.length === 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '60px 24px',
            gap: 12,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 6,
          }}
        >
          <div style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>
            No calls match the current filters.
          </div>
          <button
            onClick={clearFilters}
            style={{
              padding: '6px 16px',
              fontSize: 13,
              fontWeight: 500,
              background: 'var(--bg-elevated)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          {filteredCalls.length > 200 && (
            <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
              Showing first 200 results — refine filters to narrow.
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 960 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ ...TH, width: 28, padding: '0 0 10px 16px' }} />
                  <th style={{ ...TH, width: 90 }}>When</th>
                  <th style={{ ...TH, width: 52 }}>Dir</th>
                  <th style={{ ...TH, width: 80 }}>Line</th>
                  <th style={{ ...TH, width: 160 }}>Caller</th>
                  <th style={{ ...TH, width: 70 }}>Agent</th>
                  <th style={{ ...TH, width: 72 }}>Duration</th>
                  <th style={{ ...TH, width: 100 }}>Sentiment</th>
                  <th style={{ ...TH, width: 150 }}>Topics</th>
                  <th style={{ ...TH }}>Summary</th>
                  <th style={{ ...TH, width: 90 }}>Claim</th>
                </tr>
              </thead>

              <tbody>
                {displayedCalls.map((call, idx) => {
                  const expanded = expandedId === call.id
                  const rowBg = idx % 2 === 0 ? 'var(--bg-elevated)' : 'transparent'
                  const { color: sentColor, label: sentLabel } = sentimentDot(call.inferred_sentiment)
                  const hasRisk = (call.inferred_risk_flags?.length ?? 0) > 0
                  const topics = call.inferred_topics ?? []
                  const shownTopics = topics.slice(0, 2)
                  const extraTopics = topics.length - 2

                  const callerLooksLikeNumber = isRawNumber(call.caller_name)
                  const formattedPhone = formatPhone(call.caller_phone)

                  const td = (extra: React.CSSProperties = {}): React.CSSProperties => ({
                    padding: '12px 10px 12px 0',
                    verticalAlign: 'top',
                    borderBottom: expanded ? 'none' : '0.5px solid var(--border)',
                    background: rowBg,
                    ...extra,
                  })

                  return (
                    <>
                      <tr
                        key={call.id}
                        style={{ cursor: 'default' }}
                        onMouseEnter={(e) => {
                          const cells = (e.currentTarget as HTMLElement).querySelectorAll('td')
                          cells.forEach((c) => ((c as HTMLElement).style.filter = 'brightness(1.06)'))
                        }}
                        onMouseLeave={(e) => {
                          const cells = (e.currentTarget as HTMLElement).querySelectorAll('td')
                          cells.forEach((c) => ((c as HTMLElement).style.filter = ''))
                        }}
                      >
                        {/* expand chevron */}
                        <td style={td({ paddingLeft: 16, paddingRight: 0, width: 28 })}>
                          <button
                            onClick={() => toggleExpand(call.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: 10,
                              color: 'var(--text-tertiary)',
                              padding: 0,
                              lineHeight: 1,
                              display: 'inline-block',
                              transition: 'transform 0.15s',
                              transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
                            }}
                          >
                            ▸
                          </button>
                        </td>

                        {/* WHEN */}
                        <td style={td({ fontSize: 12, color: 'var(--text-tertiary)' })}>
                          {formatWhen(call.started_at)}
                        </td>

                        {/* DIR */}
                        <td style={td()}>
                          <span
                            style={{
                              display: 'inline-block',
                              fontSize: 10,
                              fontWeight: 700,
                              letterSpacing: '0.04em',
                              padding: '2px 6px',
                              borderRadius: 4,
                              width: 36,
                              textAlign: 'center',
                              background:
                                call.direction === 'inbound'
                                  ? 'rgba(42,120,214,0.2)'
                                  : 'rgba(232,200,74,0.2)',
                              color:
                                call.direction === 'inbound' ? '#6aaef5' : '#E8C84A',
                            }}
                          >
                            {call.direction === 'inbound' ? 'IN' : 'OUT'}
                          </span>
                        </td>

                        {/* LINE */}
                        <td style={td({ fontSize: 12, color: 'var(--text-tertiary)' })}>
                          {call.did_label || '—'}
                        </td>

                        {/* CALLER */}
                        <td style={td()}>
                          {!callerLooksLikeNumber && call.caller_name && (
                            <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>
                              {call.caller_name}
                            </div>
                          )}
                          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                            {formattedPhone}
                          </div>
                        </td>

                        {/* AGENT */}
                        <td style={td({ fontSize: 12, color: 'var(--text-tertiary)' })}>
                          {toFirstName(call.agent_name)}
                        </td>

                        {/* DURATION */}
                        <td style={td({ fontSize: 12, color: call.answered ? 'var(--text-primary)' : 'var(--text-tertiary)' })}>
                          {formatDuration(call.duration_sec, call.answered)}
                        </td>

                        {/* SENTIMENT */}
                        <td style={td()}>
                          {call.inferred_sentiment === null ? (
                            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>—</span>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span
                                style={{
                                  width: 7,
                                  height: 7,
                                  borderRadius: '50%',
                                  background: sentColor,
                                  display: 'inline-block',
                                  flexShrink: 0,
                                }}
                              />
                              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                {sentLabel}
                              </span>
                              {hasRisk && (
                                <span
                                  title={(call.inferred_risk_flags ?? []).join(', ')}
                                  style={{ color: '#E84A4A', fontSize: 12, cursor: 'help' }}
                                >
                                  ⚠
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        {/* TOPICS */}
                        <td style={td()}>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {shownTopics.map((t) => <TopicPill key={t} label={t} />)}
                            {extraTopics > 0 && (
                              <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                                +{extraTopics}
                              </span>
                            )}
                            {topics.length === 0 && (
                              <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>—</span>
                            )}
                          </div>
                        </td>

                        {/* SUMMARY */}
                        <td
                          style={td({ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 240 })}
                          title={call.inferred_summary ?? ''}
                        >
                          {call.inferred_summary
                            ? call.inferred_summary.length > 80
                              ? call.inferred_summary.slice(0, 80) + '…'
                              : call.inferred_summary
                            : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                        </td>

                        {/* CLAIM */}
                        <td style={td({ paddingRight: 16 })}>
                          {call.matched_claim_fsn ? (
                            <button
                              onClick={() => router.push(`/claims?claim=${encodeURIComponent(call.matched_claim_fsn!)}`)}
                              style={{
                                fontSize: 11,
                                fontWeight: 500,
                                padding: '3px 8px',
                                borderRadius: 6,
                                background: 'rgba(42,120,214,0.15)',
                                color: '#6aaef5',
                                border: 'none',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {call.matched_claim_fsn}
                            </button>
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>—</span>
                          )}
                        </td>
                      </tr>

                      {expanded && (
                        <ExpandedRow
                          call={call}
                          colSpan={COL_COUNT}
                          showTranscript={showTranscript}
                          onToggleTranscript={() => setShowTranscript((p) => !p)}
                        />
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
