'use client'

import { useState } from 'react'

// ─── types ─────────────────────────────────────────────────────────────────────

type AttentionItem = {
  claim_id: string
  fsn: string
  owner_name: string
  stage: string
  days_stale: number
  tank_type: string
  zoho_id: string
}

type BottleneckItem = {
  stage: string
  pipeline: string
  claim_count: number
  avg_days: number
}

type AgentRow = {
  agent_name: string
  total_open: number
  stale_count: number
  stale_pct: number
  oldest_claim_days: number
  ast_open: number
  ust_open: number
}

type ByPipelineRow = {
  pipeline: string
  estimated: number
  collected: number
}

type DenialReason = {
  reason: string
  count: number
}

type DigestPayload = {
  meta: {
    generated_at: string
    period: string
    period_label: string
    period_start: string
    period_end: string
    last_synced_at: string | null
  }
  snapshot: {
    total_open: number
    opened_this_period: number
    closed_this_period: number
    stale_rate_pct: number
    total_estimated: number
    collection_rate_pct: number
  }
  pop: {
    opened_delta: number
    closed_delta: number
    open_total_delta: number
    stale_rate_delta: number
  }
  pipelines: {
    ast: {
      open: number
      opened_this_period: number
      closed_this_period: number
      stale_count: number
      stale_rate_pct: number
      pop_open_delta: number
    }
    ust: {
      open: number
      opened_this_period: number
      closed_this_period: number
      stale_count: number
      stale_rate_pct: number
      pop_open_delta: number
    }
  }
  bottlenecks: BottleneckItem[]
  attention: {
    stale_60d: AttentionItem[]
    emergency: AttentionItem[]
  }
  agents: AgentRow[]
  financial: {
    total_estimated: number
    total_paid: number
    collection_rate_pct: number
    contractor_costs: number
    state_fees: number
    adjuster_fees: number
    by_pipeline: ByPipelineRow[]
  }
  denials: {
    denied_this_period: number
    ytd_denial_rate_pct: number
    reasons: DenialReason[]
  }
}

// ─── helpers ───────────────────────────────────────────────────────────────────

function fmtDollar(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}m`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n)}`
}

function collectionRateColor(pct: number): string {
  if (pct > 80) return '#4CAF82'
  if (pct >= 50) return '#E8C84A'
  return '#E84A4A'
}

function stalePctColor(pct: number): string {
  if (pct >= 50) return '#E84A4A'
  if (pct >= 25) return '#E8A53A'
  return 'var(--text-tertiary)'
}

function oldestColor(days: number): string {
  if (days > 60) return '#E84A4A'
  if (days >= 30) return '#E8A53A'
  return 'var(--text-tertiary)'
}

function staleDaysColor(days: number): string {
  if (days > 90) return '#E84A4A'
  if (days >= 60) return '#E8A53A'
  return 'var(--text-primary)'
}

function bnBarColor(avgDays: number): string {
  if (avgDays >= 60) return '#E84A4A'
  if (avgDays >= 30) return '#E87A3A'
  if (avgDays >= 21) return '#E8A53A'
  if (avgDays >= 14) return 'rgba(232,200,74,0.55)'
  return 'transparent'
}

function formatPeriodDate(period: string, iso: string): string {
  const d = new Date(iso)
  if (period === 'month') {
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  }
  if (period === 'quarter') {
    const q = Math.floor(d.getUTCMonth() / 3) + 1
    return `Q${q} ${d.getUTCFullYear()}`
  }
  if (period === 'year') {
    return String(d.getUTCFullYear())
  }
  return d.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  })
}

