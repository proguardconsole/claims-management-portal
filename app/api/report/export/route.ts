import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { GET as reportGET } from '../route'
import type { ClaimRow, DeniedRow } from '../route'

export const runtime = 'nodejs'

// ─── auth ─────────────────────────────────────────────────────────────────────

function authOk(req: NextRequest): boolean {
  return req.headers.get('Authorization') === `Bearer ${process.env.CRON_SECRET}`
}

// ─── types ────────────────────────────────────────────────────────────────────

type Kpis = {
  open_count:          number
  net_total_incurred:  number
  total_adj_fees:      number
  avg_net_per_claim:   number
  avg_days_open:       number
  claims_180_plus:     number
  claims_under_90:     number
  total_billing_value: number
  top_trigger:         { trigger: string; count: number } | null
  closed_last_week:    number
}

type ReportJson = {
  as_of:                string
  week_start:           string
  week_end:             string
  kpis:                 Kpis
  open_claims:          ClaimRow[]
  closed_this_week:     ClaimRow[]
  denied_this_week:     DeniedRow[]
  new_claims_this_week: ClaimRow[]
  pending_ust_pulls:    ClaimRow[]
}

// ─── colour constants (ARGB) ──────────────────────────────────────────────────

const DARK_GREEN  = 'FF1B5E3B'
const MED_GREEN   = 'FF2D6A4F'
const LIGHT_GREEN = 'FFD8F3DC'
const WHITE       = 'FFFFFFFF'

const AGING_FILL: Record<string, string> = {
  '<90 Days':     'FFE8F5E9',
  '90-180 Days':  'FFFFFDE7',
  '180-365 Days': 'FFFFF3E0',
  '365+ Days':    'FFFFEBEE',
}

// Financial column indices (1-based): Adj Fees=9 … Estimate=14
const FIN_COLS = [9, 10, 11, 12, 13, 14]

// ─── helpers ──────────────────────────────────────────────────────────────────

function solidFill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

function toLocalDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Zero → null so Excel shows a blank cell instead of $0
function fin(n: number): number | null {
  return n === 0 ? null : n
}

// ─── column layout ────────────────────────────────────────────────────────────

function setColWidths(ws: ExcelJS.Worksheet): void {
  ws.columns = [
    { width: 10 }, // A  FS #
    { width: 28 }, // B  Contact Name
    { width: 22 }, // C  Stage
    { width: 18 }, // D  Trigger
    { width: 6  }, // E  Tank
    { width: 10 }, // F  Date
    { width: 6  }, // G  Days Open
    { width: 12 }, // H  Aging
    { width: 12 }, // I  Adj Fees
    { width: 12 }, // J  Billing Value
    { width: 12 }, // K  SF Collected
    { width: 12 }, // L  Ded Collected
    { width: 12 }, // M  Net Incurred
    { width: 12 }, // N  Estimate
    { width: 24 }, // O  Contractor
    { width: 30 }, // P  Notes
    { width: 14 }, // Q  Status (closed section only)
  ]
}

// ─── KPI header block (rows 1-6) ─────────────────────────────────────────────

function addKpiBlock(ws: ExcelJS.Worksheet, asOf: string, kpis: Kpis, numCols: number): void {
  // Row 1 — title
  const r1 = ws.addRow([`Ironwood | Open Claims | As of ${asOf}`])
  ws.mergeCells(r1.number, 1, r1.number, numCols)
  r1.height = 24
  const r1c = r1.getCell(1)
  r1c.font      = { name: 'Arial', size: 14, bold: true, color: { argb: WHITE } }
  r1c.fill      = solidFill(DARK_GREEN)
  r1c.alignment = { vertical: 'middle', horizontal: 'left' }

  // Rows 2-3 — first KPI strip
  const lbls1 = new Array<string | null>(numCols).fill(null)
  lbls1[0] = 'Open Claims';      lbls1[3] = 'Net Total Incurred'
  lbls1[6] = 'Total Adj Fees';   lbls1[9] = 'Avg Net / Claim'
  lbls1[12] = 'Avg Days Open'
  const r2 = ws.addRow(lbls1)
  r2.font = { name: 'Arial', size: 10, bold: true }

  const vals1 = new Array<number | null>(numCols).fill(null)
  vals1[0] = kpis.open_count;            vals1[3] = kpis.net_total_incurred
  vals1[6] = kpis.total_adj_fees;        vals1[9] = kpis.avg_net_per_claim
  vals1[12] = kpis.avg_days_open
  const r3 = ws.addRow(vals1)
  r3.font = { name: 'Arial', size: 10 }
  r3.getCell(4).numFmt  = '$#,##0'
  r3.getCell(7).numFmt  = '$#,##0'
  r3.getCell(10).numFmt = '$#,##0'

  // Rows 4-5 — second KPI strip
  const lbls2 = new Array<string | null>(numCols).fill(null)
  lbls2[0] = 'Claims 180+ Days';   lbls2[3] = 'Claims <90 Days'
  lbls2[6] = 'Total Billing Value'; lbls2[9] = 'Top Trigger'
  lbls2[12] = 'Closed Last Week'
  const r4 = ws.addRow(lbls2)
  r4.font = { name: 'Arial', size: 10, bold: true }

  const topTriggerStr = kpis.top_trigger
    ? `${kpis.top_trigger.trigger} (${kpis.top_trigger.count})`
    : null
  const vals2 = new Array<number | string | null>(numCols).fill(null)
  vals2[0] = kpis.claims_180_plus;      vals2[3] = kpis.claims_under_90
  vals2[6] = kpis.total_billing_value;  vals2[9] = topTriggerStr
  vals2[12] = kpis.closed_last_week
  const r5 = ws.addRow(vals2)
  r5.font = { name: 'Arial', size: 10 }
  r5.getCell(7).numFmt = '$#,##0'

  // Row 6 — spacer
  ws.addRow([])
}

