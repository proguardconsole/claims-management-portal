import { getServerSupabase } from '../lib/supabase/server'

// ─── helpers ──────────────────────────────────────────────────────────────────

const OPEN_STATUSES = ['ast_open', 'ust_open', 'ust_pre_tank'] as const

function daysAgo(isoStr: string): number {
  const ms = Date.now() - new Date(isoStr).getTime()
  return ms / (1000 * 60 * 60 * 24)
}

function timeAgo(isoStr: string): string {
  const mins = Math.floor(daysAgo(isoStr) * 24 * 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function monthStart(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
}

function overdueThreshold(): string {
  return new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
}

// ─── data fetchers ─────────────────────────────────────────────────────────────

async function fetchKpis() {
  const sb = getServerSupabase()

  const [openRes, overdueRes, closedEventsRes, openDatesRes] = await Promise.all([
    sb
      .from('claims')
      .select('*', { count: 'exact', head: true })
      .in('claim_status', [...OPEN_STATUSES]),

    sb
      .from('claims')
      .select('*', { count: 'exact', head: true })
      .in('claim_status', [...OPEN_STATUSES])
      .lt('modified_time', overdueThreshold()),

    // Count claims that actually transitioned into a completion stage this month
    sb
      .from('claim_events')
      .select('claim_id')
      .in('stage', ['Complete', 'Claim Denied'])
      .gte('entered_at', monthStart())
      .not('claim_id', 'is', null),

    sb
      .from('claims')
      .select('date_claim_is_reported')
      .in('claim_status', [...OPEN_STATUSES])
      .not('date_claim_is_reported', 'is', null),
  ])

  const open = openRes.count ?? 0
  const overdue = overdueRes.count ?? 0
  // Distinct claim IDs that closed this month (one claim can have multiple close events)
  const closedMonth = new Set(
    (closedEventsRes.data ?? []).map((r) => r.claim_id as string),
  ).size

  let avgDaysOpen: number | null = null
  if (openDatesRes.data && openDatesRes.data.length > 0) {
    const ages = openDatesRes.data
      .map((r) => daysAgo(r.date_claim_is_reported as string))
      .filter((d) => d >= 0)
    avgDaysOpen = ages.length > 0
      ? Math.round((ages.reduce((a, b) => a + b, 0) / ages.length) * 10) / 10
      : null
  }

  return { open, overdue, closedMonth, avgDaysOpen }
}

type StageRow = { stage: string; count: number }

async function fetchPipelineBreakdown(): Promise<{ ast: StageRow[]; ust: StageRow[] }> {
  const sb = getServerSupabase()

  const [astRes, ustRes] = await Promise.all([
    sb.from('claims').select('stage').eq('claim_status', 'ast_open'),
    // claim_status values for open UST: 'ust_open', 'ust_pre_tank' (confirmed from data)
    sb
      .from('claims')
      .select('stage')
      .in('claim_status', ['ust_open', 'ust_pre_tank'])
      .eq('tank_type', 'UST'),
  ])

  function toRows(data: { stage: string }[] | null): StageRow[] {
    if (!data) return []
    const counts: Record<string, number> = {}
    for (const r of data) {
      const s = r.stage ?? 'Unknown'
      counts[s] = (counts[s] ?? 0) + 1
    }
    return Object.entries(counts)
      .map(([stage, count]) => ({ stage, count }))
      .sort((a, b) => b.count - a.count)
  }

  return { ast: toRows(astRes.data), ust: toRows(ustRes.data) }
}

type Bottleneck = { stage: string; avgDays: number; claimCount: number }

async function fetchBottlenecks(): Promise<Bottleneck[]> {
  try {
    const sb = getServerSupabase()
    const { data } = await sb
      .from('claim_events')
      .select('stage, days_in_stage')
      .gt('days_in_stage', 0)

    if (!data || data.length === 0) return []

    const agg: Record<string, number[]> = {}
    for (const ev of data) {
      const s = ev.stage as string
      const d = ev.days_in_stage as number
      if (s && d) {
        if (!agg[s]) agg[s] = []
        agg[s].push(d)
      }
    }

    return Object.entries(agg)
      .filter(([, vals]) => vals.length >= 5)
      .map(([stage, vals]) => ({
        stage,
        avgDays: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
        claimCount: vals.length,
      }))
      .sort((a, b) => b.avgDays - a.avgDays)
      .slice(0, 5)
  } catch {
    return []
  }
}

type RecentClaim = {
  field_service_number: string | null
  stage: string | null
  owner_name: string | null
  modified_time: string | null
}

async function fetchRecentActivity(): Promise<RecentClaim[]> {
  const sb = getServerSupabase()
  const { data } = await sb
    .from('claims')
    .select('field_service_number, stage, owner_name, modified_time')
    .in('claim_status', [...OPEN_STATUSES])
    .order('modified_time', { ascending: false })
    .limit(10)
  return (data ?? []) as RecentClaim[]
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
              {/* Bar */}
              <div
                style={{
                  height: 3,
                  background: 'var(--border)',
                  borderRadius: 2,
                }}
              >
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
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
        {claimCount} claims
      </div>
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
      <span style={{ color: 'var(--text-primary)', flex: 1 }}>
        {claim.stage ?? '—'}
      </span>
      <span style={{ color: 'var(--text-secondary)', minWidth: 120 }}>
        {claim.owner_name ?? '—'}
      </span>
      <span style={{ color: 'var(--text-tertiary)', minWidth: 60, textAlign: 'right' }}>
        {claim.modified_time ? timeAgo(claim.modified_time) : '—'}
      </span>
    </div>
  )
}

// ─── page ──────────────────────────────────────────────────────────────────────

export default async function KpiSummaryPage() {
  const [kpis, pipeline, bottlenecks, recent] = await Promise.all([
    fetchKpis(),
    fetchPipelineBreakdown(),
    fetchBottlenecks(),
    fetchRecentActivity(),
  ])

  const overduePct =
    kpis.open > 0 ? Math.round((kpis.overdue / kpis.open) * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1400 }}>
      {/* ── Section A: KPI strip ── */}
      <div>
        <SectionLabel>Overview</SectionLabel>
        <div style={{ display: 'flex', gap: 16 }}>
          <KpiCard
            label="Open Claims"
            value={kpis.open}
            valueColor="var(--accent-yellow)"
          />
          <KpiCard
            label="Overdue · 14+ days stale"
            value={kpis.overdue}
            sublabel={`${overduePct}% of open`}
            valueColor="var(--accent-red)"
          />
          <KpiCard
            label="Avg Days Open"
            value={kpis.avgDaysOpen != null ? kpis.avgDaysOpen.toFixed(1) : null}
          />
          <KpiCard
            label="Closed This Month"
            value={kpis.closedMonth}
            valueColor="var(--accent-green)"
          />
        </div>
      </div>

      {/* ── Section B: Pipeline Breakdown ── */}
      <div>
        <SectionLabel>Pipeline Breakdown — Open Claims by Stage</SectionLabel>
        <div style={{ display: 'flex', gap: 16 }}>
          <PipelineTable title="AST Claims" rows={pipeline.ast} />
          <PipelineTable title="UST Claims" rows={pipeline.ust} />
        </div>
      </div>

      {/* ── Section C: Bottleneck Alert ── */}
      <div>
        <SectionLabel>Bottleneck Alert — Top Stages by Avg Dwell Time</SectionLabel>
        {bottlenecks.length === 0 ? (
          <div
            style={{
              color: 'var(--text-tertiary)',
              fontSize: 13,
              padding: '12px 0',
            }}
          >
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

      {/* ── Section D: Recent Activity ── */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 12,
          }}
        >
          <SectionLabel>Recent Activity</SectionLabel>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            Refreshes every 30s
          </span>
        </div>
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '4px 16px',
          }}
        >
          {/* Header row */}
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
              No recent activity
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
