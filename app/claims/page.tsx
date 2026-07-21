'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { FileText, Phone, ExternalLink } from 'lucide-react'
import AdvancedFilterBar, { type FilterState, DEFAULT_FILTERS } from '../../components/FilterBar'

// ─── types ─────────────────────────────────────────────────────────────────────

type Claim = {
  id: string
  field_service_number: string | null
  deal_name: string | null
  stage: string | null
  claim_status: string | null
  tank_type: string | null
  owner_name: string | null
  adjuster_name: string | null
  city: string | null
  claim_state: string | null
  date_claim_is_reported: string | null
  modified_time: string | null
  modified_by_name: string | null
  emergency: boolean | null
  total_claim_costs: number | null
  total_amount_paid: number | null
  contact_name: string | null
  claim_contact_phone: string | null
  account_name: string | null
  proceed_to_remediation: string | null
  claim_trigger: string | null
  description: string | null
  estimate_total: number | null
  payment_total: number | null
}

type StageEvent = {
  stage: string | null
  entered_at: string | null
  days_in_stage: number | null
  modified_by_name: string | null
}

type CallLog = {
  id: string
  direction: string | null
  call_time: string | null
  duration_seconds: number | null
  phone_number: string | null
  agent_name: string | null
  call_answered: boolean | null
  inferred_summary: string | null
  inferred_sentiment: string | null
  inferred_risk_flags: string[] | null
  inferred_topics: string[] | null
}

// ─── helpers ───────────────────────────────────────────────────────────────────

