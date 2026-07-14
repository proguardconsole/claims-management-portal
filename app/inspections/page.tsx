'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { FileText, ExternalLink } from 'lucide-react'

// ─── types ─────────────────────────────────────────────────────────────────────

type Inspection = {
  id: string
  name: string | null
  stage: string | null
  closing_date: string | null
  inspection_date: string | null
  inspection_result: string | null
  mobile_home_park_name: string | null
  mobile_home_park_id: string | null
  park_inspection_name: string | null
  park_inspection_id: string | null
  location_id: string | null
  system_id: string | null
  provider_contact: string | null
  provider_login: string | null
  phone: string | null
  street: string | null
  state: string | null
  zip: string | null
  owner_name: string | null
  owner_id: string | null
  contact_name: string | null
  contact_id: string | null
  created_time: string | null
  modified_time: string | null
}

type DatePreset = 'all' | 'week' | 'month' | 'quarter' | 'custom'

// ─── helpers ───────────────────────────────────────────────────────────────────

function formatDate(isoStr: string | null): string {
  if (!isoStr) return '—'
  return new Date(isoStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatMonthYear(isoStr: string | null): string {
  if (!isoStr) return '—'
  return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function stageColor(stage: string | null): string {
  if (!stage) return 'var(--text-tertiary)'
  const s = stage.toLowerCase()
  if (s === 'complete') return 'var(--accent-green)'
  if (s === 'inspection performed') return 'var(--accent-amber)'
  return 'var(--text-secondary)'
}

function stageBorderColor(stage: string | null): string {
  if (!stage) return 'var(--border)'
  const s = stage.toLowerCase()
  if (s === 'complete') return 'var(--accent-green)'
  if (s === 'inspection performed') return 'var(--accent-amber)'
  return 'var(--border)'
}

function resultStyle(result: string | null): { color: string; border: string } {
  if (!result) return { color: 'var(--text-tertiary)', border: 'var(--border)' }
  const r = result.toLowerCase()
  if (r === 'approved') return { color: 'var(--accent-green)', border: 'var(--accent-green)' }
  if (r === 'repairs needed') return { color: 'var(--accent-amber)', border: 'var(--accent-amber)' }
  if (r === 'tank replacement needed') return { color: 'var(--accent-red)', border: 'var(--accent-red)' }
  return { color: 'var(--text-tertiary)', border: 'var(--border)' }
}

function presetDates(preset: DatePreset): { from: string; to: string } | null {
  if (preset === 'all' || preset === 'custom') return null
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  if (preset === 'week') {
    const day = now.getDay()
    const start = new Date(now)
    start.setDate(now.getDate() - day)
    return { from: iso(start), to: iso(now) }
  }
  if (preset === 'month') {
    return { from: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`, to: iso(now) }
  }
  if (preset === 'quarter') {
    const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)
    return { from: iso(qStart), to: iso(now) }
  }
  return null
}

// ─── sub-components ────────────────────────────────────────────────────────────

function InfoLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--text-tertiary)',
        marginBottom: 2,
      }}
    >
      {children}
    </div>
  )
}

function InfoValue({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 12 }}>
      {children || '—'}
    </div>
  )
}

function StageBadge({ stage }: { stage: string | null }) {
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: stageColor(stage),
        border: `1px solid ${stageBorderColor(stage)}`,
        borderRadius: 3,
        padding: '2px 7px',
        whiteSpace: 'nowrap',
      }}
    >
      {stage ?? '—'}
    </span>
  )
}

function ResultBadge({ result }: { result: string | null }) {
  const { color, border } = resultStyle(result)
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        color,
        border: `1px solid ${border}`,
        borderRadius: 3,
        padding: '2px 7px',
        whiteSpace: 'nowrap',
      }}
    >
      {result ?? '—'}
    </span>
  )
}

function InspectionRow({
  inspection,
  selected,
  onClick,
}: {
  inspection: Inspection
  selected: boolean
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        borderLeft: selected
          ? '3px solid var(--accent-yellow)'
          : '3px solid transparent',
        background:
          selected || hovered ? 'var(--bg-elevated)' : 'var(--bg-surface)',
        cursor: 'pointer',
        transition: 'background 0.1s',
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: 'var(--text-primary)',
          fontWeight: 500,
          marginBottom: 3,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {inspection.street ?? inspection.name ?? '—'}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 3,
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: 'var(--accent-yellow)',
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            marginRight: 8,
          }}
        >
          {inspection.mobile_home_park_name ?? '—'}
        </span>
        <StageBadge stage={inspection.stage} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          {formatMonthYear(inspection.closing_date)}
          {inspection.state ? ` · ${inspection.state}` : ''}
        </span>
        {inspection.inspection_result && (
          <ResultBadge result={inspection.inspection_result} />
        )}
      </div>
    </div>
  )
}

// ─── ParkCombobox ───────────────────────────────────────────────────────────────

function ParkCombobox({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = options.filter((o) => o.toLowerCase().includes(query.toLowerCase())).slice(0, 40)

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '5px 8px',
    fontSize: 11,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    color: 'var(--text-primary)',
    outline: 'none',
    boxSizing: 'border-box',
  }

  if (value) {
    return (
      <div ref={containerRef} style={{ position: 'relative' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '3px 8px',
            fontSize: 11,
            fontWeight: 600,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-bright)',
            borderRadius: 4,
            color: 'var(--text-primary)',
            cursor: 'default',
            maxWidth: '100%',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
            {value}
          </span>
          <button
            onClick={() => { onChange(''); setQuery('') }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-tertiary)',
              fontSize: 13,
              lineHeight: 1,
              padding: 0,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        type="text"
        value={query}
        placeholder="Filter by park…"
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        style={inputStyle}
      />
      {open && filtered.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 100,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-bright)',
            borderRadius: 4,
            maxHeight: 200,
            overflowY: 'auto',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
          }}
        >
          {filtered.map((o) => (
            <div
              key={o}
              onMouseDown={(e) => { e.preventDefault(); onChange(o); setQuery(''); setOpen(false) }}
              style={{
                padding: '6px 10px',
                fontSize: 11,
                cursor: 'pointer',
                color: 'var(--text-primary)',
                borderBottom: '1px solid var(--border)',
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLDivElement).style.background = 'var(--bg-surface)'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLDivElement).style.background = 'transparent'
              }}
            >
              {o}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── FilterBar ──────────────────────────────────────────────────────────────────

const STATE_PILLS = ['CT', 'MA', 'MD', 'NJ', 'NY', 'PA']

const SORT_OPTIONS = [
  { value: 'closing_date_desc', label: 'Closing Date: Newest' },
  { value: 'closing_date_asc', label: 'Closing Date: Oldest' },
  { value: 'inspection_date_desc', label: 'Insp. Date: Newest' },
  { value: 'inspection_date_asc', label: 'Insp. Date: Oldest' },
]

function FilterBar({
  stageFilter,
  setStageFilter,
  stateFilter,
  setStateFilter,
  resultFilter,
  setResultFilter,
  parkFilter,
  setParkFilter,
  datePreset,
  setDatePreset,
  customFrom,
  setCustomFrom,
  customTo,
  setCustomTo,
  inspDateFrom,
  setInspDateFrom,
  inspDateTo,
  setInspDateTo,
  sortOrder,
  setSortOrder,
  search,
  setSearch,
  stages,
  counts,
  staleFilter,
  setStaleFilter,
  staleCount,
  resultCounts,
  parkOptions,
}: {
  stageFilter: string
  setStageFilter: (s: string) => void
  stateFilter: string
  setStateFilter: (s: string) => void
  resultFilter: string
  setResultFilter: (s: string) => void
  parkFilter: string
  setParkFilter: (s: string) => void
  datePreset: DatePreset
  setDatePreset: (p: DatePreset) => void
  customFrom: string
  setCustomFrom: (s: string) => void
  customTo: string
  setCustomTo: (s: string) => void
  inspDateFrom: string
  setInspDateFrom: (s: string) => void
  inspDateTo: string
  setInspDateTo: (s: string) => void
  sortOrder: string
  setSortOrder: (s: string) => void
  search: string
  setSearch: (s: string) => void
  stages: string[]
  counts: Record<string, number>
  staleFilter: boolean
  setStaleFilter: (v: boolean) => void
  staleCount: number
  resultCounts: Record<string, number>
  parkOptions: string[]
}) {
  const allTabs = ['all', ...stages]
  const presets: { key: DatePreset; label: string }[] = [
    { key: 'all', label: 'All time' },
    { key: 'week', label: 'This week' },
    { key: 'month', label: 'This month' },
    { key: 'quarter', label: 'This quarter' },
    { key: 'custom', label: 'Custom' },
  ]

  const inputStyle: React.CSSProperties = {
    padding: '4px 8px',
    fontSize: 11,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    color: 'var(--text-primary)',
    outline: 'none',
  }

  const selectStyle: React.CSSProperties = {
    flex: 1,
    padding: '4px 6px',
    fontSize: 11,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    color: 'var(--text-primary)',
    outline: 'none',
    cursor: 'pointer',
  }

  return (
    <div
      style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-header)',
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* Stage toggles */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {allTabs.map((s) => {
          const active = stageFilter === s
          const label = s === 'all' ? 'All' : s
          const count = counts[s] ?? 0
          return (
            <button
              key={s}
              onClick={() => setStageFilter(s)}
              style={{
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: active ? 700 : 500,
                cursor: 'pointer',
                background: active ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: `1px solid ${active ? 'var(--border-bright)' : 'var(--border)'}`,
                borderLeft: active ? '3px solid var(--accent-yellow)' : '3px solid transparent',
                borderRadius: 4,
                whiteSpace: 'nowrap',
              }}
            >
              {label} · {count}
            </button>
          )
        })}
        <button
          onClick={() => setStaleFilter(!staleFilter)}
          style={{
            marginLeft: 4,
            padding: '4px 10px',
            fontSize: 11,
            fontWeight: staleFilter ? 700 : 500,
            cursor: 'pointer',
            background: staleFilter ? '#7f1d1d' : 'transparent',
            color: staleFilter ? '#fca5a5' : '#f87171',
            border: `1px solid ${staleFilter ? '#dc2626' : 'rgba(239,68,68,0.4)'}`,
            borderLeft: staleFilter ? '3px solid #dc2626' : '3px solid rgba(239,68,68,0.3)',
            borderRadius: 4,
            whiteSpace: 'nowrap',
          }}
        >
          Stale · {staleCount.toLocaleString()}
        </button>
      </div>

      {/* State pills */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', marginRight: 2 }}>
          State
        </span>
        {STATE_PILLS.map((st) => {
          const active = stateFilter === st
          return (
            <button
              key={st}
              onClick={() => setStateFilter(active ? 'all' : st)}
              style={{
                padding: '3px 8px',
                fontSize: 11,
                fontWeight: active ? 700 : 400,
                cursor: 'pointer',
                background: active ? 'var(--bg-elevated)' : 'transparent',
                color: active ? 'var(--accent-yellow)' : 'var(--text-tertiary)',
                border: `1px solid ${active ? 'var(--accent-yellow)' : 'transparent'}`,
                borderRadius: 4,
              }}
            >
              {st}
            </button>
          )
        })}
      </div>

      {/* Closing date preset row */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', marginRight: 2 }}>
          Close
        </span>
        {presets.map(({ key, label }) => {
          const active = datePreset === key
          return (
            <button
              key={key}
              onClick={() => setDatePreset(key)}
              style={{
                padding: '3px 8px',
                fontSize: 11,
                fontWeight: active ? 700 : 400,
                cursor: 'pointer',
                background: active ? 'var(--bg-elevated)' : 'transparent',
                color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
                border: `1px solid ${active ? 'var(--border)' : 'transparent'}`,
                borderRadius: 4,
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* Custom closing date inputs */}
      {datePreset === 'custom' && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="date"
            value={customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            style={inputStyle}
          />
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>to</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            style={inputStyle}
          />
        </div>
      )}

      {/* Inspection date range */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0 }}>
          Insp.
        </span>
        <input
          type="date"
          value={inspDateFrom}
          onChange={(e) => setInspDateFrom(e.target.value)}
          style={{ ...inputStyle, flex: 1 }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>to</span>
        <input
          type="date"
          value={inspDateTo}
          onChange={(e) => setInspDateTo(e.target.value)}
          style={{ ...inputStyle, flex: 1 }}
        />
        {(inspDateFrom || inspDateTo) && (
          <button
            onClick={() => { setInspDateFrom(''); setInspDateTo('') }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 13, padding: 0 }}
          >
            ×
          </button>
        )}
      </div>

      {/* Result + Sort row */}
      <div style={{ display: 'flex', gap: 6 }}>
        <select
          value={resultFilter}
          onChange={(e) => setResultFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="">All results</option>
          {Object.entries(resultCounts)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([r, c]) => (
              <option key={r} value={r}>{r} ({c.toLocaleString()})</option>
            ))}
        </select>
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          style={selectStyle}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Park combobox */}
      <ParkCombobox value={parkFilter} onChange={setParkFilter} options={parkOptions} />

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search address, contact…"
        style={{
          width: '100%',
          padding: '6px 10px',
          fontSize: 12,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          color: 'var(--text-primary)',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

function EmptyState() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 12,
        color: 'var(--text-tertiary)',
      }}
    >
      <FileText size={44} style={{ opacity: 0.3 }} />
      <div style={{ fontSize: 14, fontWeight: 500 }}>Select an inspection to view details</div>
      <div
        style={{
          fontSize: 12,
          opacity: 0.6,
          textAlign: 'center',
          maxWidth: 240,
          lineHeight: 1.5,
        }}
      >
        Click any inspection in the list to see details and park history
      </div>
    </div>
  )
}

function ParkHistory({
  currentId,
  parkId,
  parkName,
}: {
  currentId: string
  parkId: string
  parkName: string
}) {
  const [history, setHistory] = useState<Inspection[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/internal/inspections?park_id=${encodeURIComponent(parkId)}&limit=10`)
      .then((r) => r.json())
      .then((d: { inspections: Inspection[] }) =>
        setHistory(
          (d.inspections ?? [])
            .sort((a, b) => {
              const da = a.closing_date ?? ''
              const db = b.closing_date ?? ''
              return db.localeCompare(da)
            })
            .slice(0, 10),
        ),
      )
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [parkId])

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '14px 20px',
        marginBottom: 14,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-secondary)',
          marginBottom: 14,
        }}
      >
        {parkName} — Inspection History
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Loading...</div>
      ) : history.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No history found</div>
      ) : (
        <div style={{ position: 'relative', paddingLeft: 18 }}>
          <div
            style={{
              position: 'absolute',
              left: 3,
              top: 6,
              bottom: 6,
              width: 1,
              background: 'var(--border)',
            }}
          />
          {history.map((h) => {
            const isCurrent = h.id === currentId
            return (
              <div
                key={h.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  marginBottom: 10,
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: -15,
                    top: 3,
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: isCurrent ? 'var(--accent-yellow)' : 'var(--bg-elevated)',
                    border: `2px solid ${isCurrent ? 'var(--accent-yellow)' : 'var(--border-bright)'}`,
                  }}
                />
                <div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: isCurrent ? 600 : 400,
                      color: isCurrent ? 'var(--accent-yellow)' : 'var(--text-primary)',
                      marginBottom: 1,
                    }}
                  >
                    {formatMonthYear(h.closing_date)}{' '}
                    <span style={{ fontSize: 11, color: stageColor(h.stage), fontWeight: 400 }}>
                      — {h.stage ?? '?'}
                    </span>
                    {isCurrent && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 10,
                          color: 'var(--text-tertiary)',
                          fontWeight: 400,
                        }}
                      >
                        (current)
                      </span>
                    )}
                  </div>
                  {h.street && (
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{h.street}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function InspectionDetail({ inspection }: { inspection: Inspection }) {
  const zohoUrl = `https://crm.zoho.com/crm/org884788391/tab/Inspections/${inspection.id}`

  return (
    <div style={{ padding: 24, maxWidth: 780 }}>
      {/* A — Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 20,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 14,
              color: 'var(--text-primary)',
              fontWeight: 600,
              marginBottom: 6,
              lineHeight: 1.4,
              maxWidth: 520,
            }}
          >
            {inspection.name ?? '—'}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <StageBadge stage={inspection.stage} />
            {inspection.inspection_result && (
              <ResultBadge result={inspection.inspection_result} />
            )}
          </div>
        </div>
        <a
          href={zohoUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '6px 12px',
            fontSize: 12,
            color: 'var(--text-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            textDecoration: 'none',
            flexShrink: 0,
            marginLeft: 16,
          }}
        >
          CRM <ExternalLink size={11} />
        </a>
      </div>

      {/* B — Park info box */}
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '14px 20px',
          marginBottom: 14,
        }}
      >
        <InfoLabel>Mobile Home Park</InfoLabel>
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--accent-yellow)',
            marginBottom: 12,
          }}
        >
          {inspection.mobile_home_park_name ?? '—'}
        </div>

        <InfoLabel>Parent Inspection</InfoLabel>
        <InfoValue>{inspection.park_inspection_name}</InfoValue>

        <InfoLabel>Street</InfoLabel>
        <InfoValue>{inspection.street}</InfoValue>

        <div style={{ display: 'flex', gap: 32 }}>
          <div>
            <InfoLabel>State</InfoLabel>
            <InfoValue>{inspection.state}</InfoValue>
          </div>
          <div>
            <InfoLabel>Zip</InfoLabel>
            <InfoValue>{inspection.zip}</InfoValue>
          </div>
        </div>
      </div>

      {/* C — Details grid */}
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '16px 20px',
          marginBottom: 14,
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px' }}>
          <div>
            <InfoLabel>Stage</InfoLabel>
            <InfoValue>{inspection.stage}</InfoValue>

            <InfoLabel>Inspection Result</InfoLabel>
            <div style={{ marginBottom: 12 }}>
              <ResultBadge result={inspection.inspection_result} />
            </div>

            <InfoLabel>Inspection Date</InfoLabel>
            <InfoValue>{formatDate(inspection.inspection_date)}</InfoValue>

            <InfoLabel>Closing Date</InfoLabel>
            <InfoValue>{formatDate(inspection.closing_date)}</InfoValue>

            <InfoLabel>Inspector</InfoLabel>
            <InfoValue>{inspection.provider_contact}</InfoValue>

            <InfoLabel>Contact Email</InfoLabel>
            <InfoValue>{inspection.provider_login}</InfoValue>

            <InfoLabel>Phone</InfoLabel>
            <InfoValue>{inspection.phone}</InfoValue>
          </div>
          <div>
            <InfoLabel>Owner</InfoLabel>
            <InfoValue>{inspection.owner_name}</InfoValue>

            <InfoLabel>Contact</InfoLabel>
            <InfoValue>{inspection.contact_name}</InfoValue>

            <InfoLabel>Created</InfoLabel>
            <InfoValue>{formatDate(inspection.created_time)}</InfoValue>

            <InfoLabel>Last Updated</InfoLabel>
            <InfoValue>{formatDate(inspection.modified_time)}</InfoValue>
          </div>
        </div>
      </div>

      {/* D — Park history */}
      {inspection.mobile_home_park_id && (
        <ParkHistory
          currentId={inspection.id}
          parkId={inspection.mobile_home_park_id}
          parkName={inspection.mobile_home_park_name ?? 'Park'}
        />
      )}
    </div>
  )
}