function formatGeneratedAt(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function zohoUrl(zohoId: string): string {
  return `https://crm.zoho.com/crm/org884788391/tab/Deals/${zohoId}`
}

// ─── delta badge ───────────────────────────────────────────────────────────────

function DeltaBadge({
  delta,
  positiveIsBad,
}: {
  delta: number
  positiveIsBad: boolean
}) {
  if (delta === 0) {
    return <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>— no change</span>
  }
  const isBad = positiveIsBad ? delta > 0 : delta < 0
  const color = isBad ? '#E84A4A' : '#4CAF82'
  const arrow = delta > 0 ? '↑' : '↓'
  return (
    <span style={{ fontSize: 12, color, fontWeight: 500 }}>
      {arrow}{Math.abs(delta)}
    </span>
  )
}

function DeltaBadgePct({
  delta,
  positiveIsBad,
}: {
  delta: number
  positiveIsBad: boolean
}) {
  if (delta === 0) {
    return <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>— no change</span>
  }
  const isBad = positiveIsBad ? delta > 0 : delta < 0
  const color = isBad ? '#E84A4A' : '#4CAF82'
  const arrow = delta > 0 ? '↑' : '↓'
  return (
    <span style={{ fontSize: 12, color, fontWeight: 500 }}>
      {arrow}{Math.abs(delta)}%
    </span>
  )
}

// ─── section card shell ────────────────────────────────────────────────────────

function SectionCard({
  title,
  subtitle,
  children,
  style,
  className,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  style?: React.CSSProperties
  className?: string
}) {
  return (
    <div
      className={className}
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '20px 24px',
        ...style,
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
        {subtitle && (
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3 }}>{subtitle}</div>
        )}
      </div>
      {children}
    </div>
  )
}

// ─── pipeline badge ────────────────────────────────────────────────────────────

function PipelineBadge({ pipeline }: { pipeline: string }) {
  const bg = pipeline === 'AST' ? '#2a78d6' : pipeline === 'UST' ? '#E8C84A' : 'var(--bg-elevated)'
  const color = pipeline === 'UST' ? '#111' : '#fff'
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.06em',
        padding: '1px 6px',
        borderRadius: 4,
        background: bg,
        color,
      }}
    >
      {pipeline}
    </span>
  )
}

// ─── table th helper ──────────────────────────────────────────────────────────

const TH_STYLE: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.06em',
  color: 'var(--text-tertiary)',
  padding: '0 12px 8px 0',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
}

const TH_RIGHT: React.CSSProperties = { ...TH_STYLE, textAlign: 'right' }

// ─── skeleton ──────────────────────────────────────────────────────────────────

function Skel({ width, height }: { width: number | string; height: number }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 4,
        background: 'var(--bg-elevated)',
        opacity: 0.6,
        animation: 'pulse 1.5s ease-in-out infinite',
      }}
    />
  )
}

function DigestSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* action bar skeleton */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 0',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <Skel width={260} height={14} />
        <div style={{ display: 'flex', gap: 8 }}>
          <Skel width={96} height={30} />
          <Skel width={128} height={30} />
        </div>
      </div>
      {/* narrative placeholder */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '20px 24px' }}>
        <Skel width={140} height={14} />
        <div style={{ marginTop: 12 }}><Skel width="100%" height={11} /></div>
        <div style={{ marginTop: 6 }}><Skel width="80%" height={11} /></div>
      </div>
      {/* snapshot tiles */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '20px 24px' }}>
        <Skel width={180} height={14} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 16 }}>
          {[1,2,3,4,5,6].map((i) => (
            <div key={i} style={{ background: 'var(--bg-elevated)', borderRadius: 10, padding: 16, border: '1px solid var(--border)' }}>
              <Skel width={80} height={10} />
              <div style={{ marginTop: 10 }}><Skel width={60} height={28} /></div>
              <div style={{ marginTop: 6 }}><Skel width={50} height={11} /></div>
            </div>
          ))}
        </div>
      </div>
      {/* pipeline cards */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '20px 24px' }}>
        <Skel width={200} height={14} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }}>
          {[1,2].map((i) => (
            <div key={i} style={{ background: 'var(--bg-elevated)', borderRadius: 8, padding: 16, border: '1px solid var(--border)' }}>
              <Skel width={80} height={20} />
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[1,2,3,4].map((j) => <Skel key={j} width="100%" height={12} />)}
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* remaining sections */}
      {[200, 240, 300, 200, 180].map((h, i) => (
        <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '20px 24px', height: h }}>
          <Skel width={160} height={14} />
        </div>
      ))}
      <style>{`@keyframes pulse { 0%,100%{opacity:0.6} 50%{opacity:0.35} }`}</style>
    </div>
  )
}

// ─── section 3: executive snapshot ────────────────────────────────────────────

