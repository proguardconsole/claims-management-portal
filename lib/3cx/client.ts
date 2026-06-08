const THREECX_TOKEN_PATH = '/connect/token'
const THREECX_CDR_PATH = '/xapi/v1/CallHistoryView'
const THREECX_QUEUE_PATH = '/xapi/v1/Queues'

interface CallLogParams {
  fromDate?: string
  toDate?: string
  limit?: number
  filter?: string  // OData $filter — NOTE: not supported by all 3CX deployments (returns 500)
  orderBy?: string // OData $orderby expression e.g. 'SegmentStartTime desc'
}

type ApiRecord = Record<string, unknown>

class ThreeCXClient {
  private readonly baseUrl: string
  private readonly clientId: string
  private readonly clientSecret: string // THREECX_API_KEY serves as the OAuth2 client_secret

  constructor() {
    this.baseUrl = process.env.THREECX_API_BASE_URL!
    this.clientId = process.env.THREECX_CLIENT_ID!
    this.clientSecret = process.env.THREECX_API_KEY!
  }

  private async getAccessToken(): Promise<string> {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    })

    const res = await fetch(`${this.baseUrl}${THREECX_TOKEN_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })

    if (!res.ok) {
      const errorBody = await res.text()
      throw new Error(`3CX token exchange failed: ${res.status} ${res.statusText} — ${errorBody}`)
    }

    const json = await res.json() as Record<string, unknown>
    return json.access_token as string
  }

  private getHeaders(token: string): Record<string, string> {
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
  }

  async getCallLogs(params?: CallLogParams): Promise<ApiRecord[]> {
    const token = await this.getAccessToken()
    const url = new URL(`${this.baseUrl}${THREECX_CDR_PATH}`)

    // OData query params
    if (params?.limit !== undefined) url.searchParams.set('$top', String(params.limit))
    if (params?.orderBy) url.searchParams.set('$orderby', params.orderBy)
    if (params?.filter) url.searchParams.set('$filter', params.filter)
    if (params?.fromDate) url.searchParams.set('fromDate', params.fromDate)
    if (params?.toDate) url.searchParams.set('toDate', params.toDate)

    const res = await fetch(url.toString(), { headers: this.getHeaders(token) })

    if (!res.ok) {
      const errorBody = await res.text()
      throw new Error(`3CX getCallLogs failed: ${res.status} ${res.statusText} — ${errorBody}`)
    }

    const json = await res.json() as { value?: ApiRecord[]; data?: ApiRecord[] } | ApiRecord[]
    if (Array.isArray(json)) return json
    return (json as { value?: ApiRecord[]; data?: ApiRecord[] }).value
      ?? (json as { value?: ApiRecord[]; data?: ApiRecord[] }).data
      ?? []
  }

  async getActiveQueues(): Promise<ApiRecord[]> {
    const token = await this.getAccessToken()

    const res = await fetch(`${this.baseUrl}${THREECX_QUEUE_PATH}`, {
      headers: this.getHeaders(token),
    })

    if (!res.ok) {
      const errorBody = await res.text()
      throw new Error(`3CX getActiveQueues failed: ${res.status} ${res.statusText} — ${errorBody}`)
    }

    const json = await res.json() as { value?: ApiRecord[]; data?: ApiRecord[] } | ApiRecord[]
    if (Array.isArray(json)) return json
    return (json as { value?: ApiRecord[]; data?: ApiRecord[] }).value
      ?? (json as { value?: ApiRecord[]; data?: ApiRecord[] }).data
      ?? []
  }
}

export const threeCXClient = new ThreeCXClient()
