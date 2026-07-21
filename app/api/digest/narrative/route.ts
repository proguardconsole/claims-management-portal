import { NextRequest, NextResponse } from 'next/server'

// ── system prompt ──────────────────────────────────────────────────────────────

function buildSystemPrompt(periodLabel: string): string {
  const lower = periodLabel.toLowerCase()
  return `You are a claims operations analyst writing a ${lower} digest summary for the leadership team at ProGuard Environmental, an environmental insurance services company managing AST (above-ground storage tank) and UST (underground storage tank) claims.

You will receive a JSON payload containing this ${lower}'s claims data. Write exactly 3 short paragraphs:

Paragraph 1 — Pipeline health: Summarize the overall state of open claims, the stale rate, and how AST and UST pipelines compare this ${lower}. Mention period-over-period movement if notable.

Paragraph 2 — Biggest concern: Identify the single most critical issue visible in the data — the worst bottleneck stage, the highest-stale agent, claims past 60 days, or financial collection gaps. Be specific: name stages, numbers, and agent names where relevant.

Paragraph 3 — Recommended action: Give one concrete, actionable recommendation for leadership to address. Be direct. Do not hedge.

Tone: Direct, factual, executive-level. No bullet points. No headers. No markdown. Plain prose only. Each paragraph 2-4 sentences maximum.`
}

// ── route handler ──────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get('Authorization')
  const expected = `Bearer ${process.env.CRON_SECRET}`
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const period = req.nextUrl.searchParams.get('period') ?? 'week'

  // ── Step 1: resolve base URL and fetch digest payload ─────────────────────

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (() => {
      const host =
        req.headers.get('x-forwarded-host') ??
        req.headers.get('host') ??
        'localhost:3000'
      const proto = req.headers.get('x-forwarded-proto') ?? 'http'
      return `${proto}://${host}`
    })()

  let digestPayload: unknown
  let periodLabel = 'Weekly'
  try {
    const digestRes = await fetch(`${appUrl}/api/digest?period=${period}`, {
      headers: { Authorization: expected },
    })
    if (!digestRes.ok) {
      const body = await digestRes.json().catch(() => ({ error: digestRes.statusText })) as { error?: string }
      throw new Error(body.error ?? `Digest fetch failed: HTTP ${digestRes.status}`)
    }
    digestPayload = await digestRes.json()
    const meta = (digestPayload as { meta?: { period_label?: string } }).meta
    if (meta?.period_label) periodLabel = meta.period_label
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Failed to fetch digest: ${message}` }, { status: 500 })
  }

  // ── Step 2: check for API key ─────────────────────────────────────────────

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({
      available: false,
      message: 'ANTHROPIC_API_KEY not configured',
    })
  }

  // ── Step 3: call Anthropic API ────────────────────────────────────────────

  let anthropicRes: Response
  try {
    anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        system: buildSystemPrompt(periodLabel),
        messages: [
          {
            role: 'user',
            content: JSON.stringify(digestPayload),
          },
        ],
      }),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: `Anthropic request failed: ${message}` }, { status: 500 })
  }

  if (!anthropicRes.ok) {
    const errBody = await anthropicRes.json().catch(() => ({})) as { error?: { message?: string } }
    const detail = errBody.error?.message ?? `HTTP ${anthropicRes.status}`
    return NextResponse.json({ error: `Anthropic API error: ${detail}` }, { status: 500 })
  }

  // ── Step 4: extract narrative text ────────────────────────────────────────

  const responseJson = await anthropicRes.json() as {
    content: Array<{ type: string; text: string }>
  }

  const narrative = responseJson.content?.[0]?.text ?? ''

  return NextResponse.json({ available: true, narrative })
}
