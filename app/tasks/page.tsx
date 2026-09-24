'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, ChevronLeft, ChevronRight, LayoutGrid, CalendarDays } from 'lucide-react'
import TaskModal, { Task, ClaimOption } from '../../components/TaskModal'
import { TEAM, teamNameForEmail } from '../../lib/users'

// ─── helpers ───────────────────────────────────────────────────────────────────

const STATUS_META = {
  todo:        { label: 'Todo',        accent: 'var(--text-secondary)' },
  in_progress: { label: 'In Progress', accent: 'var(--accent-yellow)' },
  done:        { label: 'Done',        accent: 'var(--accent-green)' },
} as const

type Status = keyof typeof STATUS_META
const STATUS_ORDER: Status[] = ['todo', 'in_progress', 'done']

function fmtDue(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d} ${months[m - 1]} ${y}`
}

function isOverdue(task: Task): boolean {
  if (!task.due_date || task.status === 'done') return false
  const today = new Date()
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return task.due_date < todayIso
}

const SELECT_STYLE: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '7px 10px',
  color: 'var(--text-primary)',
  fontSize: 12,
  fontFamily: 'inherit',
  cursor: 'pointer',
  outline: 'none',
}

// ─── calendar helpers ──────────────────────────────────────────────────────────

const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June',
                     'July', 'August', 'September', 'October', 'November', 'December']
const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** All cell dates for a month grid — full weeks, Sunday-start. */
function monthGridDates(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  const start = new Date(first)
  start.setDate(first.getDate() - first.getDay())
  const cells: Date[] = []
  const cur = new Date(start)
  // Enough full weeks to cover the month
  while (cells.length < 42) {
    cells.push(new Date(cur))
    cur.setDate(cur.getDate() + 1)
    if (cells.length % 7 === 0 && cur.getMonth() !== anchor.getMonth() && cells.length >= 28) break
  }
  return cells
}

/** The 7 dates of the week containing the anchor — Sunday-start. */
function weekDates(anchor: Date): Date[] {
  const start = new Date(anchor)
  start.setDate(anchor.getDate() - anchor.getDay())
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

// ─── calendar task chip ────────────────────────────────────────────────────────

function CalendarChip({ task, fsn, onClick }: { task: Task; fsn: string | null; onClick: () => void }) {
  const [hovered, setHovered] = useState(false)
  const meta = STATUS_META[task.status]
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={`${task.title} — ${teamNameForEmail(task.assignee_email)}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        background: hovered ? 'var(--bg-elevated)' : 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${meta.accent}`,
        borderRadius: 4,
        padding: '3px 6px',
        cursor: 'pointer',
        transition: 'background 0.15s',
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          fontSize: 11,
          color: 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          textDecoration: task.status === 'done' ? 'line-through' : 'none',
          opacity: task.status === 'done' ? 0.6 : 1,
        }}
      >
        {task.title}
      </span>
      {fsn && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: 'var(--accent-yellow)',
            flexShrink: 0,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {fsn}
        </span>
      )}
    </div>
  )
}

// ─── calendar view ─────────────────────────────────────────────────────────────

function CalendarView({
  tasks,
  fsnByClaimId,
  onTaskClick,
}: {
  tasks: Task[]
  fsnByClaimId: Map<string, string>
  onTaskClick: (t: Task) => void
}) {
  const [mode, setMode]     = useState<'month' | 'week'>('month')
  const [anchor, setAnchor] = useState(() => new Date())

  const todayIso = toIsoDate(new Date())

  // Only tasks WITH a due date appear on the calendar
  const tasksByDate = useMemo(() => {
    const m = new Map<string, Task[]>()
    for (const t of tasks) {
      if (!t.due_date) continue
      const list = m.get(t.due_date) ?? []
      list.push(t)
      m.set(t.due_date, list)
    }
    return m
  }, [tasks])

  const dates = mode === 'month' ? monthGridDates(anchor) : weekDates(anchor)

  function navigate(dir: -1 | 1) {
    const next = new Date(anchor)
    if (mode === 'month') next.setMonth(anchor.getMonth() + dir, 1)
    else next.setDate(anchor.getDate() + dir * 7)
    setAnchor(next)
  }

  const headerLabel = mode === 'month'
    ? `${MONTHS_FULL[anchor.getMonth()]} ${anchor.getFullYear()}`
    : (() => {
        const [a, ...rest] = weekDates(anchor)
        const b = rest[rest.length - 1]
        const sameMonth = a.getMonth() === b.getMonth()
        return sameMonth
          ? `${a.getDate()}–${b.getDate()} ${MONTHS_FULL[a.getMonth()].slice(0, 3)} ${a.getFullYear()}`
          : `${a.getDate()} ${MONTHS_FULL[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${MONTHS_FULL[b.getMonth()].slice(0, 3)} ${b.getFullYear()}`
      })()

  return (
    <div>
      {/* Calendar toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => navigate(-1)} style={NAV_BTN_STYLE}><ChevronLeft size={15} /></button>
          <button onClick={() => navigate(1)}  style={NAV_BTN_STYLE}><ChevronRight size={15} /></button>
          <button
            onClick={() => setAnchor(new Date())}
            style={{ ...NAV_BTN_STYLE, padding: '5px 12px', fontSize: 12 }}
          >
            Today
          </button>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginLeft: 6 }}>
            {headerLabel}
          </span>
        </div>

        {/* Month / week toggle */}
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          {(['month', 'week'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                background: mode === m ? 'var(--bg-elevated)' : 'transparent',
                border: 'none',
                padding: '6px 14px',
                color: mode === m ? 'var(--text-primary)' : 'var(--text-tertiary)',
                fontSize: 12,
                fontWeight: mode === m ? 600 : 400,
                cursor: 'pointer',
                textTransform: 'capitalize',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Day-of-week header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>
        {DOW_LABELS.map((d) => (
          <div
            key={d}
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text-tertiary)',
              textAlign: 'center',
              padding: '4px 0',
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {dates.map((date) => {
          const iso = toIsoDate(date)
          const dayTasks = tasksByDate.get(iso) ?? []
          const inMonth = mode === 'week' || date.getMonth() === anchor.getMonth()
          const isToday = iso === todayIso
          return (
            <div
              key={iso}
              style={{
                background: inMonth ? 'var(--bg-surface)' : 'var(--bg-base)',
                border: isToday ? '1px solid var(--accent-yellow)' : '1px solid var(--border)',
                borderRadius: 8,
                padding: 8,
                minHeight: mode === 'month' ? 96 : 220,
                opacity: inMonth ? 1 : 0.45,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: isToday ? 700 : 500,
                  color: isToday ? 'var(--accent-yellow)' : 'var(--text-tertiary)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {date.getDate()}
              </span>
              {dayTasks.map((t) => (
                <CalendarChip
                  key={t.id}
                  task={t}
                  fsn={t.claim_id ? fsnByClaimId.get(t.claim_id) ?? null : null}
                  onClick={() => onTaskClick(t)}
                />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const NAV_BTN_STYLE: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: 5,
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
}

// ─── task card ─────────────────────────────────────────────────────────────────

function TaskCard({
  task,
  fsn,
  onClick,
  onMove,
}: {
  task: Task
  fsn: string | null
  onClick: () => void
  onMove: (dir: -1 | 1) => void
}) {
  const [hovered, setHovered] = useState(false)
  const overdue = isOverdue(task)
  const statusIdx = STATUS_ORDER.indexOf(task.status)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'var(--bg-elevated)' : 'var(--bg-surface)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '11px 13px',
        cursor: 'pointer',
        transition: 'background 0.15s',
        position: 'relative',
      }}
    >
      {/* Title */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--text-primary)',
          marginBottom: 6,
          lineHeight: 1.4,
          paddingRight: hovered ? 44 : 0,
        }}
      >
        {task.title}
      </div>

      {/* Meta row — assignee · due date */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          {teamNameForEmail(task.assignee_email)}
        </span>
        {task.due_date && (
          <span
            style={{
              fontSize: 11,
              color: overdue ? 'var(--accent-red)' : 'var(--text-tertiary)',
              fontWeight: overdue ? 700 : 400,
            }}
          >
            {overdue ? '⚠ ' : ''}{fmtDue(task.due_date)}
          </span>
        )}
        {fsn && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.04em',
              color: 'var(--accent-yellow)',
              border: '1px solid var(--accent-yellow)',
              borderRadius: 3,
              padding: '1px 5px',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {fsn}
          </span>
        )}
      </div>

      {/* Quick move arrows on hover */}
      {hovered && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            display: 'flex',
            gap: 2,
          }}
        >
          {statusIdx > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); onMove(-1) }}
              title={`Move to ${STATUS_META[STATUS_ORDER[statusIdx - 1]].label}`}
              style={{
                background: 'var(--bg-base)',
                border: '1px solid var(--border-bright)',
                borderRadius: 4,
                padding: 2,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
              }}
            >
              <ChevronLeft size={13} />
            </button>
          )}
          {statusIdx < STATUS_ORDER.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); onMove(1) }}
              title={`Move to ${STATUS_META[STATUS_ORDER[statusIdx + 1]].label}`}
              style={{
                background: 'var(--bg-base)',
                border: '1px solid var(--border-bright)',
                borderRadius: 4,
                padding: 2,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                display: 'flex',
              }}
            >
              <ChevronRight size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── page ──────────────────────────────────────────────────────────────────────

export default function TasksPage() {
  const [tasks, setTasks]     = useState<Task[]>([])
  const [claims, setClaims]   = useState<ClaimOption[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Filters + view
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [statusFilter, setStatusFilter]     = useState('')
  const [view, setView]                     = useState<'board' | 'calendar'>('board')

  // Modal state
  const [modalOpen, setModalOpen]     = useState(false)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  const fetchTasks = useCallback((silent = false) => {
    if (!silent) setLoading(true)
    fetch('/api/internal/tasks')
      .then((r) => {
        if (!r.ok) throw new Error(`Tasks fetch failed (${r.status})`)
        return r.json()
      })
      .then((data: Task[]) => {
        setTasks(data)
        setLoadError(null)
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    fetchTasks()
    const interval = setInterval(() => fetchTasks(true), 120_000)
    return () => clearInterval(interval)
  }, [fetchTasks])

  // Open claims once, for FSN badges + the modal's claim searcher
  useEffect(() => {
    fetch('/api/internal/claims')
      .then((r) => r.json())
      .then((data: { claims: ClaimOption[] }) => setClaims(data.claims ?? []))
      .catch(console.error)
  }, [])

  const fsnByClaimId = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of claims) {
      if (c.field_service_number) m.set(c.id, c.field_service_number)
    }
    return m
  }, [claims])

  const filtered = useMemo(
    () =>
      tasks.filter(
        (t) =>
          (!assigneeFilter || t.assignee_email === assigneeFilter) &&
          (!statusFilter || t.status === statusFilter),
      ),
    [tasks, assigneeFilter, statusFilter],
  )

  async function moveTask(task: Task, dir: -1 | 1) {
    const idx = STATUS_ORDER.indexOf(task.status)
    const next = STATUS_ORDER[idx + dir]
    if (!next) return
    // Optimistic update
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next } : t)))
    const res = await fetch(`/api/internal/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    if (!res.ok) fetchTasks(true) // revert on failure
  }

  return (
    <div>
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
          Tasks
        </h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {/* Board / Calendar toggle */}
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            {([
              { key: 'board',    label: 'Board',    Icon: LayoutGrid   },
              { key: 'calendar', label: 'Calendar', Icon: CalendarDays },
            ] as const).map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => setView(key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: view === key ? 'var(--bg-elevated)' : 'transparent',
                  border: 'none',
                  padding: '7px 14px',
                  color: view === key ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  fontSize: 12,
                  fontWeight: view === key ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>

          {/* Filters */}
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            style={SELECT_STYLE}
          >
            <option value="">All assignees</option>
            {TEAM.map((u) => (
              <option key={u.email} value={u.email}>{u.name}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={SELECT_STYLE}
          >
            <option value="">All statuses</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{STATUS_META[s].label}</option>
            ))}
          </select>

          {/* New task */}
          <button
            onClick={() => { setEditingTask(null); setModalOpen(true) }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--brand-cta)',
              border: 'none',
              borderRadius: 6,
              padding: '8px 14px',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'opacity 0.15s',
            }}
            onMouseOver={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = '0.85')}
            onMouseOut={(e)  => ((e.currentTarget as HTMLButtonElement).style.opacity = '1')}
          >
            <Plus size={15} />
            New task
          </button>
        </div>
      </div>

      {loadError && (
        <div
          style={{
            background: 'rgba(232, 90, 74, 0.12)',
            border: '1px solid rgba(232, 90, 74, 0.35)',
            borderRadius: 8,
            padding: '12px 16px',
            color: 'var(--accent-red)',
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {loadError}
        </div>
      )}

      {/* Board / Calendar */}
      {loading ? (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: 40, textAlign: 'center' }}>
          Loading tasks…
        </div>
      ) : view === 'calendar' ? (
        <CalendarView
          tasks={filtered}
          fsnByClaimId={fsnByClaimId}
          onTaskClick={(t) => { setEditingTask(t); setModalOpen(true) }}
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(240px, 1fr))',
            gap: 16,
            alignItems: 'start',
          }}
        >
          {STATUS_ORDER.map((status) => {
            const columnTasks = filtered.filter((t) => t.status === status)
            const meta = STATUS_META[status]
            return (
              <div
                key={status}
                style={{
                  background: 'var(--bg-header)',
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                {/* Column header */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 12,
                    padding: '2px 2px 0',
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: meta.accent,
                      display: 'inline-block',
                    }}
                  />
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {meta.label}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>
                    {columnTasks.length}
                  </span>
                </div>

                {/* Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {columnTasks.length === 0 ? (
                    <div
                      style={{
                        color: 'var(--text-tertiary)',
                        fontSize: 12,
                        padding: '18px 0',
                        textAlign: 'center',
                        border: '1px dashed var(--border)',
                        borderRadius: 8,
                      }}
                    >
                      No tasks
                    </div>
                  ) : (
                    columnTasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        task={task}
                        fsn={task.claim_id ? fsnByClaimId.get(task.claim_id) ?? null : null}
                        onClick={() => { setEditingTask(task); setModalOpen(true) }}
                        onMove={(dir) => moveTask(task, dir)}
                      />
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create/edit slide-over */}
      {modalOpen && (
        <TaskModal
          task={editingTask}
          claims={claims}
          onClose={() => setModalOpen(false)}
          onSaved={() => fetchTasks(true)}
        />
      )}
    </div>
  )
}
