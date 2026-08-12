import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  const key = process.env.SEPTIC_GTM_SERVICE_KEY
  if (!key) return NextResponse.json({ error: 'no key' }, { status: 500 })

  const params = new URLSearchParams()
  params.set('select', 'agent_name')
  params.set('order', 'started_at.desc')
  params.set('limit', '500')
  // 180-day window to catch any historical Shawn calls
  const cutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString()
  params.set('started_at', `gte.${cutoff}`)

  const res = await fetch(
    `https://mtqawtilhjivmahbmaiz.supabase.co/rest/v1/phone_calls?${params}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' }, cache: 'no-store' },
  )
  if (!res.ok) return NextResponse.json({ error: `septic ${res.status}` }, { status: 500 })

  const rows = (await res.json()) as { agent_name: string | null }[]
  const counts: Record<string, number> = {}
  for (const r of rows) {
    const n = r.agent_name ?? '(null)'
    counts[n] = (counts[n] ?? 0) + 1
  }
  return NextResponse.json({ unique_agents: counts, total_rows: rows.length })
}
