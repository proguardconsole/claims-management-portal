import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '../../../lib/supabase/server'

const DEFAULT_LIMIT = 500

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sb = getServerSupabase()
  const p = req.nextUrl.searchParams

  const stage = p.get('stage')
  const park = p.get('park')
  const parkId = p.get('park_id')
  const from = p.get('from')
  const to = p.get('to')
  const search = p.get('search')

  let query = sb
    .from('inspections')
    .select('*')
    .order('modified_time', { ascending: false })
    .limit(DEFAULT_LIMIT)

  if (stage) query = query.eq('stage', stage)

  // park_id is an exact match (used for history lookup); park is a name search
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

  // Fetch filtered inspections + distinct stage list in parallel
  const [inspRes, stagesRes] = await Promise.all([
    query,
    sb.from('inspections').select('stage').not('stage', 'is', null),
  ])

  if (inspRes.error) {
    return NextResponse.json({ error: inspRes.error.message }, { status: 500 })
  }

  const stageSet: Record<string, true> = {}
  for (const r of stagesRes.data ?? []) {
    if (r.stage) stageSet[r.stage as string] = true
  }
  const stages = Object.keys(stageSet).sort()

  return NextResponse.json({
    inspections: inspRes.data ?? [],
    total: (inspRes.data ?? []).length,
    stages,
  })
}
