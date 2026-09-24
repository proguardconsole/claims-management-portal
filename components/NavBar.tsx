'use client'

import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'

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
  const { data: session } = useSession()

  // Derive display name: "Nick A.", "Cole A.", etc.
  const displayName = session?.user?.name
    ? (() => {
        const parts = session.user.name.split(' ')
        return parts.length >= 2
          ? `${parts[0]} ${parts[parts.length - 1][0]}.`
          : parts[0]
      })()
    : null

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
      {/* Left — logo */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://septic.proguardplans.com/logo-white.png"
          alt="ProGuard"
          style={{ height: 28, width: 'auto', objectFit: 'contain' }}
        />
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

      {/* Right — user + clock */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>

        {/* Signed-in user + sign-out */}
        {displayName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                color: 'var(--text-secondary)',
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {displayName}
            </span>
            <button
              onClick={() => signOut({ callbackUrl: '/auth/signin' })}
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '3px 10px',
                color: 'var(--text-tertiary)',
                fontSize: 11,
                cursor: 'pointer',
                letterSpacing: '0.04em',
                transition: 'border-color 0.15s, color 0.15s',
              }}
              onMouseOver={(e) => {
                const b = e.currentTarget
                b.style.borderColor = 'var(--border-bright)'
                b.style.color       = 'var(--text-secondary)'
              }}
              onMouseOut={(e) => {
                const b = e.currentTarget
                b.style.borderColor = 'var(--border)'
                b.style.color       = 'var(--text-tertiary)'
              }}
            >
              Sign out
            </button>
          </div>
        )}

        {/* Clock (suppressHydrationWarning: time always differs between SSR and client) */}
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
      </div>
    </header>
  )
}
