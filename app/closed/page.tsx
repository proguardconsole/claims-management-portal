'use client'

import { useEffect, useMemo, useState } from 'react'
import { Archive, ExternalLink } from 'lucide-react'
import AdvancedFilterBar, { type FilterState, DEFAULT_FILTERS } from '../../components/FilterBar'

// ─── types ─────────────────────────────────────────────────────────────────────

type ClosedClaim = {
  id: string
  field_service_number: string | null
  deal_name: string | null
  stage: string | null
  claim_status: string | null
  claim_denied: boolean | null
  claim_denied_reason: string | null
  tank_type: string | null
  record_type: string | null
  owner_name: string | null
  adjuster_name: string | null
  city: string | null
  claim_state: string | null
  date_claim_is_reported: string | null
  modified_time: string | null
  modified_by_name: string | null
  contact_name: string | null
  claim_contact_phone: string | null
  account_name: string | null
  description: string | null
  claim_trigger: string | null
  estimate_total: number | null
  payment_total: number | null
}

type StageEvent = {
  stage: string | null
  entered_at: string | null
  days_in_stage: number | null
  modified_by_name: string | null
}

// ─── helpers ───────────────────────────────────────────────────────────────────

function isDenied(c: ClosedClaim): boolean {
  return c.stage === 'Claim Denied' || c.claim_denied === true
}

function formatDate(isoStr: string | null): string {
  if (!isoStr) return '—'
  return new Date(isoStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatCurrency(n: number | null): string {
  return (n ?? 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
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

function ClaimRow({
  claim,
  selected,
  onClick,
}: {
  claim: ClosedClaim
  selected: boolean
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const denied = isDenied(claim)

  const selectedAccent = denied ? '#E84A4A' : 'var(--accent-yellow)'

  return (
    <div
      id={`claim-row-${claim.id}`}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '11px 16px',
        borderBottom: '1px solid var(--border)',
        borderLeft: selected
          ? `3px solid ${selectedAccent}`
          : denied
            ? '3px solid rgba(232,74,74,0.35)'
            : '3px solid transparent',
        background: selected || hovered ? 'var(--bg-elevated)' : 'var(--bg-surface)',
        cursor: 'pointer',
        transition: 'background 0.1s',
      }}
    >
      {/* Row 1 — FSN + denied badge */}
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
            color: denied ? '#E84A4A' : 'var(--accent-yellow)',
            fontWeight: 700,
            fontSize: 13,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {claim.field_service_number ?? '—'}
        </span>
        {denied && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.06em',
              color: '#E84A4A',
              border: '1px solid rgba(232,74,74,0.5)',
              borderRadius: 3,
              padding: '1px 5px',
            }}
          >
            DENIED
          </span>
        )}
      </div>

      {/* Row 2 — stage */}
      <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 3 }}>
        {claim.stage ?? '—'}
      </div>

      {/* Row 3 — contact · location */}
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
        {[
          claim.contact_name,
          [claim.city, claim.claim_state].filter(Boolean).join(', '),
        ]
          .filter(Boolean)
          .join(' · ') || '—'}
      </div>

      {/* Row 4 — close date · tank badge */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          Closed {formatDate(claim.modified_time)}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.06em',
            color: claim.tank_type === 'AST' ? 'var(--accent-yellow)' : '#60A5FA',
            border: `1px solid ${claim.tank_type === 'AST' ? 'var(--accent-yellow)' : '#60A5FA'}`,
            borderRadius: 3,
            padding: '1px 5px',
            opacity: 0.75,
          }}
        >
          {claim.tank_type ?? '?'}
        </span>
      </div>
    </div>
  )
}

