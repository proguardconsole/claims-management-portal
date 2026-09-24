'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Trash2 } from 'lucide-react'
import { TEAM } from '../lib/users'

// ─── types ─────────────────────────────────────────────────────────────────────

export type Task = {
  id: string
  title: string
  description: string | null
  status: 'todo' | 'in_progress' | 'done'
  assignee_email: string
  due_date: string | null
  claim_id: string | null
  created_at: string
  updated_at: string
}

export type ClaimOption = {
  id: string
  field_service_number: string | null
  deal_name: string | null
  contact_name: string | null
}

type TaskModalProps = {
  task: Task | null              // null = create mode
  claims: ClaimOption[]          // open claims for the FSN searcher
  defaultClaimId?: string | null // pre-fill for "quick add from claim"
  defaultTitle?: string
  onClose: () => void
  onSaved: () => void
}

const STATUS_OPTIONS = [
  { value: 'todo',        label: 'Todo' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done',        label: 'Done' },
] as const

// ─── shared field styles ───────────────────────────────────────────────────────

const LABEL_STYLE: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  color: 'var(--text-tertiary)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 5,
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-base)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '9px 12px',
  color: 'var(--text-primary)',
  fontSize: 13,
  fontFamily: 'inherit',
  outline: 'none',
}

// ─── component ─────────────────────────────────────────────────────────────────

