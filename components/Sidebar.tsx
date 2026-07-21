'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  FileText,
  ClipboardCheck,
  Phone,
  TrendingUp,
  Archive,
  FileBarChart,
  Info,
} from 'lucide-react'

const NAV_ITEMS = [
  { label: 'KPI Summary',     href: '/',            icon: LayoutDashboard },
  { label: 'Open Claims',     href: '/claims',       icon: FileText        },
  { label: 'Analytics',       href: '/analytics',    icon: TrendingUp      },
  { label: 'Inspections',     href: '/inspections',  icon: ClipboardCheck  },
  { label: 'Call Logs',       href: '/calls',         icon: Phone           },
  { label: 'Closed / Denied', href: '/closed',       icon: Archive         },
  { label: 'Weekly Digest',   href: '/digest',       icon: FileBarChart    },
]

interface SidebarProps {
  lastSynced: string | null
}

export default function Sidebar({ lastSynced }: SidebarProps) {
  const pathname = usePathname()
  const [showSyncTip, setShowSyncTip] = useState(false)

  function isActive(href: string) {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  function formatLastSynced(iso: string | null) {
    if (!iso) return 'Never'
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHrs = Math.floor(diffMins / 60)
    if (diffHrs < 24) return `${diffHrs}h ago`
    const date = d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
    const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    return `${date} ${time}`
  }

  return (
    <nav
      style={{
        position: 'fixed',
        top: 52,
        left: 0,
        bottom: 0,
        width: 220,
        background: 'var(--bg-header)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 40,
      }}
    >
      <div style={{ flex: 1, paddingTop: 8 }}>
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 16px',
                fontSize: 13,
                color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: active ? 'var(--bg-elevated)' : 'transparent',
                borderLeft: active
                  ? '3px solid var(--accent-yellow)'
                  : '3px solid transparent',
                textDecoration: 'none',
                transition: 'background 0.1s, color 0.1s',
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  ;(e.currentTarget as HTMLElement).style.background =
                    'var(--bg-surface)'
                  ;(e.currentTarget as HTMLElement).style.color =
                    'var(--text-primary)'
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  ;(e.currentTarget as HTMLElement).style.background =
                    'transparent'
                  ;(e.currentTarget as HTMLElement).style.color =
                    'var(--text-secondary)'
                }
              }}
            >
              <Icon size={15} strokeWidth={active ? 2.5 : 2} />
              {label}
            </Link>
          )
        })}
      </div>

      {/* Last synced footer */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
        }}
      >
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.4 }}>
          <div
            style={{
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: 2,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            Last synced
            <span
              style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
              onMouseEnter={() => setShowSyncTip(true)}
              onMouseLeave={() => setShowSyncTip(false)}
            >
              <Info size={12} style={{ cursor: 'default', color: 'var(--text-tertiary)' }} />
              {showSyncTip && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 6px)',
                    left: 0,
                    width: 210,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-bright)',
                    borderRadius: 4,
                    padding: '7px 10px',
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                    lineHeight: 1.5,
                    zIndex: 200,
                    boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
                    whiteSpace: 'normal',
                    textTransform: 'none',
                    letterSpacing: 'normal',
                    fontWeight: 400,
                  }}
                >
                  Data is synced from Zoho CRM once daily. The dashboard refreshes every 2 minutes from the local database.
                </div>
              )}
            </span>
          </div>
          <div>{formatLastSynced(lastSynced)}</div>
        </div>
      </div>
    </nav>
  )
}
