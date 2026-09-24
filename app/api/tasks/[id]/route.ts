import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '../../../../lib/supabase/server'
import type { TaskBody } from '../route'
import { cronAuthOk } from '../../../../lib/secureCompare'

export const dynamic = 'force-dynamic'

const VALID_STATUSES = ['todo', 'in_progress', 'done']

function authOk(req: NextRequest): boolean {
  return cronAuthOk(req.headers.get('Authorization'))
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  if (!authOk(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = getServerSupabase()
  const { data, error } = await sb.from('tasks').select('*').eq('id', params.id).single()
  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500
    return NextResponse.json({ error: error.message }, { status })
  }
  return NextResponse.json(data)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  if (!authOk(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: TaskBody
  try {
    body = await req.json() as TaskBody
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 })
  }

  if (body.status && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 })
  }
  if (body.title !== undefined && !body.title?.trim()) {
    return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 })
  }

  // Only include fields explicitly present in the body
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.title          !== undefined) patch.title          = body.title.trim()
  if (body.description    !== undefined) patch.description    = body.description
  if (body.status         !== undefined) patch.status         = body.status
  if (body.assignee_email !== undefined) patch.assignee_email = body.assignee_email.toLowerCase()
  if (body.due_date       !== undefined) patch.due_date       = body.due_date
  if (body.claim_id       !== undefined) patch.claim_id       = body.claim_id

  const sb = getServerSupabase()
  const { data, error } = await sb
    .from('tasks')
    .update(patch)
    .eq('id', params.id)
    .select()
    .single()

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500
    return NextResponse.json({ error: error.message }, { status })
  }
  return NextResponse.json(data)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  if (!authOk(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sb = getServerSupabase()
  const { error } = await sb.from('tasks').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
