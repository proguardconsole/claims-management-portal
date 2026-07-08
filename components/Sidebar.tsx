'use client'

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
} from 'lucide-react'

const NAV_ITEMS = [
  { label: 'KPI Summary',     href: '/',            icon: LayoutDashboard },
  { label: 'Open Claims',     href: '/claims',       icon: FileText        },
  { label: 'Analytics',       href: '/analytics',    icon: TrendingUp      },
  { label: 'Inspections',     href: '/inspections',  icon: ClipboardCheck  },
  { label: 'Call Logs',       href: '/call-logs',    icon: Phone           },
  { label: 'Closed / Denied', href: '/closed',       icon: Archive         },
  { label: 'Weekly Digest',   href: '/digest',       icon: FileBarChart    },
]

interface SidebarProps {
  lastSynced: string | null
}

export default function Sidebar({ lastSynced }: SidebarProps) {
  const pathname = usePathname()

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
    return d.toLocaleDateString()
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
        <div
          style={{ fontSize: 11, color: 'var(--text-tertiary)', lineHeight: 1.4 }}
        >
          <div style={{ textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>
            Last synced
          </div>
          <div>{formatLastSynced(lastSynced)}</div>
        </div>
      </div>
    </nav>
  )
}
