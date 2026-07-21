import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '../../../lib/supabase/server'

// ── constants ──────────────────────────────────────────────────────────────────

const MS_PER_DAY   = 1000 * 60 * 60 * 24
const STALE_DAYS   = 14
const OPEN_STATUSES = ['ast_open', 'ust_open', 'ust_pre_tank'] as const

// ── helpers ────────────────────────────────────────────────────────────────────

function authOk(req: NextRequest): boolean {
  return req.headers.get('Authorization') === `Bearer ${process.env.CRON_SECRET}`
}

// ── GET — individual stale claim records ───────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!authOk(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb        = getServerSupabase()
  const now       = Date.now()
  const threshold = new Date(now - STALE_DAYS * MS_PER_DAY).toISOString()

  const { data: claims, error: claimsErr } = await sb
    .from('claims')
    .select(
      'id, field_service_number, deal_name, stage, tank_type, claim_status, owner_name, modified_time, created_time',
    )
    .in('claim_status', [...OPEN_STATUSES])
    .lt('modified_time', threshold)
    .eq('record_type', 'Claim')
    .not('modified_time', 'is', null)

  if (claimsErr) {
    return NextResponse.json({ error: claimsErr.message }, { status: 500 })
  }

  const claimList = claims ?? []
  const ids       = claimList.map((c) => c.id)

  // Fetch latest note per claim (order desc so first-seen per claim_id is the latest)
  const { data: notes, error: notesErr } =
    ids.length > 0
      ? await sb
          .from('stale_notes')
          .select('claim_id, note, created_at')
          .in('claim_id', ids)
          .order('created_at', { ascending: false })
      : {
          data:  [] as { claim_id: string; note: string; created_at: string }[],
          error: null,
        }

  if (notesErr) {
    return NextResponse.json({ error: notesErr.message }, { status: 500 })
  }

  // Build lookup: claim_id → most recent note text
  const latestNoteMap: Record<string, string> = {}
  for (const n of notes ?? []) {
    const id = n.claim_id as string
    if (!latestNoteMap[id]) latestNoteMap[id] = n.note as string
  }

  const result = claimList
    .map((c) => {
      const daysStale = (now - new Date(c.modified_time as string).getTime()) / MS_PER_DAY
      const latestNote = latestNoteMap[c.id as string] ?? null
      return {
        id:                   c.id                   as string,
        field_service_number: c.field_service_number as string | null,
        deal_name:            c.deal_name            as string | null,
        stage:                c.stage                as string | null,
        tank_type:            c.tank_type            as string | null,
        claim_status:         c.claim_status         as string | null,
        owner_name:           c.owner_name           as string | null,
        modified_time:        c.modified_time        as string,
        days_stale:           Math.round(daysStale * 10) / 10,
        has_note:             latestNote !== null,
        latest_note:          latestNote,
      }
    })
    .sort((a, b) => b.days_stale - a.days_stale)

  return NextResponse.json({ claims: result, total: result.length })
}

// ── POST — add a note to a stale claim ────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!authOk(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    claim_id: string
    field_service_number?: string | null
    note: string
    noted_by?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { claim_id, field_service_number, note, noted_by } = body

  if (!claim_id || typeof claim_id !== 'string') {
    return NextResponse.json({ error: 'claim_id is required' }, { status: 400 })
  }
  if (!note || typeof note !== 'string' || !note.trim()) {
    return NextResponse.json({ error: 'note is required' }, { status: 400 })
  }

  const sb = getServerSupabase()

  const { data, error } = await sb
    .from('stale_notes')
    .insert({
      claim_id,
      field_service_number: field_service_number ?? null,
      note:      note.trim(),
      noted_by:  noted_by?.trim() || 'Team',
    })
    .select('id')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, id: (data as { id: string }).id })
}