function SnapshotSection({ data, periodLabel }: { data: DigestPayload; periodLabel: string }) {
  const { snapshot, pop, financial } = data
  const pl = periodLabel.toLowerCase()

  type TileDef = {
    label: string
    value: string
    valueColor?: string
    delta?: React.ReactNode
  }

  const tiles: TileDef[] = [
    {
      label: 'Total open',
      value: String(snapshot.total_open),
      delta: <DeltaBadge delta={pop.open_total_delta} positiveIsBad={true} />,
    },
    {
      label: `Opened this ${pl}`,
      value: String(snapshot.opened_this_period),
      delta: <DeltaBadge delta={pop.opened_delta} positiveIsBad={true} />,
    },
    {
      label: `Closed this ${pl}`,
      value: String(snapshot.closed_this_period),
      delta: <DeltaBadge delta={pop.closed_delta} positiveIsBad={false} />,
    },
    {
      label: 'Stale rate',
      value: `${snapshot.stale_rate_pct}%`,
      delta: <DeltaBadgePct delta={pop.stale_rate_delta} positiveIsBad={true} />,
    },
    {
      label: 'Total estimated',
      value: fmtDollar(financial.total_estimated),
    },
    {
      label: 'Collection rate',
      value: `${financial.collection_rate_pct}%`,
      valueColor: collectionRateColor(financial.collection_rate_pct),
    },
  ]

  return (
    <SectionCard title="Executive snapshot">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {tiles.map((t) => (
          <div
            key={t.label}
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: 16,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--text-tertiary)',
                marginBottom: 6,
              }}
            >
              {t.label}
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                color: t.valueColor ?? 'var(--text-primary)',
                lineHeight: 1.1,
              }}
            >
              {t.value}
            </div>
            {t.delta && <div style={{ marginTop: 4 }}>{t.delta}</div>}
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

// ─── section 4: pipeline health ───────────────────────────────────────────────

function PipelineMetricRow({
  label,
  value,
  valueColor,
  delta,
}: {
  label: string
  value: string
  valueColor?: string
  delta?: React.ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '7px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {delta}
        <span
          style={{
            fontSize: 14,
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
            color: valueColor ?? 'var(--text-primary)',
          }}
        >
          {value}
        </span>
      </div>
    </div>
  )
}

function PipelineCard({
  name,
  p,
}: {
  name: 'AST' | 'UST'
  p: DigestPayload['pipelines']['ast']
}) {
  const badgeBg = name === 'AST' ? '#2a78d6' : '#E8C84A'
  const badgeColor = name === 'UST' ? '#111' : '#fff'
  const stalePct = p.stale_rate_pct
  const staleColor =
    stalePct >= 60 ? '#E84A4A' : stalePct >= 30 ? '#E8A53A' : '#4CAF82'

  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.06em',
            padding: '3px 10px',
            borderRadius: 5,
            background: badgeBg,
            color: badgeColor,
          }}
        >
          {name}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Pipeline</span>
      </div>

      <PipelineMetricRow
        label="Open claims"
        value={String(p.open)}
        delta={<DeltaBadge delta={p.pop_open_delta} positiveIsBad={true} />}
      />
      <PipelineMetricRow label="Opened" value={String(p.opened_this_period)} />
      <PipelineMetricRow label="Closed" value={String(p.closed_this_period)} />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '7px 0',
        }}
      >
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Stale rate</span>
        <span style={{ fontSize: 14, fontWeight: 600, color: staleColor }}>
          {stalePct}%
        </span>
      </div>
    </div>
  )
}

function PipelineHealthSection({ data, periodLabel }: { data: DigestPayload; periodLabel: string }) {
  return (
    <SectionCard title={`Pipeline health — this ${periodLabel.toLowerCase()}`}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <PipelineCard name="AST" p={data.pipelines.ast} />
        <PipelineCard name="UST" p={data.pipelines.ust} />
      </div>
    </SectionCard>
  )
}

// ─── section 5: bottlenecks ────────────────────────────────────────────────────

