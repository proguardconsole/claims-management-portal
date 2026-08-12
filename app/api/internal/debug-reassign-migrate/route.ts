import { NextResponse } from 'next/server'
import { getServerSupabase } from '../../../../lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  const sb = getServerSupabase()

  // 1. Confirm column exists by selecting it
  const { error: colCheck } = await sb
    .from('claims')
    .select('reassignment_needed')
    .limit(1)

  if (colCheck) {
    return NextResponse.json({ error: `column check failed: ${colCheck.message}` }, { status: 500 })
  }

  // 2. COUNT matching rows before UPDATE
  const { count, error: countErr } = await sb
    .from('claims')
    .select('*', { count: 'exact', head: true })
    .eq('owner_name', 'Shawn Zagryn')
    .in('claim_status', ['ast_open', 'ust_open'])

  if (countErr) {
    return NextResponse.json({ error: `count failed: ${countErr.message}` }, { status: 500 })
  }

  // 3. Run the UPDATE
  const { error: updateErr, count: updatedCount } = await sb
    .from('claims')
    .update({ reassignment_needed: true }, { count: 'exact' })
    .eq('owner_name', 'Shawn Zagryn')
    .in('claim_status', ['ast_open', 'ust_open'])

  if (updateErr) {
    return NextResponse.json({ error: `update failed: ${updateErr.message}` }, { status: 500 })
  }

  return NextResponse.json({
    column_exists: true,
    count_before_update: count,
    rows_updated: updatedCount,
    match: count === updatedCount,
  })
}