function FilterBar({
  statusFilter,
  setStatusFilter,
  tankFilter,
  setTankFilter,
  search,
  setSearch,
  counts,
}: {
  statusFilter: 'all' | 'closed' | 'denied'
  setStatusFilter: (f: 'all' | 'closed' | 'denied') => void
  tankFilter: 'all' | 'AST' | 'UST'
  setTankFilter: (t: 'all' | 'AST' | 'UST') => void
  search: string
  setSearch: (s: string) => void
  counts: { all: number; closed: number; denied: number; ast: number; ust: number }
}) {
  const statusTabs: { key: 'all' | 'closed' | 'denied'; label: string; count: number }[] = [
    { key: 'all',    label: 'All',    count: counts.all    },
    { key: 'closed', label: 'Closed', count: counts.closed },
    { key: 'denied', label: 'Denied', count: counts.denied },
  ]

  const tankTabs: { key: 'all' | 'AST' | 'UST'; label: string; count: number }[] = [
    { key: 'all', label: 'All Types', count: counts.all    },
    { key: 'AST', label: 'AST',       count: counts.ast    },
    { key: 'UST', label: 'UST',       count: counts.ust    },
  ]

  return (
    <div
      style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-header)',
        flexShrink: 0,
      }}
    >
      {/* Status toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {statusTabs.map(({ key, label, count }) => {
          const active = statusFilter === key
          const isDeniedTab = key === 'denied'
          return (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              style={{
                flex: 1,
                padding: '5px 8px',
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                cursor: 'pointer',
                background: active ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                color: active && isDeniedTab
                  ? '#E84A4A'
                  : active
                    ? 'var(--text-primary)'
                    : 'var(--text-secondary)',
                border: `1px solid ${active ? 'var(--border-bright)' : 'var(--border)'}`,
                borderLeft: active
                  ? isDeniedTab
                    ? '3px solid #E84A4A'
                    : '3px solid var(--accent-yellow)'
                  : '3px solid transparent',
                borderRadius: 4,
                textAlign: 'center',
              }}
            >
              {label} · {count}
            </button>
          )
        })}
      </div>

      {/* Tank type sub-tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {tankTabs.map(({ key, label }) => {
          const active = tankFilter === key
          return (
            <button
              key={key}
              onClick={() => setTankFilter(key)}
              style={{
                padding: '3px 10px',
                fontSize: 11,
                fontWeight: active ? 600 : 400,
                cursor: 'pointer',
                background: active ? 'var(--bg-elevated)' : 'transparent',
                color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
                border: `1px solid ${active ? 'var(--border-bright)' : 'transparent'}`,
                borderRadius: 3,
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search FSN, contact, city..."
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
      <Archive size={44} style={{ opacity: 0.3 }} />
      <div style={{ fontSize: 14, fontWeight: 500 }}>Select a claim to view details</div>
      <div
        style={{
          fontSize: 12,
          opacity: 0.6,
          textAlign: 'center',
          maxWidth: 220,
          lineHeight: 1.5,
        }}
      >
        Click any claim in the list to see full details and stage history
      </div>
    </div>
  )
}

function ClaimDetail({
  claim,
  history,
  loading,
}: {
  claim: ClosedClaim
  history: StageEvent[]
  loading: boolean
}) {
  const zohoUrl = `https://crm.zoho.com/crm/org884788391/tab/Deals/${claim.id}`
  const denied = isDenied(claim)

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
              fontSize: 26,
              fontWeight: 700,
              color: denied ? '#E84A4A' : 'var(--accent-yellow)',
              fontVariantNumeric: 'tabular-nums',
              marginBottom: 4,
            }}
          >
            {claim.field_service_number ?? '—'}
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-primary)', marginBottom: 10 }}>
            {claim.deal_name ?? '—'}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: 12,
                color: 'var(--text-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                padding: '3px 10px',
              }}
            >
              {claim.stage ?? '—'}
            </span>
            {denied && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#E84A4A',
                  border: '1px solid rgba(232,74,74,0.5)',
                  borderRadius: 4,
                  padding: '3px 10px',
                }}
              >
                DENIED
              </span>
            )}
            {claim.tank_type && (
              <span
                style={{
                  fontSize: 12,
                  color: claim.tank_type === 'AST' ? 'var(--accent-yellow)' : '#60A5FA',
                  border: `1px solid ${claim.tank_type === 'AST' ? 'var(--accent-yellow)' : '#60A5FA'}`,
                  borderRadius: 4,
                  padding: '3px 10px',
                  opacity: 0.8,
                }}
              >
                {claim.tank_type}
              </span>
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
          }}
        >
          CRM <ExternalLink size={11} />
        </a>
      </div>

      {/* B — Denial reason (denied claims only) */}
      {denied && (
        <div
          style={{
            background: 'rgba(232,74,74,0.06)',
            border: '1px solid rgba(232,74,74,0.25)',
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
              color: '#E84A4A',
              marginBottom: 6,
            }}
          >
            Denial Reason
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
            {claim.claim_denied_reason ?? 'No reason on record'}
          </div>
        </div>
      )}

      {/* B.1 — Financial summary */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
          marginBottom: 14,
        }}
      >
        {(() => {
          const est = claim.estimate_total ?? 0
          const paid = claim.payment_total ?? 0
          const diff = paid - est
          return [
            {
              label: 'Original Estimate',
              value: formatCurrency(est),
              color: 'var(--text-primary)',
            },
            {
              label: 'Total Paid',
              value: formatCurrency(paid),
              color: 'var(--accent-green)',
            },
            {
              label: 'Difference',
              value:
                est === 0 && paid === 0
                  ? '—'
                  : diff === 0
                    ? '$0'
                    : diff < 0
                      ? `-${formatCurrency(-diff)}`
                      : `+${formatCurrency(diff)}`,
              color:
                est === 0 && paid === 0
                  ? 'var(--text-tertiary)'
                  : diff < 0
                    ? 'var(--accent-green)'
                    : 'var(--accent-red)',
            },
          ]
        })().map(({ label, value, color }) => (
          <div
            key={label}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '12px 16px',
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--text-tertiary)',
                marginBottom: 4,
              }}
            >
              {label}
            </div>
            <div
              style={{
                fontSize: 19,
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                color,
              }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* C — Info grid */}
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
            <InfoLabel>Pipeline</InfoLabel>
            <InfoValue>{claim.tank_type ?? '—'}</InfoValue>

            <InfoLabel>Trigger</InfoLabel>
            <InfoValue>{claim.claim_trigger ?? '—'}</InfoValue>

            <InfoLabel>State</InfoLabel>
            <InfoValue>{claim.claim_state ?? '—'}</InfoValue>

            <InfoLabel>Date Reported</InfoLabel>
            <InfoValue>{formatDate(claim.date_claim_is_reported)}</InfoValue>

            <InfoLabel>Close Date</InfoLabel>
            <InfoValue>{formatDate(claim.modified_time)}</InfoValue>
          </div>
          <div>
            <InfoLabel>Owner</InfoLabel>
            <InfoValue>{claim.owner_name ?? '—'}</InfoValue>

            <InfoLabel>Adjuster</InfoLabel>
            <InfoValue>{claim.adjuster_name ?? '—'}</InfoValue>

            <InfoLabel>Contact</InfoLabel>
            <InfoValue>{claim.contact_name ?? '—'}</InfoValue>

            <InfoLabel>Phone</InfoLabel>
            <InfoValue>{claim.claim_contact_phone ?? '—'}</InfoValue>

            <InfoLabel>Oil Dealer</InfoLabel>
            <InfoValue>{claim.account_name ?? '—'}</InfoValue>
          </div>
        </div>
      </div>

      {/* D — Stage history */}
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
          Stage History
        </div>
        {loading ? (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Loading...</div>
        ) : history.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No stage history synced</div>
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
            {history.map((ev, i) => {
              const isCurrent = i === history.length - 1
              return (
                <div
                  key={i}
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
                      background: isCurrent
                        ? (denied ? '#E84A4A' : 'var(--accent-yellow)')
                        : 'var(--bg-elevated)',
                      border: `2px solid ${
                        isCurrent
                          ? (denied ? '#E84A4A' : 'var(--accent-yellow)')
                          : 'var(--border-bright)'
                      }`,
                    }}
                  />
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: isCurrent ? 600 : 400,
                        color: isCurrent
                          ? (denied ? '#E84A4A' : 'var(--accent-yellow)')
                          : 'var(--text-primary)',
                        marginBottom: 1,
                      }}
                    >
                      {ev.stage ?? '—'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      {formatDate(ev.entered_at)}
                      {ev.days_in_stage != null
                        ? ` · ${ev.days_in_stage < 1 ? '<1d' : `${ev.days_in_stage}d`}`
                        : ''}
                      {ev.modified_by_name ? ` · ${ev.modified_by_name}` : ''}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* E — Notes */}
      {claim.description && (
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '14px 20px',
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-secondary)',
              marginBottom: 8,
            }}
          >
            Notes
          </div>
          <div
            style={{
              fontSize: 13,
              color: 'var(--text-secondary)',
              fontStyle: 'italic',
              lineHeight: 1.6,
            }}
          >
            {claim.description}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── main page ─────────────────────────────────────────────────────────────────

