import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '../../../lib/supabase/server'
import { cronAuthOk } from '../../../lib/secureCompare'

export const dynamic = 'force-dynamic'

const VALID_STATUSES = ['todo', 'in_progress', 'done'] as const
type TaskStatus = typeof VALID_STATUSES[number]

export type TaskBody = {
  title?: string
  description?: string | null
  status?: TaskStatus
  assignee_email?: string
  due_date?: string | null
  claim_id?: string | null
}

function authOk(req: NextRequest): boolean {
  return cronAuthOk(req.headers.get('Authorization'))
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!authOk(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const assignee = searchParams.get('assignee')
  const status   = searchParams.get('status')
  const claimId  = searchParams.get('claim_id')

  const sb = getServerSupabase()
  let query = sb
    .from('tasks')
    .select('*')
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (assignee) query = query.eq('assignee_email', assignee.toLowerCase())
  if (status)   query = query.eq('status', status)
  if (claimId)  query = query.eq('claim_id', claimId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!authOk(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: TaskBody
  try {
    body = await req.json() as TaskBody
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  if (!body.title?.trim())     return NextResponse.json({ error: 'title required' }, { status: 400 })
  if (!body.assignee_email)    return NextResponse.json({ error: 'assignee_email required' }, { status: 400 })
  if (body.status && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 })
  }

  const sb = getServerSupabase()
  const { data, error } = await sb
    .from('tasks')
    .insert({
      title:          body.title.trim(),
      description:    body.description ?? null,
      status:         body.status ?? 'todo',
      assignee_email: body.assignee_email.toLowerCase(),
      due_date:       body.due_date ?? null,
      claim_id:       body.claim_id ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
