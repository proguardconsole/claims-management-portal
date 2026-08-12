'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ChevronDown, ChevronRight, X, Plus, RefreshCw } from 'lucide-react'

// ─── types ────────────────────────────────────────────────────────────────────

type ClaimRow = {
  id: string
  field_service_number: string | null
  deal_name: string | null
  stage: string | null
  claim_status: string | null
  tank_type: string | null
  claim_trigger: string | null
  contact_name: string | null
  city: string | null
  claim_state: string | null
  owner_name: string | null
  created_time: string | null
  close_date: string | null
  days_open: number
  aging: string
  estimate_total: number
  adjuster_fees: number
  contractor_name: string | null
  billing_value: number
  sf_collected: number
  ded_collected: number
  net_incurred: number
  reassignment_needed: boolean
}

type DeniedRow = {
  id: string
  field_service_number: string | null
  contact_name: string | null
  stage: string | null
  claim_trigger: string | null
  tank_type: string | null
  close_date: string | null
  manual: boolean
}

type Exclusion = {
  field_service_number: string
  reason: string | null
  added_at: string | null
}

type ReportData = {
  as_of: string
  week_start: string
  week_end: string
  kpis: {
    open_count: number
    net_total_incurred: number
    total_adj_fees: number
    avg_net_per_claim: number
    avg_days_open: number
    claims_180_plus: number
    claims_under_90: number
    total_billing_value: number
    top_trigger: { trigger: string; count: number } | null
    closed_last_week: number
  }
  open_totals: {
    estimate_total: number
    adjuster_fees: number
    billing_value: number
    sf_collected: number
    ded_collected: number
    net_incurred: number
  }
  open_claims: ClaimRow[]
  closed_this_week: ClaimRow[]
  denied_this_week: DeniedRow[]
  new_claims_this_week: ClaimRow[]
  pending_ust_pulls: ClaimRow[]
  exclusions: Exclusion[]
}

// ─── formatters ───────────────────────────────────────────────────────────────

function fmtDollar(n: number): string {
  if (n === 0) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit', timeZone: 'UTC' })
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function weekAgoStr(from: string): string {
  const d = new Date(from + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() - 7)
  return d.toISOString().slice(0, 10)
}

function agingColor(aging: string): string {
  if (aging === '<90 Days')    return 'var(--accent-green)'
  if (aging === '90-180 Days') return '#E8C84A'
  if (aging === '180-365 Days') return '#f97316'
  return 'var(--accent-red)'
}

// ─── shared sub-components ────────────────────────────────────────────────────

function SectionHeader({
  title,
  count,
  expanded,
  onToggle,
}: {
  title: string
  count: number
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 16px',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: expanded ? '5px 5px 0 0' : 5,
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-primary)' }}>
        {title}
      </span>
      <span
        style={{
          marginLeft: 4,
          padding: '1px 7px',
          borderRadius: 999,
          background: 'var(--bg-surface)',
          fontSize: 11,
          color: 'var(--text-secondary)',
        }}
      >
        {count}
      </span>
    </div>
  )
}

const TH_STYLE: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  textAlign: 'left',
  whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--border)',
  background: 'var(--bg-elevated)',
  position: 'sticky',
  top: 0,
  zIndex: 2,
}

const TD_STYLE: React.CSSProperties = {
  padding: '7px 10px',
  fontSize: 12,
  color: 'var(--text-primary)',
  whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--border)',
}

const TD_NUM: React.CSSProperties = {
  ...TD_STYLE,
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--text-secondary)',
}

