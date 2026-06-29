'use client'

import { useEffect, useState } from 'react'
import { Shield } from 'lucide-react'

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function formatDate(d: Date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

export default function NavBar() {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const timeStr = now
    ? `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
    : '--:--:--'
  const dateStr = now ? formatDate(now) : ''

  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 52,
        background: 'var(--bg-header)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        zIndex: 50,
      }}
    >
      {/* Left — wordmark */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Shield
          size={18}
          style={{ color: 'var(--accent-yellow)', flexShrink: 0 }}
          strokeWidth={2.5}
        />
        <span
          style={{
            color: 'var(--accent-yellow)',
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: '0.12em',
          }}
        >
          PROGUARD
        </span>
      </div>

      {/* Center — subtitle */}
      <span
        style={{
          color: 'var(--text-secondary)',
          fontSize: 11,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
        }}
      >
        Claims Management
      </span>

      {/* Right — clock (suppressHydrationWarning: time always differs between SSR and client) */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
        <span
          suppressHydrationWarning
          style={{
            color: 'var(--text-primary)',
            fontSize: 13,
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 600,
            letterSpacing: '0.04em',
          }}
        >
          {timeStr}
        </span>
        <span suppressHydrationWarning style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
          {dateStr}
        </span>
      </div>
    </header>
  )
}
