'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LabelList,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
  ReferenceLine,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

// ─── types ─────────────────────────────────────────────────────────────────────

type BottleneckRow = {
  stage: string
  pipeline: string
  claim_count: number
  avg_days_in_stage: number
}

type StaleRow = {
  pipeline: string
  bucket: string
  count: number
}

type Tab = 'operations' | 'leadership'

type DwellRow = {
  stage: string
  pipeline: string
  claim_count: number
  median_days: number
  p90_days: number
}

type DwellFilter = 'All' | 'AST' | 'UST'

type VolumeEntry = { week: string; pipeline: string; count: number }
type VolumeData = { opened: VolumeEntry[]; closed: VolumeEntry[] }

type WeekDatum = {
  week: string
  ast_opened: number
  ast_closed: number
  ust_opened: number
  ust_closed: number
}

type DwellDatum = {
  label: string
  stage: string
  pipeline: string
  median_days: number
  p90_days: number
  claim_count: number
}

type FinancialEstimate = {
  pipeline: string
  claims_with_estimates: number
  total_estimated: number
  avg_per_claim: number
  total_contractor_costs: number
  total_state_fees: number
  total_adjuster_fees: number
}

type FinancialPayment = {
  pipeline: string
  claims_with_payments: number
  total_paid: number
}

type FinancialTotals = {
  total_estimated: number
  total_paid: number
  collection_rate_pct: number
}

type FinancialData = {
  estimates: FinancialEstimate[]
  payments: FinancialPayment[]
  totals: FinancialTotals
}

type FinancialChartDatum = { pipeline: string; Estimated: number; Collected: number }

type DenialTrendRow = {
  month: string
  total_closed: number
  denied: number
  denial_rate_pct: number
}

type DenialReason = {
  claim_denied_reason: string
  count: number
}

type GroupedReason = { label: string; count: number }

type AgentRow = {
  agent_name: string
  total_open: number
  stale_count: number
  stale_pct: number
  oldest_claim_days: number
  ast_open: number
  ust_open: number
}

// ─── constants ─────────────────────────────────────────────────────────────────

const BUCKET_COLORS: Record<string, string> = {
  '14-21d': '#E8C84A',
  '21-30d': '#E8A53A',
  '30-60d': '#E87A3A',
  '60d+':   '#E84A4A',
}
const BUCKETS = ['14-21d', '21-30d', '30-60d', '60d+'] as const

const DENIAL_COLORS = [
  '#E84A4A', '#E87A3A', '#E8A53A', '#E8C84A',
  '#4CAF82', '#2a78d6', '#9b59b6',
]

// ─── helpers ───────────────────────────────────────────────────────────────────

function cellBg(avgDays: number, claimCount: number): string {
  if (claimCount === 0) return 'transparent'
  if (avgDays < 14) return 'transparent'
  if (avgDays < 21) return 'rgba(232, 200, 74, 0.15)'
  if (avgDays < 30) return 'rgba(232, 200, 74, 0.35)'
  if (avgDays < 60) return 'rgba(232, 130, 58, 0.40)'
  return 'rgba(232, 74, 74, 0.35)'
}

// ─── data transforms ───────────────────────────────────────────────────────────

type StageTableRow = {
  stage: string
  ast: BottleneckRow | null
  ust: BottleneckRow | null
}

function buildStageTable(rows: BottleneckRow[]): StageTableRow[] {
  const lookup: Record<string, BottleneckRow> = {}
  for (const r of rows) {
    lookup[`${r.stage}||${r.pipeline}`] = r
  }

  // Collect unique stages in API order (already sorted by avg_days DESC)
  const seen: Record<string, true> = {}
  const stages: string[] = []
  for (const r of rows) {
    if (!seen[r.stage]) {
      seen[r.stage] = true
      stages.push(r.stage)
    }
  }

  return stages.map((stage) => ({
    stage,
    ast: lookup[`${stage}||AST`] ?? null,
    ust: lookup[`${stage}||UST`] ?? null,
  }))
}

type ChartDatum = { pipeline: string; [bucket: string]: number | string }

function buildChartData(rows: StaleRow[]): ChartDatum[] {
  const lookup: Record<string, number> = {}
  for (const r of rows) {
    lookup[`${r.pipeline}||${r.bucket}`] = r.count
  }
  return ['AST', 'UST'].map((pipeline) => {
    const datum: ChartDatum = { pipeline }
    for (const b of BUCKETS) {
      datum[b] = lookup[`${pipeline}||${b}`] ?? 0
    }
    return datum
  })
}

function buildVolumeChartData(volume: VolumeData): WeekDatum[] {
  const weekSet: Record<string, true> = {}
  for (const r of volume.opened) weekSet[r.week] = true
  for (const r of volume.closed) weekSet[r.week] = true
  const weeks = Object.keys(weekSet).sort()

  const lookup: Record<string, number> = {}
  for (const r of volume.opened) lookup[`${r.week}||${r.pipeline}||opened`] = r.count
  for (const r of volume.closed) lookup[`${r.week}||${r.pipeline}||closed`] = r.count

  return weeks.map((week) => ({
    week,
    ast_opened: lookup[`${week}||AST||opened`] ?? 0,
    ast_closed: lookup[`${week}||AST||closed`] ?? 0,
    ust_opened: lookup[`${week}||UST||opened`] ?? 0,
    ust_closed: lookup[`${week}||UST||closed`] ?? 0,
  }))
}

