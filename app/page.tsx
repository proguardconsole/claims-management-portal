'use client'

import { useEffect, useRef, useState } from 'react'

// ─── types ────────────────────────────────────────────────────────────────────

type Period = 'week' | 'month' | 'quarter' | 'year'

type StageRow = { stage: string; count: number }

type Bottleneck = { stage: string; avgDays: number; claimCount: number }

type RecentClaim = {
  field_service_number: string | null
  stage: string | null
  owner_name: string | null
  modified_time: string | null
}

type KpiData = {
  period: string
  since: string
  open: number
  overdue: number
  avgDaysOpen: number
  closedThisPeriod: number
  openedThisPeriod: number
  deniedThisPeriod: number
  avgDaysToClose: number
  byAdjuster: { name: string; count: number }[]
  byTankType: { type: string; count: number }[]
  byStage: { stage: string; count: number }[]
  byAge: { bucket: string; count: number }[]
  byValue: { bucket: string; count: number }[]
  byCoverage: { coverage: string; count: number }[]
  pipeline: { ast: StageRow[]; ust: StageRow[] }
  bottlenecks: Bottleneck[]
  recent: RecentClaim[]
}

// ─── constants ────────────────────────────────────────────────────────────────

const PERIODS: { value: Period; label: string; closedLabel: string }[] = [
  { value: 'week',    label: 'Last Week',    closedLabel: 'Closed This Week'    },
  { value: 'month',   label: 'Last Month',   closedLabel: 'Closed This Month'   },
  { value: 'quarter', label: 'Last Quarter', closedLabel: 'Closed This Quarter' },
  { value: 'year',    label: 'Last Year',    closedLabel: 'Closed This Year'    },
]

// ─── helpers ──────────────────────────────────────────────────────────────────

function timeAgo(isoStr: string): string {
  const mins = Math.floor((Date.now() - new Date(isoStr).getTime()) / 60_000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

// ─── sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'var(--text-secondary)',
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  )
}