function TotalsRow({ rows, label = 'TOTALS' }: { rows: ClaimRow[]; label?: string }) {
  const adjFees     = rows.reduce((s, r) => s + r.adjuster_fees,  0)
  const billing     = rows.reduce((s, r) => s + r.billing_value,  0)
  const sfCol       = rows.reduce((s, r) => s + r.sf_collected,   0)
  const dedCol      = rows.reduce((s, r) => s + r.ded_collected,  0)
  const netIncurred = rows.reduce((s, r) => s + r.net_incurred,   0)
  const estimate    = rows.reduce((s, r) => s + r.estimate_total, 0)

  const BOLD: React.CSSProperties = {
    padding: '8px 10px',
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--text-primary)',
    background: 'var(--bg-elevated)',
    borderTop: '2px solid var(--border)',
    whiteSpace: 'nowrap',
  }
  const BOLD_NUM: React.CSSProperties = { ...BOLD, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

  return (
    <tr>
      <td style={BOLD}>{label}</td>
      <td style={BOLD} colSpan={3} />
      <td style={BOLD} />
      <td style={BOLD} />
      <td style={BOLD} />
      <td style={BOLD} />
      <td style={BOLD_NUM}>{fmtDollar(adjFees)}</td>
      <td style={BOLD_NUM}>{fmtDollar(billing)}</td>
      <td style={BOLD_NUM}>{fmtDollar(sfCol)}</td>
      <td style={BOLD_NUM}>{fmtDollar(dedCol)}</td>
      <td style={BOLD_NUM}>{fmtDollar(netIncurred)}</td>
      <td style={BOLD_NUM}>{fmtDollar(estimate)}</td>
      <td style={BOLD} />
      <td style={BOLD} />
    </tr>
  )
}

// ─── inline notes cell ────────────────────────────────────────────────────────

function NotesCell({
  claimId,
  notes,
  onChange,
}: {
  claimId: string
  notes: string
  onChange: (id: string, val: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(notes)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  if (editing) {
    return (
      <td style={{ ...TD_STYLE, minWidth: 180 }}>
        <textarea
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => { onChange(claimId, draft); setEditing(false) }}
          style={{
            width: '100%',
            minHeight: 60,
            background: 'var(--bg-base)',
            border: '1px solid var(--border)',
            borderRadius: 3,
            color: 'var(--text-primary)',
            fontSize: 12,
            padding: '4px 6px',
            resize: 'vertical',
          }}
        />
      </td>
    )
  }
  return (
    <td
      onClick={() => { setDraft(notes); setEditing(true) }}
      style={{ ...TD_STYLE, minWidth: 120, cursor: 'text', color: notes ? 'var(--text-secondary)' : 'var(--text-tertiary)' }}
    >
      {notes || '+ add note'}
    </td>
  )
}

// ─── claim table ──────────────────────────────────────────────────────────────

function ClaimTable({
  rows,
  dateLabel = 'Open Date',
  notes,
  onNoteChange,
}: {
  rows: ClaimRow[]
  dateLabel?: string
  notes: Record<string, string>
  onNoteChange: (id: string, val: string) => void
}) {
  if (rows.length === 0) {
    return (
      <div style={{ padding: '24px 16px', color: 'var(--text-tertiary)', fontSize: 13 }}>
        No records.
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1200 }}>
        <thead>
          <tr>
            {['FS #', 'Contact', 'Stage', 'Trigger', 'Tank', dateLabel, 'Days', 'Aging',
              'Adj Fees', 'Billing Value', 'SF Coll.', 'Ded Coll.', 'Net Incurred', 'Estimate', 'Contractor', 'Notes'
            ].map((h) => (
              <th key={h} style={{ ...TH_STYLE, textAlign: h === 'Days' || h === 'Adj Fees' || h === 'Billing Value' || h === 'SF Coll.' || h === 'Ded Coll.' || h === 'Net Incurred' || h === 'Estimate' ? 'right' : 'left' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const bg = i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-elevated)'
            const daysColor = agingColor(r.aging)
            const dateVal = dateLabel === 'Close Date' ? r.close_date : r.created_time
            return (
              <tr key={r.id} style={{ background: bg }}>
                <td style={{ ...TD_STYLE, fontWeight: 600 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    {r.field_service_number ?? '—'}
                    {r.owner_name === 'Shawn Zagryn' && r.reassignment_needed && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
                        color: 'var(--accent-amber)', border: '1px solid var(--accent-amber)',
                        borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap',
                      }}>
                        REASSIGN
                      </span>
                    )}
                  </span>
                </td>
                <td style={TD_STYLE}>{r.contact_name ?? '—'}</td>
                <td style={{ ...TD_STYLE, color: 'var(--text-secondary)' }}>{r.stage ?? '—'}</td>
                <td style={{ ...TD_STYLE, color: 'var(--text-secondary)' }}>{r.claim_trigger ?? '—'}</td>
                <td style={TD_STYLE}>{r.tank_type ?? '—'}</td>
                <td style={TD_STYLE}>{fmtDate(dateVal)}</td>
                <td style={{ ...TD_NUM, color: daysColor }}>{r.days_open}</td>
                <td style={{ ...TD_STYLE, color: daysColor }}>{r.aging}</td>
                <td style={TD_NUM}>{fmtDollar(r.adjuster_fees)}</td>
                <td style={TD_NUM}>{fmtDollar(r.billing_value)}</td>
                <td style={TD_NUM}>{fmtDollar(r.sf_collected)}</td>
                <td style={TD_NUM}>{fmtDollar(r.ded_collected)}</td>
                <td style={{ ...TD_NUM, color: r.net_incurred > 0 ? 'var(--accent-red)' : 'var(--text-secondary)' }}>
                  {fmtDollar(r.net_incurred)}
                </td>
                <td style={TD_NUM}>{fmtDollar(r.estimate_total)}</td>
                <td style={{ ...TD_STYLE, color: 'var(--text-secondary)' }}>{r.contractor_name ?? '—'}</td>
                <NotesCell claimId={r.id} notes={notes[r.id] ?? ''} onChange={onNoteChange} />
              </tr>
            )
          })}
          <TotalsRow rows={rows} />
        </tbody>
      </table>
    </div>
  )
}

