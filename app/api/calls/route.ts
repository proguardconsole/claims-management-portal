import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '../../../lib/supabase/server'

// ── constants ──────────────────────────────────────────────────────────────────

const SEPTIC_BASE_URL = 'https://mtqawtilhjivmahbmaiz.supabase.co/rest/v1'

const AGENT_COLE = 'Cole Anderson'
const AGENT_SHAWN = 'Shawn C. Zagryn'

const DEFAULT_DAYS = 30
const MAX_DAYS = 90
const FETCH_LIMIT = 200

// ── types ──────────────────────────────────────────────────────────────────────

type SepticCall = {
  id: string
  threecx_call_id: string | null
  direction: string | null
  did: string | null
  did_label: string | null
  caller_phone: string | null
  caller_name: string | null
  extension: string | null
  agent_name: string | null
  started_at: string | null
  ended_at: string | null
  duration_sec: number | null
  answered: boolean | null
  recording_url: string | null
  inferred_summary: string | null
  inferred_topics: string[] | null
  inferred_sentiment: string | null
  inferred_risk_flags: string[] | null
  inferred_product: string | null
  transcript: string | null
  inferred_confidence: number | null
}

type ClaimForMatch = {
  id: string
  field_service_number: string | null
  claim_contact_phone: string | null
  deal_name: string | null
  owner_name: string | null
  stage: string | null
  tank_type: string | null
}

type EnrichedCall = {
  id: string
  direction: 'inbound' | 'outbound'
  did_label: string
  caller_phone: string
  caller_name: string | null
  agent_name: string
  started_at: string
  duration_sec: number
  answered: boolean
  inferred_summary: string | null
  inferred_topics: string[] | null
  inferred_sentiment: string | null
  inferred_risk_flags: string[] | null
  inferred_product: string | null
  recording_url: string | null
  transcript: string | null
  matched_claim_fsn: string | null
  matched_claim_id: string | null
  match_confidence: 'phone' | 'none'
}

// ── helpers ────────────────────────────────────────────────────────────────────

function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 10 ? digits.slice(-10) : null
}

function clampDays(raw: string | null): number {
  if (!raw) return DEFAULT_DAYS
  const n = parseInt(raw, 10)
  if (isNaN(n) || n <= 0) return DEFAULT_DAYS
  return Math.min(n, MAX_DAYS)
}

// ── route handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('Authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const septicKey = process.env.SEPTIC_GTM_SERVICE_KEY
  if (!septicKey) {
    return NextResponse.json(
      { error: 'SEPTIC_GTM_SERVICE_KEY not configured' },
      { status: 500 },
    )
  }

  const { searchParams } = req.nextUrl
  const daysParam  = searchParams.get('days')
  const agentParam = searchParams.get('agent')   // 'cole' | 'shawn' | null
  const answeredParam = searchParams.get('answered') // 'true' | 'false' | null

  const days = clampDays(daysParam)
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  // ── STEP 1: fetch calls from Septic GTM ───────────────────────────────────

  const select = [
    'id', 'threecx_call_id', 'direction', 'did', 'did_label',
    'caller_phone', 'caller_name', 'extension', 'agent_name',
    'started_at', 'ended_at', 'duration_sec', 'answered',
    'recording_url', 'inferred_summary', 'inferred_topics',
    'inferred_sentiment', 'inferred_risk_flags',
    'inferred_product', 'transcript', 'inferred_confidence',
  ].join(',')

  const params = new URLSearchParams()
  params.set('select', select)
  params.set('order', 'started_at.desc')
  params.set('limit', String(FETCH_LIMIT))
  params.set('started_at', `gte.${cutoff.toISOString()}`)

  if (agentParam === 'cole') {
    params.set('agent_name', `eq.${AGENT_COLE}`)
  } else if (agentParam === 'shawn') {
    params.set('agent_name', `eq.${AGENT_SHAWN}`)
  } else {
    params.set('agent_name', `in.("${AGENT_COLE}","${AGENT_SHAWN}")`)
  }

  if (answeredParam === 'true')  params.set('answered', 'eq.true')
  if (answeredParam === 'false') params.set('answered', 'eq.false')

  const septicUrl = `${SEPTIC_BASE_URL}/phone_calls?${params.toString()}`

  let septicCalls: SepticCall[]
  try {
    const septicRes = await fetch(septicUrl, {
      headers: {
        apikey:        septicKey,
        Authorization: `Bearer ${septicKey}`,
        Accept:        'application/json',
      },
    })
    if (!septicRes.ok) {
      const body = await septicRes.text()
      return NextResponse.json(
        { error: 'Call data unavailable', details: `Septic GTM returned ${septicRes.status}: ${body}` },
        { status: 500 },
      )
    }
    septicCalls = await septicRes.json() as SepticCall[]
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { error: 'Call data unavailable', details: message },
      { status: 500 },
    )
  }

  // ── STEP 2: fetch ProGuard claims for phone matching ──────────────────────

  const sb = getServerSupabase()
  const { data: claimsData, error: claimsError } = await sb
    .from('claims')
    .select('id, field_service_number, claim_contact_phone, deal_name, owner_name, stage, tank_type')
    .not('claim_contact_phone', 'is', null)
    .neq('claim_contact_phone', '')

  if (claimsError) {
    return NextResponse.json(
      { error: 'Failed to fetch claims for matching', details: claimsError.message },
      { status: 500 },
    )
  }

  // ── STEP 3: build phone map and match ─────────────────────────────────────

  const phoneMap = new Map<string, ClaimForMatch>()
  for (const claim of (claimsData ?? []) as ClaimForMatch[]) {
    const normalized = normalizePhone(claim.claim_contact_phone)
    if (normalized) phoneMap.set(normalized, claim)
  }

  let matched = 0

  const calls: EnrichedCall[] = septicCalls.map((call) => {
    const normalizedCaller = normalizePhone(call.caller_phone)
    const matchedClaim = normalizedCaller ? phoneMap.get(normalizedCaller) : undefined

    if (matchedClaim) matched++

    return {
      id:                  call.id,
      direction:           (call.direction === 'outbound' ? 'outbound' : 'inbound') as 'inbound' | 'outbound',
      did_label:           call.did_label ?? '',
      caller_phone:        call.caller_phone ?? '',
      caller_name:         call.caller_name ?? null,
      agent_name:          call.agent_name ?? '',
      started_at:          call.started_at ?? '',
      duration_sec:        call.duration_sec ?? 0,
      answered:            call.answered ?? false,
      inferred_summary:    call.inferred_summary ?? null,
      inferred_topics:     call.inferred_topics ?? null,
      inferred_sentiment:  call.inferred_sentiment ?? null,
      inferred_risk_flags: call.inferred_risk_flags ?? null,
      inferred_product:    call.inferred_product ?? null,
      recording_url:       call.recording_url ?? null,
      transcript:          call.transcript ?? null,
      matched_claim_fsn:   matchedClaim
        ? (matchedClaim.field_service_number ?? matchedClaim.deal_name ?? matchedClaim.id)
        : null,
      matched_claim_id:    matchedClaim?.id ?? null,
      match_confidence:    matchedClaim ? 'phone' : 'none',
    }
  })

  // ── STEP 4: return enriched payload ──────────────────────────────────────

  return NextResponse.json({
    calls,
    meta: {
      total:      calls.length,
      matched,
      unmatched:  calls.length - matched,
      fetched_at: new Date().toISOString(),
    },
  })
}