// ─── section builders ─────────────────────────────────────────────────────────

function addSectionHdr(ws: ExcelJS.Worksheet, title: string, numCols: number): void {
  const row = ws.addRow([title])
  ws.mergeCells(row.number, 1, row.number, numCols)
  row.height = 22
  const cell = row.getCell(1)
  cell.font      = { name: 'Arial', size: 14, bold: true, color: { argb: WHITE } }
  cell.fill      = solidFill(DARK_GREEN)
  cell.alignment = { vertical: 'middle', horizontal: 'left' }
}

function addColHdrs(ws: ExcelJS.Worksheet, hdrs: string[]): void {
  const row = ws.addRow(hdrs)
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font  = { name: 'Arial', size: 10, bold: true, color: { argb: WHITE } }
    cell.fill  = solidFill(MED_GREEN)
    cell.alignment = { vertical: 'middle' }
  })
}

const OPEN_HDRS = [
  'FS #', 'Contact Name', 'Stage', 'Trigger', 'Tank', 'Open Date',
  'Days Open', 'Aging', 'Adj Fees', 'Billing Value', 'SF Collected',
  'Ded Collected', 'Net Incurred', 'Estimate', 'Contractor', 'Notes',
]

const CLOSED_HDRS = [
  'FS #', 'Contact Name', 'Stage', 'Trigger', 'Tank', 'Close Date',
  'Days Open', 'Aging', 'Adj Fees', 'Billing Value', 'SF Collected',
  'Ded Collected', 'Net Incurred', 'Estimate', 'Contractor', 'Notes', 'Status',
]

const DENIED_HDRS = ['FS #', 'Contact Name', 'Stage', 'Trigger', 'Tank', 'Close Date']

function addClaimDataRow(ws: ExcelJS.Worksheet, r: ClaimRow, isClose = false): void {
  const dateVal = isClose ? toLocalDate(r.close_date) : toLocalDate(r.created_time)
  const values: (string | number | Date | null | undefined)[] = [
    r.field_service_number,
    r.contact_name,
    r.stage,
    r.claim_trigger,
    r.tank_type,
    dateVal,
    r.days_open || null,
    r.aging,
    fin(r.adjuster_fees),
    fin(r.billing_value),
    fin(r.sf_collected),
    fin(r.ded_collected),
    fin(r.net_incurred),
    fin(r.estimate_total),
    r.contractor_name,
    null, // Notes — blank in export
  ]
  if (isClose) values.push(r.claim_status)

  const row = ws.addRow(values)
  row.font = { name: 'Arial', size: 10 }

  // Financial columns: right-align + currency format
  for (const col of FIN_COLS) {
    const cell = row.getCell(col)
    cell.numFmt    = '$#,##0'
    cell.alignment = { horizontal: 'right' }
  }

  // Date cell
  if (dateVal) row.getCell(6).numFmt = 'M/D/YY'

  // Days Open: right-align
  row.getCell(7).alignment = { horizontal: 'right' }

  // Aging: cell fill by bucket
  const agFill = AGING_FILL[r.aging]
  if (agFill) row.getCell(8).fill = solidFill(agFill)
}