// ─── main page ─────────────────────────────────────────────────────────────────

export default function InspectionsPage() {
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [stages, setStages] = useState<string[]>([])
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({})
  const [totalCount, setTotalCount] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loading, setLoading] = useState(true)

  const [stageFilter, setStageFilter] = useState('all')
  const [stateFilter, setStateFilter] = useState('all')
  const [resultFilter, setResultFilter] = useState('')
  const [parkFilter, setParkFilter] = useState('')
  const [datePreset, setDatePreset] = useState<DatePreset>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [inspDateFrom, setInspDateFrom] = useState('')
  const [inspDateTo, setInspDateTo] = useState('')
  const [sortOrder, setSortOrder] = useState('closing_date_desc')
  const [search, setSearch] = useState('')
  const [selectedInspection, setSelectedInspection] = useState<Inspection | null>(null)
  const [resultCounts, setResultCounts] = useState<Record<string, number>>({})
  const [staleCount, setStaleCount] = useState(0)
  const [staleFilter, setStaleFilter] = useState(false)
  const [parkOptions, setParkOptions] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/internal/inspections?meta=1')
      .then((r) => r.json())
      .then((d: { stages: Record<string, number>; results: Record<string, number>; parks: string[]; stale_count: number; total: number }) => {
        setStageCounts(d.stages ?? {})
        setTotalCount(d.total ?? 0)
        setStages(Object.keys(d.stages ?? {}).sort())
        setResultCounts(d.results ?? {})
        setParkOptions(d.parks ?? [])
        setStaleCount(d.stale_count ?? 0)
      })
      .catch(console.error)
  }, [])

  const buildParams = useCallback((extra: Record<string, string> = {}): URLSearchParams => {
    const params = new URLSearchParams()
    if (stageFilter !== 'all') params.set('stage', stageFilter)
    if (stateFilter !== 'all') params.set('state', stateFilter)
    if (resultFilter) params.set('inspection_result', resultFilter)
    if (parkFilter) params.set('park', parkFilter)
    if (staleFilter) params.set('stale', '1')
    if (search) params.set('search', search)
    params.set('sort', sortOrder)
    params.set('limit', '100')

    const dates = presetDates(datePreset)
    if (dates) {
      params.set('from', dates.from)
      params.set('to', dates.to)
    } else if (datePreset === 'custom') {
      if (customFrom) params.set('from', customFrom)
      if (customTo) params.set('to', customTo)
    }

    if (inspDateFrom) params.set('date_from', inspDateFrom)
    if (inspDateTo) params.set('date_to', inspDateTo)

    for (const [k, v] of Object.entries(extra)) params.set(k, v)
    return params
  }, [stageFilter, stateFilter, resultFilter, parkFilter, staleFilter, datePreset, customFrom, customTo, inspDateFrom, inspDateTo, sortOrder, search])

  const fetchInspections = useCallback(() => {
    setLoading(true)
    fetch(`/api/internal/inspections?${buildParams().toString()}`)
      .then((r) => r.json())
      .then((d: { inspections: Inspection[] }) => {
        const list = d.inspections ?? []
        setInspections(list)
        setHasMore(list.length === 100)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [buildParams])

  useEffect(() => {
    fetchInspections()
  }, [fetchInspections])

  const loadMore = useCallback(() => {
    setLoadingMore(true)
    const params = buildParams({ offset: String(inspections.length) })
    fetch(`/api/internal/inspections?${params.toString()}`)
      .then((r) => r.json())
      .then((d: { inspections: Inspection[] }) => {
        const newList = d.inspections ?? []
        setInspections((prev) => [...prev, ...newList])
        setHasMore(newList.length === 100)
      })
      .catch(console.error)
      .finally(() => setLoadingMore(false))
  }, [buildParams, inspections.length])

  const counts: Record<string, number> = { all: totalCount, ...stageCounts }

  return (
    <div
      style={{
        display: 'flex',
        height: 'calc(100vh - 52px)',
        margin: '-24px',
        overflow: 'hidden',
      }}
    >
      {/* ── Left panel ── */}
      <div
        style={{
          width: 420,
          flexShrink: 0,
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: 'var(--bg-surface)',
        }}
      >
        <FilterBar
          stageFilter={stageFilter}
          setStageFilter={setStageFilter}
          stateFilter={stateFilter}
          setStateFilter={setStateFilter}
          resultFilter={resultFilter}
          setResultFilter={setResultFilter}
          parkFilter={parkFilter}
          setParkFilter={setParkFilter}
          datePreset={datePreset}
          setDatePreset={setDatePreset}
          customFrom={customFrom}
          setCustomFrom={setCustomFrom}
          customTo={customTo}
          setCustomTo={setCustomTo}
          inspDateFrom={inspDateFrom}
          setInspDateFrom={setInspDateFrom}
          inspDateTo={inspDateTo}
          setInspDateTo={setInspDateTo}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
          search={search}
          setSearch={setSearch}
          stages={stages}
          counts={counts}
          staleFilter={staleFilter}
          setStaleFilter={setStaleFilter}
          staleCount={staleCount}
          resultCounts={resultCounts}
          parkOptions={parkOptions}
        />

        {/* Inspection list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 24, color: 'var(--text-tertiary)', fontSize: 13 }}>
              Loading inspections...
            </div>
          ) : inspections.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--text-tertiary)', fontSize: 13 }}>
              No inspections match current filters.
            </div>
          ) : (
            <>
              {inspections.map((insp) => (
                <InspectionRow
                  key={insp.id}
                  inspection={insp}
                  selected={selectedInspection?.id === insp.id}
                  onClick={() => setSelectedInspection(insp)}
                />
              ))}
              {hasMore && (
                <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    style={{
                      width: '100%',
                      padding: '7px 0',
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: loadingMore ? 'default' : 'pointer',
                      background: 'var(--bg-surface)',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: 4,
                      opacity: loadingMore ? 0.6 : 1,
                    }}
                  >
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Summary footer */}
        <div
          style={{
            padding: '7px 14px',
            borderTop: '1px solid var(--border)',
            fontSize: 11,
            color: 'var(--text-tertiary)',
            background: 'var(--bg-header)',
            flexShrink: 0,
            lineHeight: 1.6,
          }}
        >
          <div>
            {inspections.length} of {totalCount} inspections
          </div>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          background: 'var(--bg-base)',
        }}
      >
        {selectedInspection ? (
          <InspectionDetail inspection={selectedInspection} />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  )
}
