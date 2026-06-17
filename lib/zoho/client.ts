const ZOHO_TOKEN_URL = 'https://accounts.zoho.com/oauth/v2/token'
const ZOHO_API_BASE = 'https://www.zohoapis.com/crm/v2'

class ZohoClient {
  private readonly clientId: string
  private readonly clientSecret: string
  private readonly refreshToken: string
  private cachedToken: string | null = null
  private tokenExpiresAt: number = 0

  constructor() {
    this.clientId = process.env.ZOHO_CLIENT_ID!
    this.clientSecret = process.env.ZOHO_CLIENT_SECRET!
    this.refreshToken = process.env.ZOHO_REFRESH_TOKEN!
  }

  private async getAccessToken(): Promise<string> {
    // Reuse cached token until 60s before expiry — avoids re-fetching on every page
    if (this.cachedToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return this.cachedToken
    }

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshToken,
    })

    const res = await fetch(`${ZOHO_TOKEN_URL}?${params.toString()}`, {
      method: 'POST',
    })

    if (!res.ok) {
      const errorBody = await res.text()
      throw new Error(`Zoho token refresh failed: ${res.status} ${res.statusText} — ${errorBody}`)
    }

    const json = await res.json() as Record<string, unknown>
    this.cachedToken = json.access_token as string
    const expiresIn = (json.expires_in as number ?? 3600) * 1000
    this.tokenExpiresAt = Date.now() + expiresIn
    return this.cachedToken
  }

  async getRecords(module: string, params?: Record<string, string>): Promise<Record<string, unknown>[]> {
    const token = await this.getAccessToken()
    const url = new URL(`${ZOHO_API_BASE}/${module}`)

    if (params) {
      Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    })

    if (!res.ok) {
      const errorBody = await res.text()
      throw new Error(`Zoho getRecords(${module}) failed: ${res.status} ${res.statusText} — ${errorBody}`)
    }

    const json = await res.json() as { data?: Record<string, unknown>[] }
    return json.data ?? []
  }

  async getRecord(module: string, id: string): Promise<Record<string, unknown> | null> {
    const token = await this.getAccessToken()

    const res = await fetch(`${ZOHO_API_BASE}/${module}/${id}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    })

    if (!res.ok) {
      const errorBody = await res.text()
      throw new Error(`Zoho getRecord(${module}, ${id}) failed: ${res.status} ${res.statusText} — ${errorBody}`)
    }

    const json = await res.json() as { data?: Record<string, unknown>[] }
    return json.data?.[0] ?? null
  }
}

export const zohoClient = new ZohoClient()