function addTotalsRow(ws: ExcelJS.Worksheet, rows: ClaimRow[], label: string, numCols: number): void {
  const vals = new Array<number | string | null>(numCols).fill(null)
  vals[0]  = label
  vals[8]  = rows.reduce((s, r) => s + r.adjuster_fees,  0)
  vals[9]  = rows.reduce((s, r) => s + r.billing_value,  0)
  vals[10] = rows.reduce((s, r) => s + r.sf_collected,   0)
  vals[11] = rows.reduce((s, r) => s + r.ded_collected,  0)
  vals[12] = rows.reduce((s, r) => s + r.net_incurred,   0)
  vals[13] = rows.reduce((s, r) => s + r.estimate_total, 0)

  const row = ws.addRow(vals)
  row.font = { name: 'Arial', size: 10, bold: true }
  row.eachCell({ includeEmpty: true }, (cell, col) => {
    cell.fill = solidFill(LIGHT_GREEN)
    if (FIN_COLS.includes(col)) {
      cell.numFmt    = '$#,##0'
      cell.alignment = { horizontal: 'right' }
    }
  })
}

function addClaimsSection(
  ws: ExcelJS.Worksheet,
  title: string,
  rows: ClaimRow[],
  totalsLabel: string,
  isClose = false,
): void {
  const numCols = isClose ? 17 : 16
  addSectionHdr(ws, title, numCols)
  addColHdrs(ws, isClose ? CLOSED_HDRS : OPEN_HDRS)
  for (const r of rows) addClaimDataRow(ws, r, isClose)
  addTotalsRow(ws, rows, totalsLabel, numCols)
  ws.addRow([]) // spacer between sections
}

function addDeniedSection(ws: ExcelJS.Worksheet, title: string, rows: DeniedRow[]): void {
  addSectionHdr(ws, title, DENIED_HDRS.length)
  addColHdrs(ws, DENIED_HDRS)
  for (const r of rows) {
    const row = ws.addRow([
      r.manual ? `Manual: ${r.field_service_number ?? ''}` : r.field_service_number,
      r.contact_name,
      r.stage,
      r.claim_trigger,
      r.tank_type,
      toLocalDate(r.close_date),
    ])
    row.font = { name: 'Arial', size: 10 }
    if (r.close_date) row.getCell(6).numFmt = 'M/D/YY'
  }
  ws.addRow([]) // spacer
}

// ─── route ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!authOk(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Re-use the report GET handler — inject auth header on the proxy request
  const reportUrl = new URL(`/api/report${req.nextUrl.search}`, req.nextUrl.origin)
  const reportReq = new NextRequest(reportUrl, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ''}` },
  })
  const reportRes = await reportGET(reportReq)
  if (!reportRes.ok) {
    const body = await reportRes.text()
    return NextResponse.json({ error: `Report fetch failed: ${body}` }, { status: 500 })
  }

  const report = (await reportRes.json()) as ReportJson
  const { as_of, week_start, week_end, kpis } = report

  // Widest section is closed (17 cols); use that as the sheet's max column count
  const MAX_COLS = 17

  const wb = new ExcelJS.Workbook()
  wb.creator = 'ProGuard Claims Portal'
  wb.created = new Date()

  const ws = wb.addWorksheet('Ironwood')
  setColWidths(ws)

  // KPI block occupies rows 1-6
  addKpiBlock(ws, as_of, kpis, MAX_COLS)

  // Freeze through KPI block + open claims section header + col headers (rows 1-8)
  ws.views = [{ state: 'frozen', ySplit: 8, xSplit: 0 }]

  // Section 1 — Open Claims
  addClaimsSection(
    ws,
    `OPEN CLAIMS (${report.open_claims.length})`,
    report.open_claims,
    'OPEN TOTALS',
  )

  // Section 2 — Closed This Week
  addClaimsSection(
    ws,
    `CLOSED IN LAST WEEK (${report.closed_this_week.length}) — ${week_start} to ${week_end}`,
    report.closed_this_week,
    'CLOSED TOTALS',
    true,
  )

  // Section 3 — Denied This Week
  addDeniedSection(
    ws,
    `DENIED (${report.denied_this_week.length}) — ${week_start} to ${week_end}`,
    report.denied_this_week,
  )

  // Section 4 — New Claims This Week
  addClaimsSection(
    ws,
    `NEW CLAIMS THIS WEEK (${report.new_claims_this_week.length}) — ${week_start} to ${week_end}`,
    report.new_claims_this_week,
    'NEW TOTALS',
  )

  // Section 5 — Pending UST Pulls
  addClaimsSection(
    ws,
    `PENDING UST PULLS (${report.pending_ust_pulls.length})`,
    report.pending_ust_pulls,
    'PENDING TOTALS',
  )

  const buffer = Buffer.from(await wb.xlsx.writeBuffer())

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="ProGuard_Claims_${as_of}.xlsx"`,
    },
  })
}