function BottlenecksSection({ bottlenecks }: { bottlenecks: BottleneckItem[] }) {
  return (
    <SectionCard
      title="Top stage bottlenecks"
      subtitle="Stages with the longest average dwell time on currently open claims"
    >
      {bottlenecks.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No bottleneck data available.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {bottlenecks.map((bn, i) => {
            const barColor = bnBarColor(bn.avg_days)
            const barWidth = Math.min((bn.avg_days / 90) * 100, 100)
            return (
              <div
                key={`${bn.stage}-${bn.pipeline}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '24px 1fr auto 120px',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  background: 'var(--bg-elevated)',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                }}
              >
                <span style={{ fontSize: 13, color: 'var(--text-tertiary)', fontWeight: 500 }}>
                  {i + 1}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                    {bn.stage}
                  </span>
                  <PipelineBadge pipeline={bn.pipeline} />
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                  {bn.claim_count} claim{bn.claim_count !== 1 ? 's' : ''}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div
                    style={{
                      flex: 1,
                      height: 6,
                      background: 'var(--bg-base)',
                      borderRadius: 3,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${barWidth}%`,
                        background: barColor !== 'transparent' ? barColor : 'var(--border)',
                        borderRadius: 3,
                      }}
                    />
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: barColor !== 'transparent' ? barColor : 'var(--text-tertiary)',
                      whiteSpace: 'nowrap',
                      minWidth: 44,
                      textAlign: 'right',
                    }}
                  >
                    {bn.avg_days}d avg
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}

// ─── section 6: attention ─────────────────────────────────────────────────────

function AttentionTable({
  items,
  showEmergencyBadge,
}: {
  items: AttentionItem[]
  showEmergencyBadge: boolean
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 3px' }}>
        <thead>
          <tr>
            <th style={TH_STYLE}>FSN</th>
            <th style={TH_STYLE}>Agent</th>
            <th style={TH_STYLE}>Stage</th>
            <th style={TH_STYLE}>Pipeline</th>
            <th style={TH_RIGHT}>Days stale</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const bg = item.days_stale > 90
              ? 'rgba(232,74,74,0.07)'
              : 'var(--bg-elevated)'
            return (
              <tr key={item.claim_id}>
                <td style={{ padding: '8px 12px 8px 0', background: bg, borderRadius: '4px 0 0 4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <a
                      href={zohoUrl(item.zoho_id)}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        fontSize: 13,
                        color: '#2a78d6',
                        textDecoration: 'none',
                        fontWeight: 500,
                      }}
                    >
                      {item.fsn}
                    </a>
                    {showEmergencyBadge && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing: '0.06em',
                          padding: '2px 5px',
                          borderRadius: 3,
                          background: '#E84A4A',
                          color: '#fff',
                        }}
                      >
                        EMERGENCY
                      </span>
                    )}
                  </div>
                </td>
                <td style={{ padding: '8px 12px 8px 0', fontSize: 13, color: 'var(--text-secondary)', background: bg }}>
                  {item.owner_name || '—'}
                </td>
                <td style={{ padding: '8px 12px 8px 0', fontSize: 13, color: 'var(--text-secondary)', background: bg }}>
                  {item.stage}
                </td>
                <td style={{ padding: '8px 12px 8px 0', background: bg }}>
                  <PipelineBadge pipeline={item.tank_type || 'Other'} />
                </td>
                <td
                  style={{
                    padding: '8px 0',
                    fontSize: 13,
                    fontWeight: 600,
                    color: staleDaysColor(item.days_stale),
                    textAlign: 'right',
                    background: bg,
                    borderRadius: '0 4px 4px 0',
                  }}
                >
                  {item.days_stale}d
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function AttentionSection({ attention }: { attention: DigestPayload['attention'] }) {
  const { stale_60d, emergency } = attention

  return (
    <SectionCard title="Claims requiring immediate attention" className="page-break-before">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--text-tertiary)',
              marginBottom: 12,
            }}
          >
            Stale 60+ days
          </div>
          {stale_60d.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#4CAF82' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4CAF82', display: 'inline-block' }} />
              No claims past 60 days — all clear
            </div>
          ) : (
            <AttentionTable items={stale_60d} showEmergencyBadge={false} />
          )}
        </div>

        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--text-tertiary)',
              marginBottom: 12,
            }}
          >
            Emergency claims
          </div>
          {emergency.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#4CAF82' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4CAF82', display: 'inline-block' }} />
              No open emergency claims
            </div>
          ) : (
            <AttentionTable items={emergency} showEmergencyBadge={true} />
          )}
        </div>
      </div>
    </SectionCard>
  )
}

// ─── section 7: agent workload ────────────────────────────────────────────────