// weekStr is YYYY-MM-DD (Monday); noon UTC avoids timezone date shift
function formatWeekLabel(weekStr: string): string {
  return new Date(`${weekStr}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function buildDwellChartData(rows: DwellRow[], filter: DwellFilter): DwellDatum[] {
  return rows.map((r) => ({
    label: filter === 'All' ? `${r.stage} (${r.pipeline})` : r.stage,
    stage: r.stage,
    pipeline: r.pipeline,
    median_days: r.median_days,
    p90_days: r.p90_days,
    claim_count: r.claim_count,
  }))
}

function fmtDollar(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}m`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}k`
  return `$${Math.round(n)}`
}

function formatDenialMonth(monthStr: string): string {
  const [year, month] = monthStr.split('-')
  const d = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, 15))
  const m = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  return `${m} '${year.slice(2)}`
}

function collectionRateColor(pct: number): string {
  if (pct > 80) return '#4CAF82'
  if (pct >= 50) return '#E8C84A'
  return '#E84A4A'
}

function groupReasons(reasons: DenialReason[], max = 6): GroupedReason[] {
  const mapped = reasons.map((r) => ({ label: r.claim_denied_reason, count: r.count }))
  if (mapped.length <= max) return mapped
  const top = mapped.slice(0, max)
  const otherCount = mapped.slice(max).reduce((s, r) => s + r.count, 0)
  return [...top, { label: 'Other', count: otherCount }]
}

function buildFinancialChartData(financial: FinancialData): FinancialChartDatum[] {
  const paymentByPipeline: Record<string, number> = {}
  for (const p of financial.payments) paymentByPipeline[p.pipeline] = p.total_paid
  return financial.estimates
    .filter((e) => e.pipeline === 'AST' || e.pipeline === 'UST')
    .map((e) => ({
      pipeline: e.pipeline,
      Estimated: e.total_estimated,
      Collected: paymentByPipeline[e.pipeline] ?? 0,
    }))
    .sort((a, b) => a.pipeline.localeCompare(b.pipeline))
}

// ─── skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ width, height }: { width: number | string; height: number }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 4,
        background: 'var(--bg-elevated)',
        opacity: 0.7,
      }}
    />
  )
}

function LoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Card 1 */}
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '20px 24px',
        }}
      >
        <Skeleton width={180} height={14} />
        <div style={{ marginTop: 8 }}>
          <Skeleton width={280} height={11} />
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginTop: 20,
          }}
        >
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Skeleton width={220} height={32} />
              <Skeleton width={120} height={32} />
              <Skeleton width={120} height={32} />
            </div>
          ))}
        </div>
      </div>
      {/* Card 2 */}
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '20px 24px',
        }}
      >
        <Skeleton width={160} height={14} />
        <div style={{ marginTop: 8 }}>
          <Skeleton width={300} height={11} />
        </div>
        <div
          style={{
            height: 280,
            marginTop: 20,
            display: 'flex',
            alignItems: 'flex-end',
            gap: 16,
          }}
        >
          {[0.6, 0.4, 0.8, 0.3, 0.7, 0.5, 0.9, 0.2].map((h, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: `${h * 100}%`,
                background: 'var(--bg-elevated)',
                borderRadius: '3px 3px 0 0',
                opacity: 0.6,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── bottleneck table ──────────────────────────────────────────────────────────

function BottleneckCell({ row }: { row: BottleneckRow | null }) {
  if (!row || row.claim_count === 0) {
    return (
      <td
        style={{
          width: 140,
          padding: '8px 12px',
          verticalAlign: 'middle',
          textAlign: 'center',
        }}
      >
        <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>—</span>
      </td>
    )
  }
  const bg = cellBg(row.avg_days_in_stage, row.claim_count)
  return (
    <td
      style={{
        width: 140,
        padding: '8px 12px',
        background: bg,
        verticalAlign: 'top',
        borderRadius: 4,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
        {row.claim_count} {row.claim_count === 1 ? 'claim' : 'claims'}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>
        avg {row.avg_days_in_stage}d
      </div>
    </td>
  )
}

const HEAT_LEGEND = [
  { label: '< 14d',   bg: 'transparent', border: '1px solid var(--border)' },
  { label: '14–21d',  bg: 'rgba(232, 200, 74, 0.15)', border: 'none' },
  { label: '21–30d',  bg: 'rgba(232, 200, 74, 0.35)', border: 'none' },
  { label: '30–60d',  bg: 'rgba(232, 130, 58, 0.40)', border: 'none' },
  { label: '60d+',    bg: 'rgba(232, 74, 74, 0.35)',  border: 'none' },
]

function BottleneckHeatmap({ rows }: { rows: BottleneckRow[] }) {
  const tableRows = buildStageTable(rows)

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '20px 24px',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
          Stage bottleneck
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3 }}>
          Avg days open claims have been sitting in each stage
        </div>
      </div>

      {tableRows.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '12px 0' }}>
          No data available
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'separate',
                borderSpacing: '0 3px',
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: 'left',
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                      color: 'var(--text-tertiary)',
                      padding: '0 12px 8px 0',
                      width: '100%',
                    }}
                  >
                    STAGE
                  </th>
                  {['AST', 'UST'].map((p) => (
                    <th
                      key={p}
                      style={{
                        textAlign: 'left',
                        fontSize: 12,
                        fontWeight: 600,
                        letterSpacing: '0.06em',
                        color: 'var(--text-tertiary)',
                        padding: '0 0 8px 12px',
                        width: 140,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map(({ stage, ast, ust }) => (
                  <tr key={stage}>
                    <td
                      style={{
                        fontSize: 13,
                        color: 'var(--text-secondary)',
                        padding: '8px 12px 8px 0',
                        verticalAlign: 'middle',
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      {stage}
                    </td>
                    <BottleneckCell row={ast} />
                    <BottleneckCell row={ust} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div
            style={{
              display: 'flex',
              gap: 16,
              marginTop: 20,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: 'var(--text-tertiary)',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              Heat key:
            </span>
            {HEAT_LEGEND.map(({ label, bg, border }) => (
              <div
                key={label}
                style={{ display: 'flex', alignItems: 'center', gap: 5 }}
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 3,
                    background: bg,
                    border,
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{label}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── stale triage chart ────────────────────────────────────────────────────────

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number; color: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div
      style={{
        background: 'var(--bg-header)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        padding: '10px 14px',
        fontSize: 12,
      }}
    >
      <div
        style={{
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {payload.map((entry) => (
        <div
          key={entry.name}
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            marginBottom: 3,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              background: entry.color,
              flexShrink: 0,
            }}
          />
          <span style={{ color: 'var(--text-secondary)' }}>{entry.name}</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
            {entry.value}
          </span>
        </div>
      ))}
    </div>
  )
}

function StaleTriageChart({ rows }: { rows: StaleRow[] }) {
  const chartData = buildChartData(rows)

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '20px 24px',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
          Stale claim triage
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3 }}>
          Open claims past 14 days, by pipeline and age bucket
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={280}>
        <BarChart
          data={chartData}
          margin={{ top: 20, right: 16, left: 0, bottom: 4 }}
          barGap={4}
          barCategoryGap={40}
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--border)"
            strokeDasharray="3 3"
          />
          <XAxis
            dataKey="pipeline"
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
            allowDecimals={false}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: 'rgba(255,255,255,0.03)' }}
          />
          {BUCKETS.map((bucket) => (
            <Bar
              key={bucket}
              dataKey={bucket}
              name={bucket}
              fill={BUCKET_COLORS[bucket]}
              radius={[3, 3, 0, 0]}
              barSize={28}
            >
              <LabelList
                dataKey={bucket}
                position="top"
                style={{ fontSize: 11, fill: 'var(--text-secondary)', fontWeight: 500 }}
                formatter={(val: unknown) => (Number(val) > 0 ? String(val) : '')}
              />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          gap: 20,
          marginTop: 12,
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}
      >
        {BUCKETS.map((bucket) => (
          <div
            key={bucket}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                background: BUCKET_COLORS[bucket],
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{bucket}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── leadership loading skeleton ──────────────────────────────────────────────

function LeadershipLoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Line chart skeleton */}
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '20px 24px',
        }}
      >
        <Skeleton width={220} height={14} />
        <div style={{ marginTop: 8 }}>
          <Skeleton width={320} height={11} />
        </div>
        <div
          style={{
            height: 300,
            marginTop: 20,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                height: 1,
                top: `${i * 33}%`,
                background: 'var(--bg-elevated)',
                opacity: 0.5,
              }}
            />
          ))}
          <svg
            width="100%"
            height="100%"
            viewBox="0 0 560 300"
            preserveAspectRatio="none"
            style={{ opacity: 0.35 }}
          >
            <polyline
              points="0,240 70,180 140,200 210,120 280,140 350,80 420,100 490,60 560,80"
              fill="none"
              stroke="#3A6A3C"
              strokeWidth={2}
            />
            <polyline
              points="0,260 70,230 140,250 210,210 280,200 350,170 420,150 490,130 560,140"
              fill="none"
              stroke="#3A6A3C"
              strokeWidth={1.5}
              strokeDasharray="4 2"
            />
          </svg>
        </div>
      </div>
      {/* Horizontal bar skeleton */}
      <div
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          padding: '20px 24px',
        }}
      >
        <Skeleton width={180} height={14} />
        <div style={{ marginTop: 8 }}>
          <Skeleton width={360} height={11} />
        </div>
        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}
        >
          {[0.72, 0.5, 0.88, 0.42, 0.65, 0.8, 0.3].map((w, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Skeleton width={140} height={11} />
              <Skeleton width={`${w * 55}%`} height={18} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── volume chart ──────────────────────────────────────────────────────────────

function VolumeTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ dataKey: string; value: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const SERIES_LABELS: Record<string, { label: string; color: string }> = {
    ast_opened: { label: 'AST Opened', color: '#2a78d6' },
    ast_closed: { label: 'AST Closed', color: '#2a78d6' },
    ust_opened: { label: 'UST Opened', color: '#E8C84A' },
    ust_closed: { label: 'UST Closed', color: '#E8C84A' },
  }
  return (
    <div
      style={{
        background: '#1A2F1C',
        border: '1px solid var(--border)',
        borderRadius: 4,
        padding: '10px 14px',
        fontSize: 12,
      }}
    >
      <div
        style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}
      >
        {label ? formatWeekLabel(label) : ''}
      </div>
      {payload.map((entry) => {
        const cfg = SERIES_LABELS[entry.dataKey] ?? {
          label: entry.dataKey,
          color: 'var(--text-secondary)',
        }
        return (
          <div
            key={entry.dataKey}
            style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                background: cfg.color,
                flexShrink: 0,
              }}
            />
            <span style={{ color: 'var(--text-secondary)' }}>{cfg.label}</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
              {entry.value}
            </span>
          </div>
        )
      })}
    </div>
  )
}

const VOLUME_LEGEND_ITEMS = [
  { color: '#2a78d6', dashed: false, label: 'AST Opened' },
  { color: '#2a78d6', dashed: true,  label: 'AST Closed' },
  { color: '#E8C84A', dashed: false, label: 'UST Opened' },
  { color: '#E8C84A', dashed: true,  label: 'UST Closed' },
]

function VolumeChart({ volume }: { volume: VolumeData }) {
  const chartData = buildVolumeChartData(volume)
  const ticks = chartData
    .map((d) => d.week)
    .filter((_, i) => i % 4 === 0)

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '20px 24px',
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
          Claims opened vs. closed
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3 }}>
          Weekly volume by pipeline — last 52 weeks
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={chartData}
          margin={{ top: 8, right: 16, left: 8, bottom: 4 }}
        >
          <CartesianGrid
            stroke="rgba(255,255,255,0.08)"
            strokeDasharray="3 3"
          />
          <XAxis
            dataKey="week"
            ticks={ticks}
            tickFormatter={formatWeekLabel}
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
            allowDecimals={false}
            label={{
              value: 'Claims',
              angle: -90,
              position: 'insideLeft',
              fill: 'var(--text-tertiary)',
              fontSize: 11,
              dx: -4,
            }}
          />
          <Tooltip
            content={<VolumeTooltip />}
            cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }}
          />
          <Line
            dataKey="ast_opened"
            stroke="#2a78d6"
            strokeWidth={2}
            dot={false}
            name="AST Opened"
          />
          <Line
            dataKey="ast_closed"
            stroke="#2a78d6"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            dot={false}
            name="AST Closed"
          />
          <Line
            dataKey="ust_opened"
            stroke="#E8C84A"
            strokeWidth={2}
            dot={false}
            name="UST Opened"
          />
          <Line
            dataKey="ust_closed"
            stroke="#E8C84A"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            dot={false}
            name="UST Closed"
          />
        </LineChart>
      </ResponsiveContainer>

      {/* Custom legend */}
      <div
        style={{
          display: 'flex',
          gap: 20,
          marginTop: 14,
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}
      >
        {VOLUME_LEGEND_ITEMS.map(({ color, dashed, label }) => (
          <div
            key={label}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <svg width={20} height={10} style={{ flexShrink: 0 }}>
              <line
                x1={0}
                y1={5}
                x2={20}
                y2={5}
                stroke={color}
                strokeWidth={dashed ? 1.5 : 2}
                strokeDasharray={dashed ? '4 2' : undefined}
              />
            </svg>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── dwell chart ───────────────────────────────────────────────────────────────

function DwellTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ payload: DwellDatum }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const row = payload[0]?.payload
  return (
    <div
      style={{
        background: '#1A2F1C',
        border: '1px solid var(--border)',
        borderRadius: 4,
        padding: '10px 14px',
        fontSize: 12,
      }}
    >
      <div
        style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}
      >
        {label}
      </div>
      {row && (
        <>
          <div style={{ color: 'var(--text-secondary)', marginBottom: 3 }}>
            Pipeline:{' '}
            <span style={{ color: 'var(--text-primary)' }}>{row.pipeline}</span>
          </div>
          <div style={{ color: 'var(--text-secondary)', marginBottom: 3 }}>
            Median:{' '}
            <span style={{ color: '#E8C84A', fontWeight: 500 }}>{row.median_days}d</span>
          </div>
          <div style={{ color: 'var(--text-secondary)', marginBottom: 3 }}>
            P90:{' '}
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
              {row.p90_days}d
            </span>
          </div>
          <div style={{ color: 'var(--text-secondary)' }}>
            Transitions:{' '}
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
              {row.claim_count}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

function DwellChart({
  rows,
  pipeline,
  onPipelineChange,
  loading,
}: {
  rows: DwellRow[]
  pipeline: DwellFilter
  onPipelineChange: (p: DwellFilter) => void
  loading: boolean
}) {
  const chartData = buildDwellChartData(rows, pipeline)
  const chartHeight = Math.max(300, chartData.length * 44)

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '20px 24px',
      }}
    >
      {/* Header + pipeline filter pills */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 16,
          gap: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
            Stage dwell time
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3 }}>
            Median and 90th percentile days per stage — completed transitions only
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {(['All', 'AST', 'UST'] as DwellFilter[]).map((p) => {
            const active = pipeline === p
            return (
              <button
                key={p}
                onClick={() => onPipelineChange(p)}
                disabled={loading}
                style={{
                  padding: '4px 12px',
                  fontSize: 12,
                  fontWeight: active ? 600 : 400,
                  cursor: loading ? 'default' : 'pointer',
                  background: active ? 'var(--bg-elevated)' : 'transparent',
                  color: active ? 'var(--accent-yellow)' : 'var(--text-secondary)',
                  border: `1px solid ${active ? 'var(--accent-yellow)' : 'var(--border)'}`,
                  borderRadius: 4,
                  opacity: loading ? 0.6 : 1,
                  transition: 'all 0.1s',
                }}
              >
                {p}
              </button>
            )
          })}
        </div>
      </div>

      {loading ? (
        <div
          style={{
            height: 300,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Loading…</span>
        </div>
      ) : chartData.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '12px 0' }}>
          No data available
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart
              layout="vertical"
              data={chartData}
              margin={{ top: 20, right: 48, left: 0, bottom: 4 }}
              barGap={3}
              barCategoryGap={16}
            >
              <CartesianGrid
                horizontal={false}
                stroke="rgba(255,255,255,0.08)"
                strokeDasharray="3 3"
              />
              <XAxis
                type="number"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
                allowDecimals={false}
                domain={[0, 'auto']}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={160}
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
              />
              <Tooltip content={<DwellTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <ReferenceLine
                x={14}
                stroke="#E84A4A"
                strokeDasharray="3 3"
                label={{
                  value: '14d stale',
                  position: 'top',
                  fontSize: 11,
                  fill: '#E84A4A',
                }}
              />
              <Bar
                dataKey="median_days"
                name="Median"
                fill="#E8C84A"
                radius={[0, 3, 3, 0]}
                barSize={14}
              />
              <Bar
                dataKey="p90_days"
                name="P90"
                fill="rgba(232,200,74,0.35)"
                radius={[0, 3, 3, 0]}
                barSize={14}
              />
            </BarChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div
            style={{ display: 'flex', gap: 20, marginTop: 14, justifyContent: 'center' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: '#E8C84A',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                Median days
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: 'rgba(232,200,74,0.35)',
                  border: '1px solid rgba(232,200,74,0.5)',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                90th percentile
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─── financial exposure section ───────────────────────────────────────────────

function FinancialTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ dataKey: string; value: number }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  const estimated = payload.find((p) => p.dataKey === 'Estimated')?.value ?? 0
  const collected = payload.find((p) => p.dataKey === 'Collected')?.value ?? 0
  const rate = estimated > 0 ? ((collected / estimated) * 100).toFixed(1) : '0.0'
  return (
    <div
      style={{
        background: 'var(--bg-header)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        padding: '10px 14px',
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>{label}</div>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 3 }}>
        Estimated:{' '}
        <span style={{ color: '#E8C84A', fontWeight: 500 }}>{fmtDollar(estimated)}</span>
      </div>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 3 }}>
        Collected:{' '}
        <span style={{ color: '#4CAF82', fontWeight: 500 }}>{fmtDollar(collected)}</span>
      </div>
      <div style={{ color: 'var(--text-secondary)' }}>
        Rate: <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{rate}%</span>
      </div>
    </div>
  )
}

function FinancialExposureSection({ financial }: { financial: FinancialData }) {
  const { totals, estimates } = financial
  const chartData = buildFinancialChartData(financial)

  const contractor = estimates.reduce((s, e) => s + e.total_contractor_costs, 0)
  const stateFees  = estimates.reduce((s, e) => s + e.total_state_fees, 0)
  const adjFees    = estimates.reduce((s, e) => s + e.total_adjuster_fees, 0)

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '20px 24px',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
          Financial exposure
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3 }}>
          Estimated liability vs. payments collected
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total estimated',  value: fmtDollar(totals.total_estimated), color: 'var(--text-primary)' },
          { label: 'Total collected',  value: fmtDollar(totals.total_paid),      color: 'var(--text-primary)' },
          { label: 'Collection rate',
            value: `${totals.collection_rate_pct.toFixed(1)}%`,
            color: collectionRateColor(totals.collection_rate_pct) },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            style={{
              flex: 1,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 5,
              padding: '14px 16px',
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: 'var(--text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: 6,
              }}
            >
              {label}
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Grouped bar chart */}
      <ResponsiveContainer width="100%" height={220}>
        <BarChart
          data={chartData}
          margin={{ top: 8, right: 16, left: 16, bottom: 4 }}
          barGap={6}
          barCategoryGap={40}
        >
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
          <XAxis
            dataKey="pipeline"
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
            tickFormatter={(v: number) => fmtK(v)}
          />
          <Tooltip content={<FinancialTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Bar dataKey="Estimated" fill="#E8C84A" radius={[3, 3, 0, 0]} barSize={28} name="Estimated" />
          <Bar dataKey="Collected" fill="#4CAF82" radius={[3, 3, 0, 0]} barSize={28} name="Collected" />
        </BarChart>
      </ResponsiveContainer>

      {/* Chart legend */}
      <div style={{ display: 'flex', gap: 20, marginTop: 12, justifyContent: 'center' }}>
        {[
          { color: '#E8C84A', label: 'Estimated' },
          { color: '#4CAF82', label: 'Collected' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              style={{ width: 12, height: 12, borderRadius: 3, background: color, flexShrink: 0 }}
            />
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Cost breakdown pills */}
      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        {[
          { label: 'Contractor', value: contractor },
          { label: 'State fees', value: stateFees },
          { label: 'Adj. fees',  value: adjFees },
        ].map(({ label, value }) => (
          <div
            key={label}
            style={{
              padding: '4px 10px',
              borderRadius: 999,
              background: 'rgba(232, 200, 74, 0.15)',
              fontSize: 12,
              color: '#E8C84A',
              whiteSpace: 'nowrap',
            }}
          >
            {label}: {fmtK(value)}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── agent workload section ───────────────────────────────────────────────────

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

function AgentWorkloadSection({ rows }: { rows: AgentRow[] }) {
  const withStale = rows.filter((r) => r.stale_count > 0).length
  const topAgent  = rows[0]

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '20px 24px',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
          Agent workload
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3 }}>
          Open claims by agent — sorted by stale count
        </div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
        {/* Active agents */}
        <div
          style={{
            flex: 1,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 5,
            padding: '14px 16px',
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 6,
            }}
          >
            Active agents
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
            {rows.length}
          </div>
        </div>

        {/* With stale claims */}
        <div
          style={{
            flex: 1,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 5,
            padding: '14px 16px',
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 6,
            }}
          >
            With stale claims
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              color: withStale > 0 ? '#E8A53A' : 'var(--text-primary)',
            }}
          >
            {withStale}
          </div>
        </div>

        {/* Highest stale rate */}
        <div
          style={{
            flex: 1,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            borderRadius: 5,
            padding: '14px 16px',
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 6,
            }}
          >
            Highest stale rate
          </div>
          {topAgent ? (
            <>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: stalePctColor(topAgent.stale_pct),
                }}
              >
                {topAgent.stale_pct}%
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>
                {topAgent.agent_name}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>—</div>
          )}
        </div>
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)', padding: '12px 0' }}>
          No open claims currently assigned
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'separate',
                borderSpacing: '0 2px',
              }}
            >
              <thead>
                <tr>
                  {['Agent', 'Open', 'Stale', 'Stale %', 'Oldest', 'AST', 'UST'].map((col) => (
                    <th
                      key={col}
                      style={{
                        textAlign: col === 'Agent' ? 'left' : 'right',
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: '0.06em',
                        color: 'var(--text-tertiary)',
                        textTransform: 'uppercase',
                        padding: '0 10px 8px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const sColor = stalePctColor(row.stale_pct)
                  const oColor = oldestColor(row.oldest_claim_days)
                  const bg = i % 2 === 0 ? 'var(--bg-elevated)' : 'transparent'
                  const cell = (extra?: React.CSSProperties): React.CSSProperties => ({
                    padding: '9px 10px',
                    background: bg,
                    ...extra,
                  })
                  return (
                    <tr key={row.agent_name}>
                      <td
                        style={cell({
                          fontSize: 13,
                          color: 'var(--text-primary)',
                          fontWeight: 500,
                          borderRadius: '4px 0 0 4px',
                        })}
                      >
                        {row.agent_name}
                      </td>
                      <td
                        style={cell({
                          fontSize: 13,
                          color: 'var(--text-primary)',
                          fontWeight: 500,
                          textAlign: 'right',
                        })}
                      >
                        {row.total_open}
                      </td>
                      <td
                        style={cell({
                          fontSize: 13,
                          color: row.stale_count > 0 ? '#E8A53A' : 'var(--text-tertiary)',
                          textAlign: 'right',
                        })}
                      >
                        {row.stale_count}
                      </td>
                      <td style={cell()}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: 6,
                          }}
                        >
                          <div
                            style={{
                              width: 48,
                              height: 4,
                              background: 'var(--bg-base)',
                              borderRadius: 2,
                              overflow: 'hidden',
                              flexShrink: 0,
                            }}
                          >
                            <div
                              style={{
                                height: '100%',
                                width: `${Math.min(row.stale_pct, 100)}%`,
                                background: sColor,
                                borderRadius: 2,
                              }}
                            />
                          </div>
                          <span
                            style={{
                              fontSize: 12,
                              color: sColor,
                              fontWeight: 500,
                              minWidth: 30,
                              textAlign: 'right',
                            }}
                          >
                            {row.stale_pct}%
                          </span>
                        </div>
                      </td>
                      <td
                        style={cell({
                          fontSize: 13,
                          color: oColor,
                          textAlign: 'right',
                        })}
                      >
                        {Math.round(row.oldest_claim_days)}d
                      </td>
                      <td
                        style={cell({
                          fontSize: 13,
                          color: 'var(--text-secondary)',
                          textAlign: 'right',
                        })}
                      >
                        {row.ast_open}
                      </td>
                      <td
                        style={cell({
                          fontSize: 13,
                          color: 'var(--text-secondary)',
                          textAlign: 'right',
                          borderRadius: '0 4px 4px 0',
                        })}
                      >
                        {row.ust_open}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 12 }}>
            Stale threshold: 14 days without a stage change
          </div>
        </>
      )}
    </div>
  )
}

