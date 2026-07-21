import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '../../../../lib/supabase/server'

const SEPTIC_BASE = 'https://mtqawtilhjivmahbmaiz.supabase.co/rest/v1'
const AGENT_COLE = 'Cole Anderson'
const AGENT_SHAWN = 'Shawn C. Zagryn'

type SepticCall = {
  id: string
  direction: string | null
  caller_phone: string | null
  caller_name: string | null
  agent_name: string | null
  started_at: string | null
  duration_sec: number | null
  answered: boolean | null
  inferred_summary: string | null
  inferred_sentiment: string | null
  inferred_risk_flags: string[] | null
  inferred_topics: string[] | null
}

type CallLog = {
  id: string
  call_time: string
  duration_seconds: number
  direction: string
  agent_name: string
  phone_number: string
  call_answered: boolean
  inferred_summary: string | null
  inferred_sentiment: string | null
  inferred_risk_flags: string[] | null
  inferred_topics: string[] | null
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const authHeader = req.headers.get('Authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const claimId = params.id
  const sb = getServerSupabase()

  const [historyRes, claimRes, estRes, payRes] = await Promise.all([
    sb
      .from('claim_events')
      .select('stage, entered_at, days_in_stage, modified_by_name')
      .eq('claim_id', claimId)
      .order('entered_at', { ascending: true }),
    sb
      .from('claims')
      .select('claim_contact_phone')
      .eq('id', claimId)
      .single(),
    sb.from('estimates').select('estimate_total').eq('claim_id', claimId),
    sb.from('claim_payments').select('amount').eq('claim_id', claimId),
  ])

  const history = historyRes.data ?? []
  const phone = claimRes.data?.claim_contact_phone ?? null
  const estimate_total = (estRes.data ?? []).reduce((s, r) => s + (r.estimate_total ?? 0), 0)
  const payment_total = (payRes.data ?? []).reduce((s, r) => s + (r.amount ?? 0), 0)

  let calls: CallLog[] = []
  const septicKey = process.env.SEPTIC_GTM_SERVICE_KEY

  if (phone && septicKey) {
    const digits = phone.replace(/\D/g, '').slice(-10)
    const params = new URLSearchParams()
    params.set(
      'select',
      'id,direction,caller_phone,caller_name,agent_name,started_at,duration_sec,answered,inferred_summary,inferred_sentiment,inferred_risk_flags,inferred_topics',
    )
    params.set('agent_name', `in.("${AGENT_COLE}","${AGENT_SHAWN}")`)
    params.set('caller_phone', `ilike.*${digits}*`)
    params.set('order', 'started_at.desc')
    params.set('limit', '20')

    try {
      const res = await fetch(`${SEPTIC_BASE}/phone_calls?${params.toString()}`, {
        headers: {
          apikey: septicKey,
          Authorization: `Bearer ${septicKey}`,
          Accept: 'application/json',
        },
      })
      if (res.ok) {
        const raw = (await res.json()) as SepticCall[]
        calls = raw.map((c) => ({
          id: c.id,
          call_time: c.started_at ?? '',
          duration_seconds: c.duration_sec ?? 0,
          direction: c.direction ?? 'inbound',
          agent_name: c.agent_name ?? '',
          phone_number: c.caller_phone ?? '',
          call_answered: c.answered ?? false,
          inferred_summary: c.inferred_summary ?? null,
          inferred_sentiment: c.inferred_sentiment ?? null,
          inferred_risk_flags: c.inferred_risk_flags ?? null,
          inferred_topics: c.inferred_topics ?? null,
        }))
      } else {
        console.error('[claim detail] Septic GTM call fetch failed:', res.status, await res.text())
      }
    } catch (err) {
      console.error(
        '[claim detail] Septic GTM fetch error:',
        err instanceof Error ? err.message : String(err),
      )
    }
  } else if (phone && !septicKey) {
    console.warn('[claim detail] SEPTIC_GTM_SERVICE_KEY not configured — skipping call history')
  }

  return NextResponse.json({ history, calls, phone, estimate_total, payment_total })
}
