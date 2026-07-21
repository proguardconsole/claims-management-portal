'use client'

import { useState, useRef, useEffect } from 'react'

// ─── types ─────────────────────────────────────────────────────────────────────

export type FilterState = {
  owner: string
  oilDealer: string
  stage: string
  trigger: string
  dateFrom: string
  dateTo: string
  sort: string
}

export const DEFAULT_FILTERS: FilterState = {
  owner: '',
  oilDealer: '',
  stage: '',
  trigger: '',
  dateFrom: '',
  dateTo: '',
  sort: 'updated_desc',
}

type ComboboxOption = string | { value: string; label: string; separator?: boolean }

function optVal(o: ComboboxOption): string {
  return typeof o === 'string' ? o : o.value
}

function optLabel(o: ComboboxOption): string {
  return typeof o === 'string' ? o : o.label
}

// ─── UST virtual filter presets appended to stage dropdown ────────────────────

const UST_VIRTUAL_STAGES: ComboboxOption[] = [
  { value: '__ust_group__', label: 'UST Status', separator: true },
  { value: '__pending_ust_pull__', label: 'Pending UST Pull' },
  { value: '__pre_remediation__', label: 'Pre-Remediation' },
]

interface FilterBarProps {
  owners: string[]
  oilDealers: string[]
  stages: string[]
  triggers: string[]
  filters: FilterState
  onChange: (f: FilterState) => void
  stageLabel?: string
}

const SORT_OPTIONS = [
  { value: 'updated_desc',  label: 'Updated: Newest' },
  { value: 'updated_asc',   label: 'Updated: Oldest' },
  { value: 'reported_desc', label: 'Reported: Newest' },
  { value: 'reported_asc',  label: 'Reported: Oldest' },
  { value: 'fsn_asc',       label: 'FSN: A→Z' },
]

// ─── combobox ──────────────────────────────────────────────────────────────────

function Combobox({
  placeholder,
  value,
  options,
  onChange,
}: {
  placeholder: string
  value: string
  options: ComboboxOption[]
  onChange: (v: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const displayLabel = (() => {
    for (const o of options) {
      if (typeof o === 'string') { if (o === value) return o }
      else { if (o.value === value) return o.label }
    }
    return value
  })()

  const filtered = query
    ? options.filter((o) => {
        if (typeof o !== 'string' && o.separator) return false
        return optLabel(o).toLowerCase().includes(query.toLowerCase())
      })
    : options

  // Active state — show chip
  if (value) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-bright)',
          borderRadius: 4,
          padding: '3px 4px 3px 9px',
          fontSize: 12,
          color: 'var(--text-primary)',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {displayLabel}
        </span>
        <button
          onClick={() => onChange('')}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            padding: '0 3px',
            fontSize: 15,
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
          }}
          aria-label={`Clear ${placeholder}`}
        >
          ×
        </button>
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', flexShrink: 0 }}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        style={{
          width: 110,
          padding: '4px 8px',
          fontSize: 12,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          color: 'var(--text-primary)',
          outline: 'none',
          cursor: 'text',
        }}
      />
      {open && filtered.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 2px)',
            left: 0,
            zIndex: 100,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-bright)',
            borderRadius: 4,
            boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
            maxHeight: 220,
            overflowY: 'auto',
            minWidth: 160,
          }}
        >
          {filtered.map((o, i) => {
            const isSep = typeof o !== 'string' && o.separator
            if (isSep) {
              return (
                <div
                  key={`sep-${i}`}
                  style={{
                    padding: '4px 12px',
                    fontSize: 10,
                    color: 'var(--text-tertiary)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    background: 'var(--bg-header)',
                    borderTop: '1px solid var(--border)',
                    borderBottom: '1px solid var(--border)',
                    userSelect: 'none',
                  }}
                >
                  {optLabel(o)}
                </div>
              )
            }
            return (
              <div
                key={optVal(o)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange(optVal(o))
                  setOpen(false)
                  setQuery('')
                }}
                style={{
                  padding: '7px 12px',
                  fontSize: 12,
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                  borderBottom: '1px solid var(--border)',
                }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)'
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLElement).style.background = 'transparent'
                }}
              >
                {optLabel(o)}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── main component ─────────────────────────────────────────────────────────────

export default function FilterBar({
  owners,
  oilDealers,
  stages,
  triggers,
  filters,
  onChange,
  stageLabel = 'Stage',
}: FilterBarProps) {
  const hasActive =
    !!(filters.owner || filters.oilDealer || filters.stage || filters.trigger ||
       filters.dateFrom || filters.dateTo) ||
    filters.sort !== 'updated_desc'

  function set(key: keyof FilterState, val: string) {
    onChange({ ...filters, [key]: val })
  }

  const stageOptions: ComboboxOption[] = [...stages, ...UST_VIRTUAL_STAGES]

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 5,
        alignItems: 'center',
        padding: '8px 14px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-header)',
      }}
    >
      <Combobox
        placeholder="Owner"
        value={filters.owner}
        options={owners}
        onChange={(v) => set('owner', v)}
      />
      <Combobox
        placeholder="Oil Dealer"
        value={filters.oilDealer}
        options={oilDealers}
        onChange={(v) => set('oilDealer', v)}
      />
      <Combobox
        placeholder={stageLabel}
        value={filters.stage}
        options={stageOptions}
        onChange={(v) => set('stage', v)}
      />
      <Combobox
        placeholder="Trigger"
        value={filters.trigger}
        options={triggers}
        onChange={(v) => set('trigger', v)}
      />

      {/* Date range */}
      <input
        type="date"
        value={filters.dateFrom}
        onChange={(e) => set('dateFrom', e.target.value)}
        title="Reported from"
        style={{
          padding: '3px 6px',
          fontSize: 12,
          width: 118,
          background: 'var(--bg-surface)',
          border: `1px solid ${filters.dateFrom ? 'var(--border-bright)' : 'var(--border)'}`,
          borderRadius: 4,
          color: 'var(--text-primary)',
          outline: 'none',
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 11, color: 'var(--text-tertiary)', flexShrink: 0 }}>→</span>
      <input
        type="date"
        value={filters.dateTo}
        onChange={(e) => set('dateTo', e.target.value)}
        title="Reported to"
        style={{
          padding: '3px 6px',
          fontSize: 12,
          width: 118,
          background: 'var(--bg-surface)',
          border: `1px solid ${filters.dateTo ? 'var(--border-bright)' : 'var(--border)'}`,
          borderRadius: 4,
          color: 'var(--text-primary)',
          outline: 'none',
          flexShrink: 0,
        }}
      />

      {/* Sort */}
      <select
        value={filters.sort}
        onChange={(e) => set('sort', e.target.value)}
        style={{
          padding: '4px 7px',
          fontSize: 12,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          color: 'var(--text-primary)',
          outline: 'none',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      {hasActive && (
        <button
          onClick={() => onChange(DEFAULT_FILTERS)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: 11,
            color: 'var(--text-tertiary)',
            textDecoration: 'underline',
            padding: '0 2px',
            flexShrink: 0,
          }}
        >
          Clear all
        </button>
      )}
    </div>
  )
}