// ─── denial rate section ───────────────────────────────────────────────────────

function DenialTrendTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: DenialTrendRow }>
}) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div
      style={{
        background: 'var(--bg-header)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        padding: '10px 14px',
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
        {formatDenialMonth(row.month)}
      </div>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 3 }}>
        Closed:{' '}
        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{row.total_closed}</span>
      </div>
      <div style={{ color: 'var(--text-secondary)', marginBottom: 3 }}>
        Denied:{' '}
        <span style={{ color: '#E84A4A', fontWeight: 500 }}>{row.denied}</span>
      </div>
      <div style={{ color: 'var(--text-secondary)' }}>
        Rate:{' '}
        <span style={{ color: '#E84A4A', fontWeight: 500 }}>
          {row.denial_rate_pct.toFixed(1)}%
        </span>
      </div>
    </div>
  )
}

function DenialPieTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ name: string; value: number }>
}) {
  if (!active || !payload?.length) return null
  const entry = payload[0]
  return (
    <div
      style={{
        background: 'var(--bg-header)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        padding: '8px 12px',
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
        {entry.name}
      </div>
      <div style={{ color: 'var(--text-secondary)' }}>
        {entry.value} {entry.value === 1 ? 'denial' : 'denials'}
      </div>
    </div>
  )
}

function DenialRateSection({
  trend,
  reasons,
}: {
  trend: DenialTrendRow[]
  reasons: DenialReason[]
}) {
  const grouped = groupReasons(reasons)
  const totalDenied = reasons.reduce((s, r) => s + r.count, 0)
  const trendTicks = trend.filter((_, i) => i % 3 === 0).map((d) => d.month)

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '20px 24px',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
          Denial rate
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 3 }}>
          Monthly denial rate and reason breakdown — last 18 months
        </div>
      </div>

      {/* Two-column layout: 60/40 */}
      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>

        {/* LEFT: monthly trend line chart */}
        <div style={{ flex: 3, minWidth: 0 }}>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
              <XAxis
                dataKey="month"
                ticks={trendTicks}
                tickFormatter={formatDenialMonth}
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--text-tertiary)', fontSize: 10 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
                domain={[0, 100]}
                tickFormatter={(v: number) => `${v}%`}
                label={{
                  value: '%',
                  angle: -90,
                  position: 'insideLeft',
                  fill: 'var(--text-tertiary)',
                  fontSize: 11,
                  dx: 8,
                }}
              />
              <Tooltip
                content={<DenialTrendTooltip />}
                cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }}
              />
              <Line
                dataKey="denial_rate_pct"
                stroke="#E84A4A"
                strokeWidth={2}
                dot={{ r: 3, fill: '#E84A4A', strokeWidth: 0 }}
                activeDot={{ r: 4 }}
                name="Denial rate"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* RIGHT: donut + legend */}
        <div style={{ flex: 2, minWidth: 0 }}>
          {/* Donut with absolute-positioned center label */}
          <div style={{ position: 'relative', height: 240 }}>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={grouped}
                  dataKey="count"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {grouped.map((entry, i) => (
                    <Cell key={entry.label} fill={DENIAL_COLORS[i % DENIAL_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<DenialPieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                textAlign: 'center',
                pointerEvents: 'none',
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>
                {totalDenied}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>denied</div>
            </div>
          </div>

          {/* Slice legend */}
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
            {grouped.map((entry, i) => (
              <div key={entry.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: DENIAL_COLORS[i % DENIAL_COLORS.length],
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {entry.label}
                </span>
                <span
                  style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 500, flexShrink: 0 }}
                >
                  {entry.count}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

// ─── main page ─────────────────────────────────────────────────────────────────

function ErrorCard({
  error,
  onRetry,
}: {
  error: string
  onRetry: () => void
}) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '32px 24px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 13, color: 'var(--accent-red)', marginBottom: 12 }}>
        {error}
      </div>
      <button
        onClick={onRetry}
        style={{
          padding: '7px 18px',
          fontSize: 13,
          fontWeight: 500,
          background: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-bright)',
          borderRadius: 4,
          cursor: 'pointer',
        }}
      >
        Retry
      </button>
    </div>
  )
}

export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>('operations')

  // ── Operations state ──────────────────────────────────────────────────────────
  const [bottleneck, setBottleneck] = useState<BottleneckRow[]>([])
  const [stale, setStale] = useState<StaleRow[]>([])
  const [agentRows, setAgentRows] = useState<AgentRow[]>([])
  const [opsLoading, setOpsLoading] = useState(true)
  const [opsError, setOpsError] = useState<string | null>(null)

  // ── Leadership state (lazy — populated on first tab click) ────────────────────
  const [leadFetched, setLeadFetched] = useState(false)
  const [leadLoading, setLeadLoading] = useState(false)
  const [leadError, setLeadError] = useState<string | null>(null)
  const [volume, setVolume] = useState<VolumeData | null>(null)
  const [dwellAll, setDwellAll] = useState<DwellRow[]>([])
  const [dwellRows, setDwellRows] = useState<DwellRow[]>([])
  const [dwellPipeline, setDwellPipeline] = useState<DwellFilter>('All')
  const [dwellLoading, setDwellLoading] = useState(false)
  const [financialData, setFinancialData] = useState<FinancialData | null>(null)
  const [denialTrend, setDenialTrend] = useState<DenialTrendRow[]>([])
  const [denialReasons, setDenialReasons] = useState<DenialReason[]>([])

  // ── Fetchers ──────────────────────────────────────────────────────────────────
  const fetchOps = useCallback(async () => {
    setOpsLoading(true)
    setOpsError(null)
    try {
      const auth = `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET}`
      const [bRes, sRes, aRes] = await Promise.all([
        fetch('/api/analytics?view=bottleneck', { headers: { Authorization: auth } }),
        fetch('/api/analytics?view=stale',      { headers: { Authorization: auth } }),
        fetch('/api/analytics?view=agents',     { headers: { Authorization: auth } }),
      ])
      if (!bRes.ok) {
        const body = await bRes.json().catch(() => ({}))
        throw new Error(body.error ?? `Bottleneck request failed (${bRes.status})`)
      }
      if (!sRes.ok) {
        const body = await sRes.json().catch(() => ({}))
        throw new Error(body.error ?? `Stale request failed (${sRes.status})`)
      }
      if (!aRes.ok) {
        const body = await aRes.json().catch(() => ({}))
        throw new Error(body.error ?? `Agents request failed (${aRes.status})`)
      }
      const [bData, sData, aData] = await Promise.all([bRes.json(), sRes.json(), aRes.json()])
      setBottleneck(bData.data ?? [])
      setStale(sData.data ?? [])
      setAgentRows(aData.data ?? [])
    } catch (err) {
      setOpsError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setOpsLoading(false)
    }
  }, [])

  const fetchLeadership = useCallback(async () => {
    setLeadLoading(true)
    setLeadError(null)
    try {
      const auth = `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET}`
      const [vRes, dRes, fRes, denRes] = await Promise.all([
        fetch('/api/analytics?view=volume',    { headers: { Authorization: auth } }),
        fetch('/api/analytics?view=dwell',     { headers: { Authorization: auth } }),
        fetch('/api/analytics?view=financial', { headers: { Authorization: auth } }),
        fetch('/api/analytics?view=denials',   { headers: { Authorization: auth } }),
      ])
      if (!vRes.ok) {
        const body = await vRes.json().catch(() => ({}))
        throw new Error(body.error ?? `Volume request failed (${vRes.status})`)
      }
      if (!dRes.ok) {
        const body = await dRes.json().catch(() => ({}))
        throw new Error(body.error ?? `Dwell request failed (${dRes.status})`)
      }
      if (!fRes.ok) {
        const body = await fRes.json().catch(() => ({}))
        throw new Error(body.error ?? `Financial request failed (${fRes.status})`)
      }
      if (!denRes.ok) {
        const body = await denRes.json().catch(() => ({}))
        throw new Error(body.error ?? `Denials request failed (${denRes.status})`)
      }
      const [vData, dData, fData, denData] = await Promise.all([
        vRes.json(), dRes.json(), fRes.json(), denRes.json(),
      ])
      setVolume(vData.data)
      const dwellData: DwellRow[] = dData.data ?? []
      setDwellAll(dwellData)
      setDwellRows(dwellData)
      setFinancialData(fData.data ?? null)
      setDenialTrend(denData.data?.trend ?? [])
      setDenialReasons(denData.data?.reasons ?? [])
      setLeadFetched(true)
    } catch (err) {
      setLeadError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLeadLoading(false)
    }
  }, [])

  // Dwell pipeline filter — re-fetch for AST/UST, restore cache for All
  const handleDwellPipeline = useCallback(
    async (p: DwellFilter) => {
      setDwellPipeline(p)
      if (p === 'All') {
        setDwellRows(dwellAll)
        return
      }
      setDwellLoading(true)
      try {
        const auth = `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET}`
        const res = await fetch(`/api/analytics?view=dwell&pipeline=${p}`, {
          headers: { Authorization: auth },
        })
        if (!res.ok) throw new Error(`Failed (${res.status})`)
        const data = await res.json()
        setDwellRows(data.data ?? [])
      } catch {
        // Silently fail — existing rows remain displayed
      } finally {
        setDwellLoading(false)
      }
    },
    [dwellAll],
  )

  // Tab click: lazy-load leadership on first visit
  const handleTabClick = useCallback(
    (key: Tab) => {
      setTab(key)
      if (key === 'leadership' && !leadFetched && !leadLoading) {
        fetchLeadership()
      }
    },
    [leadFetched, leadLoading, fetchLeadership],
  )

  useEffect(() => {
    fetchOps()
  }, [fetchOps])

  const tabs: { key: Tab; label: string }[] = [
    { key: 'operations', label: 'Operations' },
    { key: 'leadership', label: 'Leadership' },
  ]

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--text-primary)',
            marginBottom: 16,
          }}
        >
          Analytics
        </h1>

        {/* Tab switcher */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {tabs.map(({ key, label }) => {
            const active = tab === key
            return (
              <button
                key={key}
                onClick={() => handleTabClick(key)}
                style={{
                  padding: '8px 20px',
                  fontSize: 14,
                  fontWeight: active ? 600 : 400,
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: active
                    ? '2px solid var(--accent-yellow)'
                    : '2px solid transparent',
                  cursor: 'pointer',
                  marginBottom: -1,
                  transition: 'color 0.1s, border-color 0.1s',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Operations tab */}
      {tab === 'operations' && (
        opsLoading ? (
          <LoadingSkeleton />
        ) : opsError ? (
          <ErrorCard error={opsError} onRetry={fetchOps} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <BottleneckHeatmap rows={bottleneck} />
            <StaleTriageChart rows={stale} />
            <AgentWorkloadSection rows={agentRows} />
          </div>
        )
      )}

      {/* Leadership tab */}
      {tab === 'leadership' && (
        leadLoading ? (
          <LeadershipLoadingSkeleton />
        ) : leadError ? (
          <ErrorCard error={leadError} onRetry={fetchLeadership} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {volume && <VolumeChart volume={volume} />}
            <DwellChart
              rows={dwellRows}
              pipeline={dwellPipeline}
              onPipelineChange={handleDwellPipeline}
              loading={dwellLoading}
            />
            {financialData && <FinancialExposureSection financial={financialData} />}
            {denialTrend.length > 0 && (
              <DenialRateSection trend={denialTrend} reasons={denialReasons} />
            )}
          </div>
        )
      )}
    </div>
  )
}