function PeriodSelector({
  period,
  onChange,
}: {
  period: Period
  onChange: (p: Period) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {PERIODS.map(({ value, label }) => {
        const active = period === value
        return (
          <button
            key={value}
            onClick={() => onChange(value)}
            style={{
              padding: '5px 14px',
              fontSize: 12,
              fontWeight: active ? 600 : 400,
              cursor: 'pointer',
              background: active ? 'var(--bg-elevated)' : 'var(--bg-surface)',
              color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
              border: `1px solid ${active ? 'var(--border-bright)' : 'var(--border)'}`,
              borderLeft: active ? '3px solid var(--accent-yellow)' : '3px solid transparent',
              borderRadius: 4,
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

function KpiCard({
  label,
  value,
  sublabel,
  valueColor = 'var(--text-primary)',
}: {
  label: string
  value: string | number | null
  sublabel?: string
  valueColor?: string
}) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '20px 24px',
        flex: 1,
        minWidth: 0,
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
        {label}
      </div>
      <div
        style={{
          fontSize: 48,
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1.1,
          color: valueColor,
        }}
      >
        {value ?? '—'}
      </div>
      {sublabel && (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
          {sublabel}
        </div>
      )}
    </div>
  )
}

function KpiCardSkeleton() {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '20px 24px',
        flex: 1,
        minWidth: 0,
      }}
    >
      <div
        style={{
          width: 130,
          height: 11,
          borderRadius: 3,
          background: 'var(--bg-elevated)',
          marginBottom: 12,
        }}
      />
      <div
        style={{ width: 72, height: 48, borderRadius: 3, background: 'var(--bg-elevated)' }}
      />
    </div>
  )
}

function PipelineTable({ title, rows }: { title: string; rows: StageRow[] }) {
  const total = rows.reduce((sum, r) => sum + r.count, 0)
  const max = rows[0]?.count ?? 1

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '16px 20px',
        flex: 1,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
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
          {title}
        </span>
        <span
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--accent-yellow)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {total}
        </span>
      </div>

      {rows.length === 0 ? (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>No open claims</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map(({ stage, count }) => (
            <div key={stage}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 3,
                  fontSize: 13,
                }}
              >
                <span style={{ color: 'var(--text-primary)' }}>{stage}</span>
                <span
                  style={{
                    color: 'var(--text-secondary)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {count}
                </span>
              </div>
              <div style={{ height: 3, background: 'var(--border)', borderRadius: 2 }}>
                <div
                  style={{
                    height: '100%',
                    width: `${(count / max) * 100}%`,
                    background: 'var(--accent-yellow)',
                    borderRadius: 2,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BottleneckCard({ stage, avgDays, claimCount }: Bottleneck) {
  const color =
    avgDays > 30
      ? 'var(--accent-red)'
      : avgDays >= 15
        ? 'var(--accent-amber)'
        : 'var(--accent-green)'

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${color}`,
        borderRadius: 6,
        padding: '12px 16px',
        flex: 1,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 12, color, fontWeight: 700, marginBottom: 4 }}>
        {avgDays.toFixed(1)}d avg
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 3 }}>
        {stage}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{claimCount} claims</div>
    </div>
  )
}

function ActivityRow({ claim }: { claim: RecentClaim }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '8px 0',
        borderBottom: '1px solid var(--border)',
        fontSize: 13,
      }}
    >
      <span
        style={{
          color: 'var(--accent-yellow)',
          fontWeight: 600,
          minWidth: 60,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {claim.field_service_number ?? '—'}
      </span>
      <span style={{ color: 'var(--text-primary)', flex: 1 }}>{claim.stage ?? '—'}</span>
      <span style={{ color: 'var(--text-secondary)', minWidth: 120 }}>
        {claim.owner_name ?? '—'}
      </span>
      <span style={{ color: 'var(--text-tertiary)', minWidth: 60, textAlign: 'right' }}>
        {claim.modified_time ? timeAgo(claim.modified_time) : '—'}
      </span>
    </div>
  )
}

function BreakdownTable({
  title,
  rows,
  limit,
}: {
  title: string
  rows: { label: string; count: number }[]
  limit?: number
}) {
  const displayed = limit ? rows.slice(0, limit) : rows
  const total = rows.reduce((s, r) => s + r.count, 0)

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '16px 20px',
        flex: 1,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
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
          {title}
        </span>
        <span
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--accent-yellow)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {total}
        </span>
      </div>

      {displayed.length === 0 ? (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>No data</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {displayed.map(({ label, count }) => (
            <div
              key={label}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '5px 0',
                fontSize: 13,
                borderBottom: '1px solid var(--border)',
              }}
            >
              <span style={{ color: 'var(--text-primary)' }}>{label}</span>
              <span
                style={{
                  color: 'var(--text-secondary)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function KpiSummaryPage() {
  const [period, setPeriod] = useState<Period>('month')
  const [kpis, setKpis] = useState<KpiData | null>(null)
  const [pipeline, setPipeline] = useState<{ ast: StageRow[]; ust: StageRow[] } | null>(null)
  const [bottlenecks, setBottlenecks] = useState<Bottleneck[]>([])
  const [recent, setRecent] = useState<RecentClaim[]>([])
  const [loading, setLoading] = useState(true)
  const [snapshotReady, setSnapshotReady] = useState(false)
  const snapshotLoaded = useRef(false)

  function loadKpis(silent: boolean) {
    if (!silent && !kpis) setLoading(true)

    fetch(`/api/internal/kpis?period=${period}`)
      .then((r) => r.json())
      .then((data: KpiData) => {
        setKpis(data)
        // Snapshot sections load once; don't replace on period change
        if (!snapshotLoaded.current) {
          snapshotLoaded.current = true
          setPipeline(data.pipeline)
          setBottlenecks(data.bottlenecks)
          setRecent(data.recent)
          setSnapshotReady(true)
        }
      })
      .catch(console.error)
      .finally(() => {
        if (!silent) setLoading(false)
      })
  }

  useEffect(() => {
    loadKpis(false)
  }, [period]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const interval = setInterval(() => loadKpis(true), 120_000)
    return () => clearInterval(interval)
  }, [period]) // eslint-disable-line react-hooks/exhaustive-deps

  const periodObj = PERIODS.find((p) => p.value === period) ?? PERIODS[1]
  const overduePct = kpis && kpis.open > 0 ? Math.round((kpis.overdue / kpis.open) * 100) : 0
  const showKpiSkeleton = loading && !kpis

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1400 }}>

      {/* ── Period selector ── */}
      <PeriodSelector period={period} onChange={setPeriod} />

      {/* ── Section A: Always-current KPIs ── */}
      <div>
        <SectionLabel>Overview — current</SectionLabel>
        <div style={{ display: 'flex', gap: 16 }}>
          {showKpiSkeleton ? (
            [0, 1, 2, 3].map((i) => <KpiCardSkeleton key={i} />)
          ) : (
            <>
              <KpiCard
                label="Open Claims"
                value={kpis?.open ?? '—'}
                valueColor="var(--accent-yellow)"
              />
              <KpiCard
                label="Overdue · 14+ days stale"
                value={kpis?.overdue ?? '—'}
                sublabel={kpis ? `${overduePct}% of open` : undefined}
                valueColor="var(--accent-red)"
              />
              <KpiCard
                label="Avg Days Open"
                value={kpis?.avgDaysOpen != null ? kpis.avgDaysOpen.toFixed(1) : null}
              />
              <KpiCard
                label={periodObj.closedLabel}
                value={kpis?.closedThisPeriod ?? '—'}
                valueColor="var(--accent-green)"
              />
            </>
          )}
        </div>
      </div>

      {/* ── Section B: Period-scoped KPIs ── */}
      <div>
        <SectionLabel>{periodObj.label}</SectionLabel>
        <div style={{ display: 'flex', gap: 16 }}>
          {showKpiSkeleton ? (
            [0, 1, 2].map((i) => <KpiCardSkeleton key={i} />)
          ) : (
            <>
              <KpiCard
                label="Opened"
                value={kpis?.openedThisPeriod ?? '—'}
                valueColor="#4d90d8"
              />
              <KpiCard
                label="Denied"
                value={kpis?.deniedThisPeriod ?? '—'}
                valueColor="var(--accent-red)"
              />
              <KpiCard
                label="Avg Days to Close"
                value={kpis?.avgDaysToClose ? `${kpis.avgDaysToClose.toFixed(1)}d` : '—'}
              />
            </>
          )}
        </div>
      </div>

      {/* ── Section C: Open Claims Breakdown (6 mini-tables, 2 rows) ── */}
      <div>
        <SectionLabel>Open Claims Breakdown</SectionLabel>
        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          {showKpiSkeleton ? (
            [0, 1, 2].map((i) => <KpiCardSkeleton key={i} />)
          ) : kpis ? (
            <>
              <BreakdownTable
                title="By Adjuster"
                rows={kpis.byAdjuster.map((r) => ({ label: r.name, count: r.count }))}
              />
              <BreakdownTable
                title="By Tank Type"
                rows={kpis.byTankType.map((r) => ({ label: r.type, count: r.count }))}
              />
              <BreakdownTable
                title="By Stage"
                rows={kpis.byStage.map((r) => ({ label: r.stage, count: r.count }))}
                limit={8}
              />
            </>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          {showKpiSkeleton ? (
            [0, 1, 2].map((i) => <KpiCardSkeleton key={i} />)
          ) : kpis ? (
            <>
              <BreakdownTable
                title="By Age"
                rows={kpis.byAge.map((r) => ({ label: r.bucket, count: r.count }))}
              />
              <BreakdownTable
                title="By Value"
                rows={kpis.byValue.map((r) => ({ label: r.bucket, count: r.count }))}
              />
              <BreakdownTable
                title="By Coverage"
                rows={kpis.byCoverage.map((r) => ({ label: r.coverage, count: r.count }))}
              />
            </>
          ) : null}
        </div>
      </div>

      {/* ── Section D: Pipeline Breakdown ── */}
      <div>
        <SectionLabel>Pipeline Breakdown — Open Claims by Stage</SectionLabel>
        {!snapshotReady ? (
          <div style={{ display: 'flex', gap: 16 }}>
            <KpiCardSkeleton />
            <KpiCardSkeleton />
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 16 }}>
            <PipelineTable title="AST Claims" rows={pipeline!.ast} />
            <PipelineTable title="UST Claims" rows={pipeline!.ust} />
          </div>
        )}
      </div>

      {/* ── Section E: Bottleneck Alert ── */}
      <div>
        <SectionLabel>Bottleneck Alert — Top Stages by Avg Dwell Time</SectionLabel>
        {!snapshotReady ? (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '12px 0' }}>
            Loading…
          </div>
        ) : bottlenecks.length === 0 ? (
          <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '12px 0' }}>
            No stage history data yet. Run sync to populate.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
            {bottlenecks.map((b) => (
              <BottleneckCard key={b.stage} {...b} />
            ))}
          </div>
        )}
      </div>

      {/* ── Section F: Recent Activity ── */}
      <div>
        <SectionLabel>Recent Activity</SectionLabel>
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '4px 16px',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 12,
              padding: '8px 0',
              borderBottom: '1px solid var(--border)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--text-secondary)',
            }}
          >
            <span style={{ minWidth: 60 }}>Claim</span>
            <span style={{ flex: 1 }}>Stage</span>
            <span style={{ minWidth: 120 }}>Owner</span>
            <span style={{ minWidth: 60, textAlign: 'right' }}>Updated</span>
          </div>
          {recent.map((claim) => (
            <ActivityRow key={claim.field_service_number} claim={claim} />
          ))}
          {recent.length === 0 && (
            <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '12px 0' }}>
              {!snapshotReady ? 'Loading…' : 'No recent activity'}
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