export default function ClosedPage() {
  const [allClaims, setAllClaims] = useState<ClosedClaim[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'all' | 'closed' | 'denied'>('all')
  const [tankFilter, setTankFilter] = useState<'all' | 'AST' | 'UST'>('all')
  const [search, setSearch] = useState('')
  const [selectedClaim, setSelectedClaim] = useState<ClosedClaim | null>(null)
  const [history, setHistory] = useState<StageEvent[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [filterState, setFilterState] = useState<FilterState>(DEFAULT_FILTERS)

  const metaOptions = useMemo(() => {
    const ownersMap: Record<string, true>   = {}
    const dealersMap: Record<string, true>  = {}
    const stagesMap: Record<string, true>   = {}
    const triggersMap: Record<string, true> = {}
    for (const c of allClaims) {
      if (c.owner_name)    ownersMap[c.owner_name]      = true
      if (c.account_name)  dealersMap[c.account_name]   = true
      if (c.stage)         stagesMap[c.stage]            = true
      if (c.claim_trigger) triggersMap[c.claim_trigger]  = true
    }
    return {
      owners:     Object.keys(ownersMap).sort(),
      oilDealers: Object.keys(dealersMap).sort(),
      stages:     Object.keys(stagesMap).sort(),
      triggers:   Object.keys(triggersMap).sort(),
    }
  }, [allClaims])

  // Fetch all closed/denied claims once on mount
  useEffect(() => {
    setLoadingList(true)
    fetch('/api/internal/closed?filter=all')
      .then((r) => r.json())
      .then((data: { claims: ClosedClaim[] }) => setAllClaims(data.claims ?? []))
      .catch(console.error)
      .finally(() => setLoadingList(false))
  }, [])

  // Fetch stage history when selected claim changes
  useEffect(() => {
    if (!selectedClaim) {
      setHistory([])
      return
    }
    setLoadingDetail(true)
    fetch(`/api/internal/claims/${selectedClaim.id}`)
      .then((r) => r.json())
      .then((data: { history: StageEvent[] }) => setHistory(data.history ?? []))
      .catch(console.error)
      .finally(() => setLoadingDetail(false))
  }, [selectedClaim?.id])

  // Client-side filtering + sort
  const filtered = allClaims.filter((c) => {
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'denied' && isDenied(c)) ||
      (statusFilter === 'closed' && !isDenied(c))
    const matchesTank =
      tankFilter === 'all' ||
      c.tank_type === tankFilter
    const s = search.toLowerCase()
    const matchesSearch =
      !search ||
      c.field_service_number?.toLowerCase().includes(s) ||
      c.deal_name?.toLowerCase().includes(s) ||
      c.city?.toLowerCase().includes(s) ||
      c.contact_name?.toLowerCase().includes(s) ||
      c.adjuster_name?.toLowerCase().includes(s)
    const matchesOwner   = !filterState.owner     || c.owner_name   === filterState.owner
    const matchesDealer  = !filterState.oilDealer || c.account_name === filterState.oilDealer
    const matchesStage   = !filterState.stage     || c.stage        === filterState.stage
    const matchesTrigger = !filterState.trigger   || c.claim_trigger === filterState.trigger
    const dr = c.date_claim_is_reported ?? ''
    const matchesFrom = !filterState.dateFrom || dr >= filterState.dateFrom
    const matchesTo   = !filterState.dateTo   || dr <= filterState.dateTo
    return matchesStatus && matchesTank && matchesSearch &&
           matchesOwner && matchesDealer && matchesStage && matchesTrigger &&
           matchesFrom && matchesTo
  })

  const sorted = [...filtered].sort((a, b) => {
    switch (filterState.sort) {
      case 'updated_asc':   return (a.modified_time ?? '').localeCompare(b.modified_time ?? '')
      case 'reported_desc': return (b.date_claim_is_reported ?? '').localeCompare(a.date_claim_is_reported ?? '')
      case 'reported_asc':  return (a.date_claim_is_reported ?? '').localeCompare(b.date_claim_is_reported ?? '')
      case 'fsn_asc':       return (a.field_service_number ?? '').localeCompare(b.field_service_number ?? '')
      default:              return (b.modified_time ?? '').localeCompare(a.modified_time ?? '')
    }
  })

  const counts = {
    all:    allClaims.length,
    closed: allClaims.filter((c) => !isDenied(c)).length,
    denied: allClaims.filter((c) => isDenied(c)).length,
    ast:    allClaims.filter((c) => c.tank_type === 'AST').length,
    ust:    allClaims.filter((c) => c.tank_type === 'UST').length,
  }

  return (
    <div
      style={{
        display: 'flex',
        height: 'calc(100vh - 52px)',
        margin: '-24px',
        overflow: 'hidden',
      }}
    >
      {/* ── Left panel — list ── */}
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
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          tankFilter={tankFilter}
          setTankFilter={setTankFilter}
          search={search}
          setSearch={setSearch}
          counts={counts}
        />
        <AdvancedFilterBar
          owners={metaOptions.owners}
          oilDealers={metaOptions.oilDealers}
          stages={metaOptions.stages}
          triggers={metaOptions.triggers}
          filters={filterState}
          onChange={setFilterState}
          stageLabel="End State"
        />

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loadingList ? (
            <div style={{ padding: 24, color: 'var(--text-tertiary)', fontSize: 13 }}>
              Loading claims...
            </div>
          ) : sorted.length === 0 ? (
            <div style={{ padding: 24, color: 'var(--text-tertiary)', fontSize: 13 }}>
              No claims match current filters.
            </div>
          ) : (
            sorted.map((claim) => (
              <ClaimRow
                key={claim.id}
                claim={claim}
                selected={selectedClaim?.id === claim.id}
                onClick={() => setSelectedClaim(claim)}
              />
            ))
          )}
        </div>

        <div
          style={{
            padding: '7px 16px',
            borderTop: '1px solid var(--border)',
            fontSize: 11,
            color: 'var(--text-tertiary)',
            background: 'var(--bg-header)',
            flexShrink: 0,
          }}
        >
          {sorted.length} of {allClaims.length} claims
        </div>
      </div>

      {/* ── Right panel — detail ── */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          background: 'var(--bg-base)',
        }}
      >
        {selectedClaim ? (
          <ClaimDetail
            claim={selectedClaim}
            history={history}
            loading={loadingDetail}
          />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  )
}