export default function TaskModal({
  task,
  claims,
  defaultClaimId = null,
  defaultTitle = '',
  onClose,
  onSaved,
}: TaskModalProps) {
  const isEdit = task !== null

  const [title, setTitle]             = useState(task?.title ?? defaultTitle)
  const [description, setDescription] = useState(task?.description ?? '')
  const [status, setStatus]           = useState<Task['status']>(task?.status ?? 'todo')
  const [assignee, setAssignee]       = useState(task?.assignee_email ?? TEAM[0].email)
  const [dueDate, setDueDate]         = useState(task?.due_date ?? '')
  const [claimId, setClaimId]         = useState<string | null>(task?.claim_id ?? defaultClaimId)
  const [claimQuery, setClaimQuery]   = useState('')
  const [claimDropdownOpen, setClaimDropdownOpen] = useState(false)
  const [saving, setSaving]           = useState(false)
  const [deleting, setDeleting]       = useState(false)
  const [error, setError]             = useState<string | null>(null)

  const claimSearchRef = useRef<HTMLDivElement>(null)

  // Close claim dropdown on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (claimSearchRef.current && !claimSearchRef.current.contains(e.target as Node)) {
        setClaimDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  // Escape closes the panel
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const linkedClaim = useMemo(
    () => (claimId ? claims.find((c) => c.id === claimId) ?? null : null),
    [claimId, claims],
  )

  const claimMatches = useMemo(() => {
    const q = claimQuery.trim().toLowerCase()
    if (!q) return []
    return claims
      .filter((c) =>
        (c.field_service_number ?? '').toLowerCase().includes(q) ||
        (c.deal_name ?? '').toLowerCase().includes(q) ||
        (c.contact_name ?? '').toLowerCase().includes(q),
      )
      .slice(0, 8)
  }, [claimQuery, claims])

  async function save() {
    if (!title.trim()) { setError('Title is required.'); return }
    setSaving(true)
    setError(null)
    const body = {
      title:          title.trim(),
      description:    description.trim() || null,
      status,
      assignee_email: assignee,
      due_date:       dueDate || null,
      claim_id:       claimId,
    }
    try {
      const res = isEdit
        ? await fetch(`/api/internal/tasks/${task.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await fetch('/api/internal/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? `Request failed (${res.status})`)
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    if (!isEdit) return
    if (!window.confirm('Delete this task?')) return
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/internal/tasks/${task.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? `Delete failed (${res.status})`)
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setDeleting(false)
    }
  }

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          zIndex: 90,
        }}
      />

      {/* Slide-over panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 440,
          maxWidth: '92vw',
          background: 'var(--bg-surface)',
          borderLeft: '1px solid var(--border-bright)',
          zIndex: 95,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-12px 0 40px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            {isEdit ? 'Edit Task' : 'New Task'}
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              padding: 4,
              display: 'flex',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={LABEL_STYLE}>Title *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs doing?"
              style={INPUT_STYLE}
              autoFocus
            />
          </div>

          <div>
            <label style={LABEL_STYLE}>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Optional details…"
              style={{ ...INPUT_STYLE, resize: 'vertical', minHeight: 80 }}
            />
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={LABEL_STYLE}>Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Task['status'])}
                style={{ ...INPUT_STYLE, cursor: 'pointer' }}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={LABEL_STYLE}>Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                style={{ ...INPUT_STYLE, colorScheme: 'dark' }}
              />
            </div>
          </div>

          <div>
            <label style={LABEL_STYLE}>Assignee</label>
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              style={{ ...INPUT_STYLE, cursor: 'pointer' }}
            >
              {TEAM.map((u) => (
                <option key={u.email} value={u.email}>{u.name}</option>
              ))}
            </select>
          </div>

          {/* Claim link searcher */}
          <div ref={claimSearchRef} style={{ position: 'relative' }}>
            <label style={LABEL_STYLE}>Linked claim</label>
            {linkedClaim ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '9px 12px',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <span
                    style={{
                      color: 'var(--accent-yellow)',
                      fontWeight: 700,
                      fontSize: 12,
                      fontVariantNumeric: 'tabular-nums',
                      flexShrink: 0,
                    }}
                  >
                    {linkedClaim.field_service_number ?? '—'}
                  </span>
                  <span
                    style={{
                      color: 'var(--text-secondary)',
                      fontSize: 12,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {linkedClaim.contact_name ?? linkedClaim.deal_name ?? ''}
                  </span>
                </span>
                <button
                  onClick={() => { setClaimId(null); setClaimQuery('') }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-tertiary)',
                    cursor: 'pointer',
                    padding: 2,
                    display: 'flex',
                    flexShrink: 0,
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ) : claimId ? (
              // Claim linked but not in the open-claims list (e.g. closed since)
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--bg-base)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '9px 12px',
                }}
              >
                <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                  Linked claim (not in open list)
                </span>
                <button
                  onClick={() => setClaimId(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-tertiary)',
                    cursor: 'pointer',
                    padding: 2,
                    display: 'flex',
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <>
                <input
                  value={claimQuery}
                  onChange={(e) => { setClaimQuery(e.target.value); setClaimDropdownOpen(true) }}
                  onFocus={() => setClaimDropdownOpen(true)}
                  placeholder="Search by FSN, name…"
                  style={INPUT_STYLE}
                />
                {claimDropdownOpen && claimMatches.length > 0 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      marginTop: 4,
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-bright)',
                      borderRadius: 6,
                      zIndex: 10,
                      maxHeight: 240,
                      overflowY: 'auto',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                    }}
                  >
                    {claimMatches.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => { setClaimId(c.id); setClaimDropdownOpen(false); setClaimQuery('') }}
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          borderBottom: '1px solid var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                        }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)')}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
                      >
                        <span
                          style={{
                            color: 'var(--accent-yellow)',
                            fontWeight: 700,
                            fontSize: 12,
                            fontVariantNumeric: 'tabular-nums',
                            flexShrink: 0,
                          }}
                        >
                          {c.field_service_number ?? '—'}
                        </span>
                        <span
                          style={{
                            color: 'var(--text-secondary)',
                            fontSize: 12,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {c.contact_name ?? c.deal_name ?? ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {error && (
            <div
              style={{
                background: 'rgba(232, 90, 74, 0.12)',
                border: '1px solid rgba(232, 90, 74, 0.35)',
                borderRadius: 6,
                padding: '10px 14px',
                color: 'var(--accent-red)',
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderTop: '1px solid var(--border)',
            gap: 10,
          }}
        >
          {isEdit ? (
            <button
              onClick={remove}
              disabled={deleting}
              style={{
                background: 'transparent',
                border: '1px solid rgba(232, 90, 74, 0.4)',
                borderRadius: 6,
                padding: '8px 14px',
                color: 'var(--accent-red)',
                fontSize: 12,
                cursor: deleting ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                opacity: deleting ? 0.6 : 1,
              }}
            >
              <Trash2 size={13} />
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          ) : <span />}

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '8px 16px',
                color: 'var(--text-secondary)',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving}
              style={{
                background: 'var(--brand-cta)',
                border: 'none',
                borderRadius: 6,
                padding: '8px 20px',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: saving ? 'default' : 'pointer',
                opacity: saving ? 0.7 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create task'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
