export const ZOHO_ORG_ID = '884788391'

export const ZOHO_BASE_URL = 'https://crm.zoho.com/crm/org884788391'

export const getClaimDeepLink = (recordId: string): string =>
  `https://crm.zoho.com/crm/org884788391/tab/Deals/${recordId}`

export function getPolicyDeepLink(recordId: string): string {
  return `https://crm.zoho.com/crm/org884788391/tab/Policies/${recordId}`
}
