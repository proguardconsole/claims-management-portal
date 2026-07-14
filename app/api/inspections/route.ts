import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '../../../lib/supabase/server'

const PAGE_LIMIT = 100
const META_BATCH = 1000

const SORT_MAP: Record<string, { col: string; asc: boolean }> = {
  closing_date_desc: { col: 'closing_date', asc: false },
  closing_date_asc: { col: 'closing_date', asc: true },
  inspection_date_desc: { col: 'inspection_date', asc: false },
  inspection_date_asc: { col: 'inspection_date', asc: true },
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('Authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = getServerSupabase()
  const p = req.nextUrl.searchParams

  // ?meta=1 — full table scan: stage counts, result counts, distinct park names
  if (p.get('meta') === '1') {
    const stageCounts: Record<string, number> = {}
    const resultCounts: Record<string, number> = {}
    const parkSet = new Set<string>()
    let pageOffset = 0

    while (true) {
      const { data, error } = await sb
        .from('inspections')
        .select('stage, inspection_result, mobile_home_park_name')
        .range(pageOffset, pageOffset + META_BATCH - 1)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })

      for (const r of data ?? []) {
        const s = (r.stage as string | null) ?? 'Unknown'
        stageCounts[s] = (stageCounts[s] ?? 0) + 1

        const res = r.inspection_result as string | null
        if (res) resultCounts[res] = (resultCounts[res] ?? 0) + 1

        const park = r.mobile_home_park_name as string | null
        if (park) parkSet.add(park)
      }

      if ((data ?? []).length < META_BATCH) break
      pageOffset += META_BATCH
    }

    const total = Object.values(stageCounts).reduce((a, b) => a + b, 0)
    return NextResponse.json({
      stages: stageCounts,
      results: resultCounts,
      parks: Array.from(parkSet).sort(),
      total,
    })
  }

  const stage = p.get('stage')
  const park = p.get('park')
  const parkId = p.get('park_id')
  const stateF = p.get('state')
  const resultF = p.get('inspection_result')
  const from = p.get('from')
  const to = p.get('to')
  const dateFrom = p.get('date_from')
  const dateTo = p.get('date_to')
  const search = p.get('search')
  const sortKey = p.get('sort') ?? 'closing_date_desc'
  const sortOpt = SORT_MAP[sortKey] ?? SORT_MAP.closing_date_desc
  const limit = Math.min(parseInt(p.get('limit') ?? String(PAGE_LIMIT), 10), 500)
  const offset = parseInt(p.get('offset') ?? '0', 10)

  let query = sb
    .from('inspections')
    .select('*')
    .order(sortOpt.col, { ascending: sortOpt.asc })
    .range(offset, offset + limit - 1)

  if (stage) query = query.eq('stage', stage)
  if (stateF) query = query.eq('state', stateF)
  if (resultF) query = query.eq('inspection_result', resultF)

  if (parkId) {
    query = query.eq('mobile_home_park_id', parkId)
  } else if (park) {
    query = query.ilike('mobile_home_park_name', `%${park}%`)
  }

  if (from) query = query.gte('closing_date', from)
  if (to) query = query.lte('closing_date', to)
  if (dateFrom) query = query.gte('inspection_date', dateFrom)
  if (dateTo) query = query.lte('inspection_date', dateTo)

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
