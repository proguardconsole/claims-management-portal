import { NextResponse } from 'next/server'

export async function GET(): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const projectRef = url ? url.replace('https://', '').split('.')[0] : 'MISSING'
  return NextResponse.json({ projectRef })
}