// ─── denied table ─────────────────────────────────────────────────────────────

function DeniedTable({ rows }: { rows: DeniedRow[] }) {
  if (rows.length === 0) {
    return (
      <div style={{ padding: '24px 16px', color: 'var(--text-tertiary)', fontSize: 13 }}>
        No records.
      </div>
    )
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['FS #', 'Contact', 'Stage', 'Trigger', 'Tank', 'Close Date', 'Source'].map((h) => (
              <th key={h} style={TH_STYLE}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} style={{ background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-elevated)' }}>
              <td style={{ ...TD_STYLE, fontWeight: 600 }}>
                {r.manual ? <em style={{ color: 'var(--text-tertiary)' }}>Manual Entry</em> : (r.field_service_number ?? '—')}
              </td>
              <td style={TD_STYLE}>{r.contact_name ?? '—'}</td>
              <td style={{ ...TD_STYLE, color: 'var(--text-secondary)' }}>{r.stage ?? '—'}</td>
              <td style={{ ...TD_STYLE, color: 'var(--text-secondary)' }}>{r.claim_trigger ?? '—'}</td>
              <td style={TD_STYLE}>{r.tank_type ?? '—'}</td>
              <td style={TD_STYLE}>{fmtDate(r.close_date)}</td>
              <td style={{ ...TD_STYLE, color: 'var(--text-tertiary)', fontSize: 11 }}>
                {r.manual ? 'Manual' : 'System'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── exclusion manager ────────────────────────────────────────────────────────

function ExclusionManager({
  exclusions,
  onRefetch,
}: {
  exclusions: Exclusion[]
  onRefetch: () => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [newFsn, setNewFsn]     = useState('')
  const [adding, setAdding]     = useState(false)
  const [err, setErr]           = useState<string | null>(null)

  async function handleAdd() {
    const fsn = newFsn.trim().toUpperCase()
    if (!fsn) return
    setAdding(true); setErr(null)
    try {
      const res = await fetch('/api/internal/report-exclusions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field_service_number: fsn }),
      })
      if (!res.ok) {
        let msg = `HTTP ${res.status}`
        try { const j = await res.json(); msg = j.error ?? msg } catch { /* empty or non-JSON body */ }
        setErr(msg)
        return
      }
      setNewFsn('')
      const scrollY = window.scrollY
      await onRefetch()
      requestAnimationFrame(() => window.scrollTo(0, scrollY))
    } catch (e) {
      setErr(String(e))
    } finally {
      setAdding(false)
    }
  }

  async function handleRemove(fsn: string) {
    try {
      const scrollY = window.scrollY
      await fetch(`/api/internal/report-exclusions/${encodeURIComponent(fsn)}`, { method: 'DELETE' })
      await onRefetch()
      requestAnimationFrame(() => window.scrollTo(0, scrollY))
    } catch { /* ignore */ }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <SectionHeader
        title={`EXCLUSION LIST — ${exclusions.length} FSN${exclusions.length !== 1 ? 's' : ''} excluded`}
        count={exclusions.length}
        expanded={expanded}
        onToggle={() => setExpanded(!expanded)}
      />
      {expanded && (
        <div
          style={{
            border: '1px solid var(--border)',
            borderTop: 'none',
            borderRadius: '0 0 5px 5px',
            background: 'var(--bg-surface)',
            padding: 16,
          }}
        >
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input
              value={newFsn}
              onChange={(e) => setNewFsn(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="FS2XXX"
              style={{
                padding: '6px 10px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: 'var(--text-primary)',
                fontSize: 13,
                width: 120,
              }}
            />
            <button
              onClick={handleAdd}
              disabled={adding || !newFsn.trim()}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 12px',
                background: 'var(--accent-yellow)',
                border: 'none', borderRadius: 4,
                color: '#000', fontSize: 12, fontWeight: 600,
                cursor: adding ? 'wait' : 'pointer',
                opacity: !newFsn.trim() ? 0.5 : 1,
              }}
            >
              <Plus size={13} /> Add
            </button>
            {err && <span style={{ fontSize: 12, color: 'var(--accent-red)', alignSelf: 'center' }}>{err}</span>}
          </div>
          {exclusions.length === 0 ? (
            <div style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>No exclusions.</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {exclusions.map((ex) => (
                <div
                  key={ex.field_service_number}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '3px 8px 3px 10px',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 999,
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                  }}
                >
                  {ex.field_service_number}
                  <button
                    onClick={() => handleRemove(ex.field_service_number)}
                    style={{ display: 'flex', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-tertiary)' }}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── manual denial form ───────────────────────────────────────────────────────

function ManualDenialForm({ onRefetch }: { onRefetch: () => Promise<void> }) {
  const [expanded, setExpanded] = useState(false)
  const [form, setForm] = useState({
    claim_reference: '',
    contact_name: '',
    trigger: '',
    tank_type: 'UST',
    denial_date: todayStr(),
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr]               = useState<string | null>(null)

  function set(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })) }

  async function handleSubmit() {
    if (!form.claim_reference || !form.denial_date) return
    setSubmitting(true); setErr(null)
    try {
      const res = await fetch('/api/internal/report-manual-denials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        let msg = `HTTP ${res.status}`
        try { const j = await res.json(); msg = j.error ?? msg } catch { /* empty or non-JSON body */ }
        setErr(msg)
        return
      }
      setForm({ claim_reference: '', contact_name: '', trigger: '', tank_type: 'UST', denial_date: todayStr(), notes: '' })
      setExpanded(false)
      const scrollY = window.scrollY
      await onRefetch()
      requestAnimationFrame(() => window.scrollTo(0, scrollY))
    } catch (e) {
      setErr(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    padding: '6px 10px',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    color: 'var(--text-primary)',
    fontSize: 13,
    width: '100%',
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 16px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: expanded ? '5px 5px 0 0' : 5,
          cursor: 'pointer', userSelect: 'none',
          fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
        }}
      >
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        Add Manual Denial
      </div>
      {expanded && (
        <div
          style={{
            border: '1px solid var(--border)', borderTop: 'none',
            borderRadius: '0 0 5px 5px',
            background: 'var(--bg-surface)',
            padding: 16,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            {[
              { label: 'Claim Reference', key: 'claim_reference', type: 'text', placeholder: 'FS2XXX' },
              { label: 'Contact Name',    key: 'contact_name',    type: 'text', placeholder: '' },
              { label: 'Trigger',         key: 'trigger',         type: 'text', placeholder: 'e.g. Oil Visible' },
            ].map(({ label, key, type, placeholder }) => (
              <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                <input
                  type={type}
                  placeholder={placeholder}
                  value={(form as Record<string, string>)[key]}
                  onChange={(e) => set(key, e.target.value)}
                  style={inputStyle}
                />
              </label>
            ))}
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tank Type</span>
              <select value={form.tank_type} onChange={(e) => set('tank_type', e.target.value)} style={inputStyle}>
                <option value="AST">AST</option>
                <option value="UST">UST</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Denial Date</span>
              <input type="date" value={form.denial_date} onChange={(e) => set('denial_date', e.target.value)} style={inputStyle} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes</span>
              <input type="text" value={form.notes} onChange={(e) => set('notes', e.target.value)} style={inputStyle} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={handleSubmit}
              disabled={submitting || !form.claim_reference || !form.denial_date}
              style={{
                padding: '7px 16px',
                background: 'var(--accent-yellow)',
                border: 'none', borderRadius: 4,
                color: '#000', fontSize: 12, fontWeight: 600,
                cursor: submitting ? 'wait' : 'pointer',
                opacity: (!form.claim_reference || !form.denial_date) ? 0.5 : 1,
              }}
            >
              {submitting ? 'Saving…' : 'Submit'}
            </button>
            {err && <span style={{ fontSize: 12, color: 'var(--accent-red)' }}>{err}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── KPI tile ─────────────────────────────────────────────────────────────────

function KpiTile({
  label,
  value,
  color = 'var(--text-primary)',
  sub,
}: {
  label: string
  value: string
  color?: string
  sub?: string
}) {
  return (
    <div
      style={{
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 5,
        padding: '12px 14px',
        flex: 1,
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function WeeklyReportPage() {
  const [asOf,      setAsOf]      = useState(todayStr)
  const [weekStart, setWeekStart] = useState(() => weekAgoStr(todayStr()))
  const [data,      setData]      = useState<ReportData | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)

  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    open: true, closed: false, denied: false, new: false, pending: false,
  })
  const [notes, setNotes] = useState<Record<string, string>>({})

  const fetchReport = useCallback(async (ao: string, ws: string) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/internal/report?as_of=${ao}&week_start=${ws}`)
      if (!res.ok) {
        let msg = `HTTP ${res.status}`
        try { const j = await res.json(); msg = j.error ?? msg } catch { /* empty or non-JSON body */ }
        setError(msg)
        return
      }
      let j: ReportData
      try {
        j = await res.json()
      } catch {
        setError('Report response could not be parsed — refresh to retry')
        return
      }
      setData(j)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchReport(asOf, weekStart) }, [fetchReport, asOf, weekStart])

  function handleAsOfChange(val: string) {
    setAsOf(val)
    setWeekStart(weekAgoStr(val))
  }

  function handleNoteChange(id: string, val: string) {
    setNotes((n) => ({ ...n, [id]: val }))
  }

  function toggle(key: string) {
    setExpanded((e) => ({ ...e, [key]: !e[key] }))
  }

  const tableContainerStyle: React.CSSProperties = {
    border: '1px solid var(--border)',
    borderTop: 'none',
    borderRadius: '0 0 5px 5px',
    overflow: 'hidden',
  }

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto' }}>
      {/* ── Page Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Weekly Report
          </h1>
          <div style={{ fontSize: 13, color: 'var(--text-tertiary)', marginTop: 4 }}>
            Ironwood — Claims Meeting Preparation
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>As of</span>
            <input
              type="date"
              value={asOf}
              onChange={(e) => handleAsOfChange(e.target.value)}
              style={{
                padding: '5px 8px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: 'var(--text-primary)',
                fontSize: 13,
              }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 10, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Week start</span>
            <input
              type="date"
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
              style={{
                padding: '5px 8px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: 'var(--text-primary)',
                fontSize: 13,
              }}
            />
          </label>

          <button
            onClick={() => fetchReport(asOf, weekStart)}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', marginTop: 16,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              color: 'var(--text-primary)',
              fontSize: 13, fontWeight: 500,
              cursor: loading ? 'wait' : 'pointer',
            }}
          >
            <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>

          <button
            onClick={async () => {
              const url = `/api/internal/report/export?as_of=${asOf}&week_start=${weekStart}`
              const res = await fetch(url)
              const blob = await res.blob()
              const a = document.createElement('a')
              a.href = URL.createObjectURL(blob)
              a.download = `ProGuard_Claims_${asOf}.xlsx`
              a.click()
            }}
            style={{
              padding: '7px 14px', marginTop: 16,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              color: 'var(--text-primary)',
              fontSize: 13, fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Export Excel
          </button>
        </div>
      </div>

      {/* ── Loading / Error ── */}
      {loading && (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>
          Loading report…
        </div>
      )}
      {error && (
        <div style={{ padding: 24, background: 'rgba(232,74,74,0.1)', border: '1px solid var(--accent-red)', borderRadius: 5, color: 'var(--accent-red)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {data && !loading && (
        <>
          {/* ── KPI Header ── */}
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '16px 20px',
              marginBottom: 24,
            }}
          >
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
              KPI Summary — as of {data.as_of} · week {data.week_start} → {data.week_end}
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
              <KpiTile label="Open Claims"         value={String(data.kpis.open_count)}             color="var(--accent-yellow)" />
              <KpiTile label="Net Total Incurred"  value={fmtDollar(data.kpis.net_total_incurred)}  color="var(--accent-green)" />
              <KpiTile label="Total Adj Fees"      value={fmtDollar(data.kpis.total_adj_fees)}      color="var(--accent-green)" />
              <KpiTile label="Avg Net / Claim"     value={fmtDollar(data.kpis.avg_net_per_claim)}   color="var(--accent-green)" />
              <KpiTile label="Avg Days Open"       value={String(data.kpis.avg_days_open)}          color="var(--text-primary)" />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <KpiTile label="Claims 180+ Days"    value={String(data.kpis.claims_180_plus)}        color={data.kpis.claims_180_plus > 0 ? 'var(--accent-red)' : 'var(--text-primary)'} />
              <KpiTile label="Claims <90 Days"     value={String(data.kpis.claims_under_90)}        color="var(--accent-green)" />
              <KpiTile label="Total Billing Value" value={fmtDollar(data.kpis.total_billing_value)} color="var(--accent-green)" />
              <KpiTile
                label="Top Trigger"
                value={data.kpis.top_trigger?.trigger ?? '—'}
                sub={data.kpis.top_trigger ? `${data.kpis.top_trigger.count} claims` : undefined}
              />
              <KpiTile label="Closed Last Week"    value={String(data.kpis.closed_last_week)} />
            </div>
          </div>

          {/* ── Section 1: Open Claims ── */}
          <div style={{ marginBottom: 20 }}>
            <SectionHeader
              title={`OPEN CLAIMS (${data.open_claims.length})`}
              count={data.open_claims.length}
              expanded={expanded.open}
              onToggle={() => toggle('open')}
            />
            {expanded.open && (
              <div style={tableContainerStyle}>
                <ClaimTable rows={data.open_claims} notes={notes} onNoteChange={handleNoteChange} />
              </div>
            )}
            <ExclusionManager exclusions={data.exclusions} onRefetch={() => fetchReport(asOf, weekStart)} />
          </div>

          {/* ── Section 2: Closed This Week ── */}
          <div style={{ marginBottom: 20 }}>
            <SectionHeader
              title={`CLOSED THIS WEEK (${data.closed_this_week.length}) — ${data.week_start} to ${data.week_end}`}
              count={data.closed_this_week.length}
              expanded={expanded.closed}
              onToggle={() => toggle('closed')}
            />
            {expanded.closed && (
              <div style={tableContainerStyle}>
                <ClaimTable rows={data.closed_this_week} dateLabel="Close Date" notes={notes} onNoteChange={handleNoteChange} />
              </div>
            )}
          </div>

          {/* ── Section 3: Denied This Week ── */}
          <div style={{ marginBottom: 20 }}>
            <SectionHeader
              title={`DENIED THIS WEEK (${data.denied_this_week.length}) — ${data.week_start} to ${data.week_end}`}
              count={data.denied_this_week.length}
              expanded={expanded.denied}
              onToggle={() => toggle('denied')}
            />
            {expanded.denied && (
              <div style={tableContainerStyle}>
                <DeniedTable rows={data.denied_this_week} />
              </div>
            )}
            <ManualDenialForm onRefetch={() => fetchReport(asOf, weekStart)} />
          </div>

          {/* ── Section 4: New Claims This Week ── */}
          <div style={{ marginBottom: 20 }}>
            <SectionHeader
              title={`NEW CLAIMS THIS WEEK (${data.new_claims_this_week.length})`}
              count={data.new_claims_this_week.length}
              expanded={expanded.new}
              onToggle={() => toggle('new')}
            />
            {expanded.new && (
              <div style={tableContainerStyle}>
                <ClaimTable rows={data.new_claims_this_week} notes={notes} onNoteChange={handleNoteChange} />
              </div>
            )}
          </div>

          {/* ── Section 5: Pending UST Pulls ── */}
          <div style={{ marginBottom: 20 }}>
            <SectionHeader
              title={`PENDING UST PULLS (${data.pending_ust_pulls.length})`}
              count={data.pending_ust_pulls.length}
              expanded={expanded.pending}
              onToggle={() => toggle('pending')}
            />
            {expanded.pending && (
              <div style={tableContainerStyle}>
                <ClaimTable rows={data.pending_ust_pulls} notes={notes} onNoteChange={handleNoteChange} />
              </div>
            )}
          </div>
        </>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.6); cursor: pointer; }
      `}</style>
    </div>
  )
}