function timeAgo(isoStr: string | null): string {
  if (!isoStr) return '—'
  const ms = Date.now() - new Date(isoStr).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
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

function formatDuration(seconds: number | null): string {
  if (!seconds) return '0s'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

function isStale(modifiedTime: string | null): boolean {
  if (!modifiedTime) return false
  return Date.now() - new Date(modifiedTime).getTime() > 14 * 24 * 60 * 60 * 1000
}

function ustStatusLabel(
  claim: Claim,
): { label: string; color: string; border: string } | null {
  if (claim.tank_type !== 'UST' || !claim.claim_status) return null
  if (
    claim.claim_status === 'ust_pre_tank' &&
    ['Service Fee Billed', 'Attendance Deployed'].includes(claim.stage ?? '')
  ) {
    return { label: 'Pending UST Pull', color: 'var(--accent-amber)', border: 'var(--accent-amber)' }
  }
  if (claim.claim_status === 'ust_pre_tank') {
    return { label: 'Pre-Remediation', color: 'var(--text-secondary)', border: 'var(--border-bright)' }
  }
  if (claim.claim_status === 'ust_open') {
    return { label: 'Open UST Claim', color: '#60A5FA', border: '#60A5FA' }
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

function ClaimRow({
  claim,
  selected,
  onClick,
}: {
  claim: Claim
  selected: boolean
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const stale = isStale(claim.modified_time)

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
          ? '3px solid var(--accent-yellow)'
          : '3px solid transparent',
        background:
          selected || hovered ? 'var(--bg-elevated)' : 'var(--bg-surface)',
        cursor: 'pointer',
        transition: 'background 0.1s',
      }}
    >
      {/* Row 1 — FSN + emergency badge */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 3,
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {stale && (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#E8A84A',
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
          )}
          <span
            style={{
              color: 'var(--accent-yellow)',
              fontWeight: 700,
              fontSize: 13,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {claim.field_service_number ?? '—'}
          </span>
        </span>
        {claim.emergency && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.06em',
              color: 'var(--accent-red)',
              border: '1px solid var(--accent-red)',
              borderRadius: 3,
              padding: '1px 5px',
            }}
          >
            EMRG
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

      {/* Row 4 — owner · time · status + tank badge */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          {claim.owner_name ?? '—'} · {timeAgo(claim.modified_time)}
        </span>
        <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {(() => {
            const ust = ustStatusLabel(claim)
            return ust ? (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.06em',
                  color: ust.color,
                  border: `1px solid ${ust.border}`,
                  borderRadius: 3,
                  padding: '1px 4px',
                  opacity: 0.9,
                }}
              >
                {ust.label}
              </span>
            ) : null
          })()}
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.06em',
              color: claim.tank_type === 'AST' ? 'var(--accent-yellow)' : '#60A5FA',
              border: `1px solid ${
                claim.tank_type === 'AST' ? 'var(--accent-yellow)' : '#60A5FA'
              }`,
              borderRadius: 3,
              padding: '1px 5px',
              opacity: 0.75,
            }}
          >
            {claim.tank_type ?? '?'}
          </span>
        </span>
      </div>
    </div>
  )
}

function FilterBar({
  pipeline,
  setPipeline,
  search,
  setSearch,
  counts,
}: {
  pipeline: 'all' | 'AST' | 'UST'
  setPipeline: (p: 'all' | 'AST' | 'UST') => void
  search: string
  setSearch: (s: string) => void
  counts: { all: number; ast: number; ust: number }
}) {
  const tabs: { key: 'all' | 'AST' | 'UST'; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'AST', label: 'AST', count: counts.ast },
    { key: 'UST', label: 'UST', count: counts.ust },
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
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {tabs.map(({ key, label, count }) => {
          const active = pipeline === key
          return (
            <button
              key={key}
              onClick={() => setPipeline(key)}
              style={{
                flex: 1,
                padding: '5px 8px',
                fontSize: 12,
                fontWeight: active ? 700 : 500,
                cursor: 'pointer',
                background: active ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                border: `1px solid ${active ? 'var(--border-bright)' : 'var(--border)'}`,
                borderLeft: active
                  ? '3px solid var(--accent-yellow)'
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
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search FSN, contact, owner, city..."
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
        Click any claim in the list to see full details, stage history, and call logs
      </div>
    </div>
  )
}

function ClaimDetail({
  claim,
  history,
  calls,
  phone,
  loading,
}: {
  claim: Claim
  history: StageEvent[]
  calls: CallLog[]
  phone: string | null
  loading: boolean
}) {
  const zohoUrl = `https://crm.zoho.com/crm/org884788391/tab/Deals/${claim.id}`
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
              color: 'var(--accent-yellow)',
              fontVariantNumeric: 'tabular-nums',
              marginBottom: 4,
            }}
          >
            {claim.field_service_number ?? '—'}
          </div>
          <div
            style={{ fontSize: 14, color: 'var(--text-primary)', marginBottom: 10 }}
          >
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
            {(() => {
              const ust = ustStatusLabel(claim)
              return ust ? (
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: ust.color,
                    border: `1px solid ${ust.border}`,
                    borderRadius: 4,
                    padding: '3px 10px',
                  }}
                >
                  {ust.label}
                </span>
              ) : null
            })()}
            {claim.emergency && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: 'var(--accent-red)',
                  border: '1px solid var(--accent-red)',
                  borderRadius: 4,
                  padding: '3px 10px',
                }}
              >
                EMERGENCY
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

      {/* B — Info grid */}
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

            <InfoLabel>Last Updated</InfoLabel>
            <InfoValue>
              {formatDate(claim.modified_time)}
              {claim.modified_by_name ? ` · ${claim.modified_by_name}` : ''}
            </InfoValue>
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

            {claim.tank_type === 'UST' && (
              <>
                <InfoLabel>Proceed to Remediation</InfoLabel>
                <InfoValue>
                  {claim.proceed_to_remediation === 'Yes' ? 'Yes' : 'No'}
                </InfoValue>
              </>
            )}
          </div>
        </div>
      </div>

      {/* C — Financial summary */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 10,
          marginBottom: 14,
        }}
      >
        {(() => {
          const est = claim.estimate_total ?? 0
          const paid = claim.payment_total ?? 0
          return [
            {
              label: 'Estimate',
              value: formatCurrency(est),
              color: 'var(--text-primary)',
            },
            {
              label: 'Paid to Date',
              value: formatCurrency(paid),
              color: paid >= est ? 'var(--accent-amber)' : 'var(--accent-green)',
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
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            No stage history synced
          </div>
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
                        ? 'var(--accent-yellow)'
                        : 'var(--bg-elevated)',
                      border: `2px solid ${
                        isCurrent ? 'var(--accent-yellow)' : 'var(--border-bright)'
                      }`,
                    }}
                  />
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: isCurrent ? 600 : 400,
                        color: isCurrent
                          ? 'var(--accent-yellow)'
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

      {/* E — Call logs */}
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '14px 20px',
          marginBottom: phone && calls.length === 0 && !loading ? 0 : 14,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
            marginBottom: 10,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-secondary)',
            }}
          >
            Call History
          </span>
          {phone && (
            <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{phone}</span>
          )}
        </div>
        {loading ? (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Loading...</div>
        ) : !phone ? (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            No phone number on record
          </div>
        ) : calls.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            No call history found
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {calls.map((call, i) => {
              const sentColor = (() => {
                if (!call.inferred_sentiment) return 'rgba(255,255,255,0.3)'
                const s = call.inferred_sentiment.toLowerCase()
                if (s.includes('positive')) return '#4CAF82'
                if (s.includes('negative') || s.includes('frustrated')) return '#E84A4A'
                return 'rgba(255,255,255,0.3)'
              })()
              const hasRisk = (call.inferred_risk_flags?.length ?? 0) > 0
              const hasTopics = (call.inferred_topics?.length ?? 0) > 0

              return (
                <div key={call.id ?? i} style={{ display: 'flex', flexDirection: 'column' }}>
                  {/* meta line — unchanged */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    <Phone
                      size={11}
                      style={{
                        color:
                          call.direction === 'inbound'
                            ? 'var(--accent-green)'
                            : 'var(--accent-yellow)',
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        color: 'var(--text-secondary)',
                        textTransform: 'capitalize',
                        minWidth: 52,
                      }}
                    >
                      {call.direction}
                    </span>
                    <span style={{ color: 'var(--text-primary)' }}>
                      {formatDate(call.call_time)}
                    </span>
                    <span style={{ color: 'var(--text-tertiary)' }}>·</span>
                    <span
                      style={{
                        color: 'var(--text-secondary)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {formatDuration(call.duration_seconds)}
                    </span>
                    {call.agent_name && (
                      <>
                        <span style={{ color: 'var(--text-tertiary)' }}>·</span>
                        <span style={{ color: 'var(--text-tertiary)' }}>
                          {call.agent_name}
                        </span>
                      </>
                    )}
                  </div>

                  {/* summary */}
                  {call.inferred_summary && (
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                        fontStyle: 'italic',
                        marginTop: 4,
                      }}
                    >
                      {call.inferred_summary.length > 100
                        ? call.inferred_summary.slice(0, 100) + '…'
                        : call.inferred_summary}
                    </div>
                  )}

                  {/* sentiment dot + risk flag */}
                  {(call.inferred_sentiment || hasRisk) && (
                    <div style={{ display: 'flex', alignItems: 'center', marginTop: 4 }}>
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: sentColor,
                          display: 'inline-block',
                          marginRight: 6,
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                        {call.inferred_sentiment ?? 'Neutral'}
                      </span>
                      {hasRisk && (
                        <span
                          title={(call.inferred_risk_flags ?? []).join(', ')}
                          style={{ color: '#E84A4A', fontSize: 12, marginLeft: 6 }}
                        >
                          ⚠
                        </span>
                      )}
                    </div>
                  )}

                  {/* topics */}
                  {hasTopics && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                      {(call.inferred_topics ?? []).map((t) => (
                        <span
                          key={t}
                          style={{
                            background: 'rgba(232,200,74,0.12)',
                            color: '#E8C84A',
                            fontSize: 10,
                            padding: '2px 6px',
                            borderRadius: 4,
                          }}
                        >
                          {t.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* F — Notes / description */}
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

export default function ClaimsPage() {
  const searchParams = useSearchParams()
  const claimParam = searchParams.get('claim')
  const [allClaims, setAllClaims] = useState<Claim[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [pipeline, setPipeline] = useState<'all' | 'AST' | 'UST'>('all')
  const [search, setSearch] = useState('')
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null)

  const [history, setHistory] = useState<StageEvent[]>([])
  const [calls, setCalls] = useState<CallLog[]>([])
  const [phone, setPhone] = useState<string | null>(null)
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

  // Fetch all open claims once on mount
  useEffect(() => {
    setLoadingList(true)
    fetch('/api/internal/claims')
      .then((r) => r.json())
      .then((data: { claims: Claim[] }) => setAllClaims(data.claims ?? []))
      .catch(console.error)
      .finally(() => setLoadingList(false))
  }, [])

  // Deep-link: ?claim=FS1872 auto-selects the matching claim
  useEffect(() => {
    if (!claimParam || allClaims.length === 0) return
    const match = allClaims.find(
      (c) =>
        c.field_service_number === claimParam ||
        c.deal_name?.includes(claimParam),
    )
    if (match) {
      setSelectedClaim(match)
      setTimeout(() => {
        document.getElementById(`claim-row-${match.id}`)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      }, 100)
    }
  }, [claimParam, allClaims])

  // Fetch stage history + calls when selected claim changes
  useEffect(() => {
    if (!selectedClaim) {
      setHistory([])
      setCalls([])
      setPhone(null)
      return
    }
    setLoadingDetail(true)
    fetch(`/api/internal/claims/${selectedClaim.id}`)
      .then((r) => r.json())
      .then((data: { history: StageEvent[]; calls: CallLog[]; phone: string | null }) => {
        setHistory(data.history ?? [])
        setCalls(data.calls ?? [])
        setPhone(data.phone ?? null)
      })
      .catch(console.error)
      .finally(() => setLoadingDetail(false))
  }, [selectedClaim?.id])

  // Client-side filter + sort
  const filtered = allClaims.filter((c) => {
    const matchesPipeline =
      pipeline === 'all' ||
      (pipeline === 'AST' && c.tank_type === 'AST') ||
      (pipeline === 'UST' && c.tank_type === 'UST')
    const s = search.toLowerCase()
    const matchesSearch =
      !search ||
      c.field_service_number?.toLowerCase().includes(s) ||
      c.deal_name?.toLowerCase().includes(s) ||
      c.city?.toLowerCase().includes(s) ||
      c.contact_name?.toLowerCase().includes(s) ||
      c.owner_name?.toLowerCase().includes(s) ||
      c.adjuster_name?.toLowerCase().includes(s) ||
      c.account_name?.toLowerCase().includes(s)
    const matchesOwner   = !filterState.owner     || c.owner_name   === filterState.owner
    const matchesDealer  = !filterState.oilDealer || c.account_name === filterState.oilDealer
    const matchesStage   = !filterState.stage     || c.stage        === filterState.stage
    const matchesTrigger = !filterState.trigger   || c.claim_trigger === filterState.trigger
    const dr = c.date_claim_is_reported ?? ''
    const matchesFrom = !filterState.dateFrom || dr >= filterState.dateFrom
    const matchesTo   = !filterState.dateTo   || dr <= filterState.dateTo
    return matchesPipeline && matchesSearch &&
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
    all: allClaims.length,
    ast: allClaims.filter((c) => c.tank_type === 'AST').length,
    ust: allClaims.filter((c) => c.tank_type === 'UST').length,
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
      {/* ── Left panel — claims list ── */}
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
          pipeline={pipeline}
          setPipeline={setPipeline}
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
        />

        {/* Scrollable claim list */}
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

        {/* Count footer */}
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

      {/* ── Right panel — claim detail ── */}
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
            calls={calls}
            phone={phone}
            loading={loadingDetail}
          />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  )
}