function AgentWorkloadSection({ agents }: { agents: AgentRow[] }) {
  return (
    <SectionCard title="Agent workload">
      {agents.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No agent data available.</div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 3px' }}>
              <thead>
                <tr>
                  <th style={TH_STYLE}>Agent</th>
                  <th style={TH_RIGHT}>Open</th>
                  <th style={TH_RIGHT}>Stale</th>
                  <th style={TH_RIGHT}>Stale %</th>
                  <th style={TH_RIGHT}>Oldest</th>
                  <th style={TH_RIGHT}>AST</th>
                  <th style={TH_RIGHT}>UST</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((row, idx) => {
                  const bg = idx % 2 === 0 ? 'var(--bg-elevated)' : 'transparent'
                  const sColor = stalePctColor(row.stale_pct)
                  const oColor = oldestColor(row.oldest_claim_days)
                  const cell = (extra: React.CSSProperties = {}): React.CSSProperties => ({
                    padding: '8px 8px 8px 0',
                    background: bg,
                    ...extra,
                  })
                  return (
                    <tr key={row.agent_name}>
                      <td style={cell({ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, borderRadius: '4px 0 0 4px', paddingLeft: 10 })}>
                        {row.agent_name}
                      </td>
                      <td style={cell({ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, textAlign: 'right' })}>
                        {row.total_open}
                      </td>
                      <td style={cell({ fontSize: 13, color: row.stale_count > 0 ? '#E8A53A' : 'var(--text-tertiary)', textAlign: 'right' })}>
                        {row.stale_count}
                      </td>
                      <td style={cell({ textAlign: 'right' })}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                          <div style={{ width: 48, height: 4, background: 'var(--bg-base)', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
                            <div style={{ height: '100%', width: `${Math.min(row.stale_pct, 100)}%`, background: sColor, borderRadius: 2 }} />
                          </div>
                          <span style={{ fontSize: 12, color: sColor, fontWeight: 500, minWidth: 32, textAlign: 'right' }}>
                            {row.stale_pct}%
                          </span>
                        </div>
                      </td>
                      <td style={cell({ fontSize: 13, fontWeight: 600, color: oColor, textAlign: 'right' })}>
                        {Math.round(row.oldest_claim_days)}d
                      </td>
                      <td style={cell({ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'right' })}>
                        {row.ast_open}
                      </td>
                      <td style={cell({ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'right', borderRadius: '0 4px 4px 0', paddingRight: 10 })}>
                        {row.ust_open}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-tertiary)' }}>
            Stale threshold: 14 days without a stage change. High stale rates across all agents indicate systemic pipeline delays, not individual performance issues.
          </div>
        </>
      )}
    </SectionCard>
  )
}

// ─── section 8: financial ─────────────────────────────────────────────────────

function FinancialSection({ financial }: { financial: DigestPayload['financial'] }) {
  const rateColor = collectionRateColor(financial.collection_rate_pct)

  return (
    <SectionCard title="Financial overview" className="page-break-before">
      {/* headline stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total estimated', value: fmtDollar(financial.total_estimated), color: undefined },
          { label: 'Total collected', value: fmtDollar(financial.total_paid), color: undefined },
          { label: 'Collection rate', value: `${financial.collection_rate_pct}%`, color: rateColor },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 14,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 4 }}>
              {stat.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: stat.color ?? 'var(--text-primary)' }}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* pipeline table */}
      {financial.by_pipeline.length > 0 && (
        <div style={{ overflowX: 'auto', marginBottom: 20 }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 3px' }}>
            <thead>
              <tr>
                <th style={TH_STYLE}>Pipeline</th>
                <th style={TH_RIGHT}>Estimated</th>
                <th style={TH_RIGHT}>Collected</th>
                <th style={TH_RIGHT}>Rate</th>
              </tr>
            </thead>
            <tbody>
              {financial.by_pipeline.map((row) => {
                const rate = row.estimated > 0 ? Math.round((row.collected / row.estimated) * 100) : 0
                const rColor = collectionRateColor(rate)
                return (
                  <tr key={row.pipeline}>
                    <td style={{ padding: '8px 0', background: 'var(--bg-elevated)', borderRadius: '4px 0 0 4px', paddingLeft: 10 }}>
                      <PipelineBadge pipeline={row.pipeline} />
                    </td>
                    <td style={{ padding: '8px 0', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)', textAlign: 'right', background: 'var(--bg-elevated)' }}>
                      {fmtDollar(row.estimated)}
                    </td>
                    <td style={{ padding: '8px 0', fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)', textAlign: 'right', background: 'var(--bg-elevated)' }}>
                      {fmtDollar(row.collected)}
                    </td>
                    <td style={{ padding: '8px 10px 8px 0', fontSize: 13, fontWeight: 600, color: rColor, textAlign: 'right', background: 'var(--bg-elevated)', borderRadius: '0 4px 4px 0' }}>
                      {rate}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* cost pills */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[
          { label: 'Contractor', value: financial.contractor_costs },
          { label: 'State fees', value: financial.state_fees },
          { label: 'Adj. fees', value: financial.adjuster_fees },
        ].map((pill) => (
          <div
            key={pill.label}
            style={{
              fontSize: 12,
              padding: '5px 12px',
              borderRadius: 20,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
            }}
          >
            {pill.label}: <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{fmtK(pill.value)}</span>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

// ─── section 9: denials ────────────────────────────────────────────────────────

function DenialsSection({ denials, periodLabel }: { denials: DigestPayload['denials']; periodLabel: string }) {
  const { denied_this_period, ytd_denial_rate_pct, reasons } = denials
  const noDenied = denied_this_period === 0

  return (
    <SectionCard title="Denial snapshot">
      {/* headline stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 4 }}>
            Denied this {periodLabel.toLowerCase()}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: noDenied ? '#4CAF82' : '#E84A4A' }}>
            {denied_this_period}
          </div>
        </div>
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 4 }}>
            YTD denial rate
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: ytd_denial_rate_pct > 10 ? '#E84A4A' : ytd_denial_rate_pct > 5 ? '#E8C84A' : '#4CAF82' }}>
            {ytd_denial_rate_pct}%
          </div>
        </div>
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 4 }}>
            Reasons on record
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
            {reasons.length}
          </div>
        </div>
      </div>

      {/* no denials this month banner */}
      {noDenied && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 14px',
            background: 'rgba(76,207,130,0.1)',
            border: '1px solid rgba(76,207,130,0.3)',
            borderRadius: 6,
            fontSize: 13,
            color: '#4CAF82',
            fontWeight: 500,
            marginBottom: reasons.length > 0 ? 16 : 0,
          }}
        >
          ✓ No claims denied this {periodLabel.toLowerCase()}
        </div>
      )}

      {/* reasons list */}
      {reasons.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
          No denied claims on record.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 4 }}>
            Denial reasons (all-time)
          </div>
          {reasons.map((r) => (
            <div
              key={r.reason}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '7px 12px',
                background: 'var(--bg-elevated)',
                borderRadius: 5,
                border: '1px solid var(--border)',
              }}
            >
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{r.reason}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{r.count}</span>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

// ─── narrative section ─────────────────────────────────────────────────────────

type NarrativeStatus = 'idle' | 'loading' | 'done' | 'unavailable' | 'error'

function NarrativeSection({
  status,
  text,
  periodLabel,
  onRetry,
}: {
  status: NarrativeStatus
  text: string | null
  periodLabel: string
  onRetry: () => void
}) {
  const cardBase: React.CSSProperties = {
    background: 'var(--bg-surface)',
    borderRadius: 6,
    padding: '20px 24px',
  }

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{periodLabel} summary</span>
      <span style={{ fontSize: 14 }}>✦</span>
    </div>
  )

  if (status === 'idle') {
    return (
      <div style={{ ...cardBase, border: '1px solid rgba(155,89,182,0.3)' }}>
        {header}
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', fontStyle: 'italic', margin: 0, lineHeight: 1.6 }}>
          Generating narrative summary...
        </p>
      </div>
    )
  }

  if (status === 'loading') {
    return (
      <div style={{ ...cardBase, border: '1px solid rgba(155,89,182,0.3)' }}>
        {header}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {([100, 90, 60] as const).map((w, i) => (
            <div
              key={i}
              style={{
                width: `${w}%`,
                height: 14,
                borderRadius: 4,
                background: 'var(--bg-elevated)',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
          ))}
        </div>
      </div>
    )
  }

  if (status === 'unavailable') {
    return (
      <div style={{ ...cardBase, border: '1px solid rgba(155,89,182,0.3)' }}>
        {header}
        <p style={{ fontSize: 13, color: 'var(--text-tertiary)', fontStyle: 'italic', margin: 0, lineHeight: 1.6 }}>
          Narrative generation requires an ANTHROPIC_API_KEY environment variable. Add it to .env.local and redeploy to enable this feature.
        </p>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div style={{ ...cardBase, border: '1px solid rgba(232,74,74,0.35)' }}>
        {header}
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.6 }}>
          Summary unavailable — failed to reach narrative API.
        </p>
        <a
          onClick={onRetry}
          style={{ fontSize: 12, color: 'var(--text-tertiary)', textDecoration: 'underline', cursor: 'pointer' }}
        >
          Retry
        </a>
      </div>
    )
  }

  // status === 'done'
  const paragraphs = text ? text.split(/\n\n+/).filter((p) => p.trim()) : []

  return (
    <div style={{ ...cardBase, border: '1px solid rgba(155,89,182,0.3)' }}>
      {header}
      {paragraphs.map((p, i) => (
        <p
          key={i}
          style={{
            fontSize: 14,
            lineHeight: 1.7,
            color: 'var(--text-primary)',
            margin: i < paragraphs.length - 1 ? '0 0 12px' : '0 0 16px',
          }}
        >
          {p}
        </p>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          Generated by Claude · ProGuard Claims Dashboard
        </span>
        <a
          onClick={onRetry}
          style={{ fontSize: 12, color: 'var(--text-tertiary)', textDecoration: 'underline', cursor: 'pointer' }}
        >
          Regenerate summary
        </a>
      </div>
    </div>
  )
}

// ─── main page ─────────────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { value: 'week',    label: 'Weekly' },
  { value: 'month',   label: 'Monthly' },
  { value: 'quarter', label: 'Quarterly' },
  { value: 'year',    label: 'Yearly' },
]

type PageState = 'idle' | 'loading' | 'loaded' | 'error'

export default function DigestPage() {
  const [period, setPeriod] = useState<string>('week')
  const [state, setState] = useState<PageState>('idle')
  const [digest, setDigest] = useState<DigestPayload | null>(null)
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [narrativeStatus, setNarrativeStatus] = useState<NarrativeStatus>('idle')
  const [narrativeText, setNarrativeText] = useState<string | null>(null)

  async function fetchNarrativeForPeriod(p: string) {
    setNarrativeStatus('loading')
    try {
      const res = await fetch(`/api/internal/digest/narrative?period=${p}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { available: boolean; narrative?: string; message?: string }
      if (!data.available) {
        setNarrativeStatus('unavailable')
      } else {
        setNarrativeText(data.narrative ?? null)
        setNarrativeStatus('done')
      }
    } catch {
      setNarrativeStatus('error')
    }
  }

  async function generateForPeriod(p: string) {
    setState('loading')
    setErrorMsg('')
    setNarrativeStatus('idle')
    setNarrativeText(null)
    try {
      const res = await fetch(`/api/internal/digest?period=${p}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText })) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json() as DigestPayload
      setDigest(data)
      setState('loaded')
      void fetchNarrativeForPeriod(p)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
      setState('error')
    }
  }

  function generate() {
    void generateForPeriod(period)
  }

  function handlePeriodChange(newPeriod: string) {
    setPeriod(newPeriod)
    if (state === 'loaded' || state === 'error') {
      void generateForPeriod(newPeriod)
    }
  }

  const periodDisplayName = PERIOD_OPTIONS.find((o) => o.value === period)?.label ?? 'Weekly'

  const PeriodSelector = (
    <div style={{ display: 'flex', gap: 4 }}>
      {PERIOD_OPTIONS.map((opt) => {
        const active = period === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => handlePeriodChange(opt.value)}
            style={{
              padding: '5px 13px',
              fontSize: 12,
              fontWeight: active ? 600 : 400,
              borderRadius: 20,
              border: active ? 'none' : '1px solid var(--border)',
              background: active ? '#E8C84A' : 'transparent',
              color: active ? '#111' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )

  // ── idle: centered generate screen ──────────────────────────────────────────

  if (state === 'idle') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          minHeight: '60vh',
          gap: 12,
          textAlign: 'center',
        }}
      >
        {PeriodSelector}
        <div style={{ fontSize: 24, fontWeight: 600, color: 'var(--text-primary)', marginTop: 4 }}>
          {periodDisplayName} Claims Digest
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-tertiary)', maxWidth: 360 }}>
          Compiled from live Supabase data across all pipelines
        </div>
        <button
          onClick={generate}
          style={{
            marginTop: 8,
            padding: '10px 24px',
            fontSize: 14,
            fontWeight: 600,
            background: '#E8C84A',
            color: '#111',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          Generate {periodDisplayName.toLowerCase()} digest
        </button>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Takes ~2 seconds to compile</div>
      </div>
    )
  }

  // ── loading: skeleton ────────────────────────────────────────────────────────

  if (state === 'loading') {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 40px' }}>
        <DigestSkeleton />
      </div>
    )
  }

  // ── error ────────────────────────────────────────────────────────────────────

  if (state === 'error') {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 40px' }}>
        <div style={{ marginBottom: 16 }}>{PeriodSelector}</div>
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
          <div style={{ fontSize: 15, fontWeight: 600, color: '#E84A4A' }}>Failed to generate digest</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{errorMsg}</div>
          <button
            onClick={generate}
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
            Try again
          </button>
        </div>
      </div>
    )
  }

  // ── loaded ────────────────────────────────────────────────────────────────────

  if (!digest) return null

  const periodLabel = digest.meta.period_label
  const periodDate = formatPeriodDate(digest.meta.period, digest.meta.period_start)
  const generatedAt = formatGeneratedAt(digest.meta.generated_at)

  return (
    <>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:0.6} 50%{opacity:0.35} }

        @media print {
          /* Hide navigation chrome */
          nav,
          aside,
          header,
          [data-sidebar],
          .sidebar,
          .top-nav,
          .action-bar {
            display: none !important;
          }

          /* Reset layout offsets imposed by the fixed sidebar/nav */
          body,
          html {
            margin: 0 !important;
            padding: 0 !important;
          }

          /* The main content wrapper Next.js renders — override
             the ml-[220px] and mt-[52px] offsets */
          main,
          #__next > div,
          #__next > div > div {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
          }

          /* Digest content area itself */
          .digest-content {
            margin: 0 !important;
            padding: 16px !important;
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
          }

          /* Force color printing */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Page breaks */
          .page-break-before {
            page-break-before: always !important;
          }

          /* Remove shadows */
          * {
            box-shadow: none !important;
          }

          /* Base font size for print */
          body {
            font-size: 11px !important;
          }

          /* Ensure cards don't overflow */
          .digest-card,
          [class*="rounded"],
          [class*="border"] {
            overflow: visible !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
          }

          /* Action bar hidden */
          .digest-action-bar {
            display: none !important;
          }

          /* Print header visible */
          .digest-print-header {
            display: flex !important;
          }
        }
        @media screen {
          .digest-print-header { display: none; }
        }
      `}</style>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 24px 40px' }}>

        {/* ── SECTION 1: print header ────────────────────────────────────── */}
        <div
          className="digest-print-header"
          style={{
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingBottom: 12,
            marginBottom: 20,
            borderBottom: '2px solid var(--border)',
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>ProGuard</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{periodLabel} Claims Digest</span>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{periodDate}</span>
        </div>

        {/* ── action bar ────────────────────────────────────────────────── */}
        <div
          className="digest-action-bar"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingBottom: 16,
            marginBottom: 20,
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {PeriodSelector}
            <div>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                {periodLabel} Digest — {periodDate}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 12 }}>
                Generated {generatedAt}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={generate}
              style={{
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 500,
                background: 'transparent',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-bright)',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              Regenerate
            </button>
            <button
              onClick={() => window.print()}
              style={{
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 600,
                background: '#E8C84A',
                color: '#111',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              Print / Export PDF
            </button>
          </div>
        </div>

        <div className="digest-content" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── SECTION 2: AI narrative ──────────────────────────────────── */}
          <NarrativeSection
            status={narrativeStatus}
            text={narrativeText}
            periodLabel={periodLabel}
            onRetry={() => fetchNarrativeForPeriod(period)}
          />

          {/* ── SECTION 3: executive snapshot ───────────────────────────── */}
          <SnapshotSection data={digest} periodLabel={periodLabel} />

          {/* ── SECTION 4: pipeline health ──────────────────────────────── */}
          <PipelineHealthSection data={digest} periodLabel={periodLabel} />

          {/* ── SECTION 5: bottlenecks ──────────────────────────────────── */}
          <BottlenecksSection bottlenecks={digest.bottlenecks} />

          {/* ── SECTION 6: attention ────────────────────────────────────── */}
          <AttentionSection attention={digest.attention} />

          {/* ── SECTION 7: agent workload ────────────────────────────────  */}
          <AgentWorkloadSection agents={digest.agents} />

          {/* ── SECTION 8: financial ────────────────────────────────────── */}
          <FinancialSection financial={digest.financial} />

          {/* ── SECTION 9: denials ──────────────────────────────────────── */}
          <DenialsSection denials={digest.denials} periodLabel={periodLabel} />

        </div>
      </div>
    </>
  )
}
