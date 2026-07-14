import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '../../../lib/supabase/server'

const PAGE_LIMIT = 100
const META_BATCH = 1000

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('Authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getServerSupabase()
  const p = req.nextUrl.searchParams

  // ?meta=1 — paginate through all rows to build accurate stage counts
  if (p.get('meta') === '1') {
    const stageCounts: Record<string, number> = {}
    let pageOffset = 0

    while (true) {
      const { data, error } = await sb
        .from('inspections')
        .select('stage')
        .range(pageOffset, pageOffset + META_BATCH - 1)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      for (const r of data ?? []) {
        const s = (r.stage as string | null) ?? 'Unknown'
        stageCounts[s] = (stageCounts[s] ?? 0) + 1
      }

      if ((data ?? []).length < META_BATCH) break
      pageOffset += META_BATCH
    }

    const total = Object.values(stageCounts).reduce((a, b) => a + b, 0)
    return NextResponse.json({ stages: stageCounts, total })
  }

  const stage = p.get('stage')
  const park = p.get('park')
  const parkId = p.get('park_id')
  const from = p.get('from')
  const to = p.get('to')
  const search = p.get('search')
  const limit = Math.min(parseInt(p.get('limit') ?? String(PAGE_LIMIT), 10), 500)
  const offset = parseInt(p.get('offset') ?? '0', 10)

  let query = sb
    .from('inspections')
    .select('*')
    .order('modified_time', { ascending: false })
    .range(offset, offset + limit - 1)

  if (stage) query = query.eq('stage', stage)

  if (parkId) {
    query = query.eq('mobile_home_park_id', parkId)
  } else if (park) {
    query = query.ilike('mobile_home_park_name', `%${park}%`)
  }

  if (from) query = query.gte('closing_date', from)
  if (to) query = query.lte('closing_date', to)

  if (search) {
    query = query.or(
      `name.ilike.%${search}%,mobile_home_park_name.ilike.%${search}%,provider_contact.ilike.%${search}%,street.ilike.%${search}%`,
    )
  }

  const { data: inspections, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    inspections: inspections ?? [],
    total: (inspections ?? []).length,
  })
}
