'use client'

import { useEffect, useState, useCallback } from 'react'
import { FileText, ExternalLink } from 'lucide-react'

// ─── types ─────────────────────────────────────────────────────────────────────

type Inspection = {
  id: string
  name: string | null
  stage: string | null
  closing_date: string | null
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
      {/* Row 1 — street name */}
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

      {/* Row 2 — park name + stage */}
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

      {/* Row 3 — date + state */}
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
        {formatMonthYear(inspection.closing_date)}
        {inspection.state ? ` · ${inspection.state}` : ''}
      </div>
    </div>
  )
}

function FilterBar({
  stageFilter,
  setStageFilter,
  datePreset,
  setDatePreset,
  customFrom,
  setCustomFrom,
  customTo,
  setCustomTo,
  search,
  setSearch,
  stages,
  counts,
}: {
  stageFilter: string
  setStageFilter: (s: string) => void
  datePreset: DatePreset
  setDatePreset: (p: DatePreset) => void
  customFrom: string
  setCustomFrom: (s: string) => void
  customTo: string
  setCustomTo: (s: string) => void
  search: string
  setSearch: (s: string) => void
  stages: string[]
  counts: Record<string, number>
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
      </div>

      {/* Date preset row */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
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

      {/* Custom date inputs */}
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

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search park, address, contact..."
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
          <StageBadge stage={inspection.stage} />
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
  const [loading, setLoading] = useState(true)

  const [stageFilter, setStageFilter] = useState('all')
  const [datePreset, setDatePreset] = useState<DatePreset>('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [search, setSearch] = useState('')
  const [selectedInspection, setSelectedInspection] = useState<Inspection | null>(null)

  const fetchInspections = useCallback(() => {
    const params = new URLSearchParams()
    if (stageFilter !== 'all') params.set('stage', stageFilter)
    if (search) params.set('search', search)

    const dates = presetDates(datePreset)
    if (dates) {
      params.set('from', dates.from)
      params.set('to', dates.to)
    } else if (datePreset === 'custom') {
      if (customFrom) params.set('from', customFrom)
      if (customTo) params.set('to', customTo)
    }

    setLoading(true)
    fetch(`/api/internal/inspections?${params.toString()}`)
      .then((r) => r.json())
      .then((d: { inspections: Inspection[]; stages: string[] }) => {
        setInspections(d.inspections ?? [])
        if (d.stages?.length) setStages(d.stages)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [stageFilter, datePreset, customFrom, customTo, search])

  useEffect(() => {
    fetchInspections()
  }, [fetchInspections])

  // Stage counts from current result set
  const counts: Record<string, number> = { all: inspections.length }
  for (const insp of inspections) {
    const s = insp.stage ?? 'Unknown'
    counts[s] = (counts[s] ?? 0) + 1
  }

  // Footer stats
  const completeCount = inspections.filter(
    (i) => i.stage?.toLowerCase() === 'complete',
  ).length
  const newCount = inspections.filter((i) => i.stage?.toLowerCase() === 'new').length
  const performedCount = inspections.filter(
    (i) => i.stage?.toLowerCase() === 'inspection performed',
  ).length

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
          datePreset={datePreset}
          setDatePreset={setDatePreset}
          customFrom={customFrom}
          setCustomFrom={setCustomFrom}
          customTo={customTo}
          setCustomTo={setCustomTo}
          search={search}
          setSearch={setSearch}
          stages={stages}
          counts={counts}
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
            inspections.map((insp) => (
              <InspectionRow
                key={insp.id}
                inspection={insp}
                selected={selectedInspection?.id === insp.id}
                onClick={() => setSelectedInspection(insp)}
              />
            ))
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
          <div>{inspections.length} inspections</div>
          {inspections.length > 0 && (
            <div style={{ opacity: 0.75 }}>
              {completeCount > 0 && `${completeCount} Complete`}
              {completeCount > 0 && newCount > 0 && ' · '}
              {newCount > 0 && `${newCount} New`}
              {performedCount > 0 && ` · ${performedCount} Performed`}
            </div>
          )}
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
