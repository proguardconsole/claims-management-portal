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

// ─── constants ─────────────────────────────────────────────────────────────────

const BUCKET_COLORS: Record<string, string> = {
  '14-21d': '#E8C84A',
  '21-30d': '#E8A53A',
  '30-60d': '#E87A3A',
  '60d+':   '#E84A4A',
}
const BUCKETS = ['14-21d', '21-30d', '30-60d', '60d+'] as const

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

// ─── main page ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [tab, setTab] = useState<Tab>('operations')
  const [bottleneck, setBottleneck] = useState<BottleneckRow[]>([])
  const [stale, setStale] = useState<StaleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const auth = `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET}`
      const [bRes, sRes] = await Promise.all([
        fetch('/api/analytics?view=bottleneck', { headers: { Authorization: auth } }),
        fetch('/api/analytics?view=stale', { headers: { Authorization: auth } }),
      ])

      if (!bRes.ok) {
        const body = await bRes.json().catch(() => ({}))
        throw new Error(body.error ?? `Bottleneck request failed (${bRes.status})`)
      }
      if (!sRes.ok) {
        const body = await sRes.json().catch(() => ({}))
        throw new Error(body.error ?? `Stale request failed (${sRes.status})`)
      }

      const [bData, sData] = await Promise.all([bRes.json(), sRes.json()])
      setBottleneck(bData.data ?? [])
      setStale(sData.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

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
        <div
          style={{
            display: 'flex',
            gap: 0,
            borderBottom: '1px solid var(--border)',
          }}
        >
          {tabs.map(({ key, label }) => {
            const active = tab === key
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
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

      {/* Tab content */}
      {tab === 'operations' ? (
        loading ? (
          <LoadingSkeleton />
        ) : error ? (
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
              onClick={fetchData}
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
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <BottleneckHeatmap rows={bottleneck} />
            <StaleTriageChart rows={stale} />
          </div>
        )
      ) : (
        /* Leadership placeholder */
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 320,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 6,
          }}
        >
          <p style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>
            Leadership analytics loading in next build...
          </p>
        </div>
      )}
    </div>
  )
}
