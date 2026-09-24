// Canonical team roster — single source for the auth allowlist and
// task-assignee dropdowns. Emails stored lowercase.
export type TeamUser = {
  name: string
  email: string
}

export const TEAM: TeamUser[] = [
  { name: 'Cole Anderson',   email: 'canderson@proguardplans.com' },
  { name: 'Nick Alexander',  email: 'nalexander@proguardplans.com' },
  { name: "Dermot O'Neill",  email: 'doneill@proguardplans.com' },
  { name: 'Michael Feeney',  email: 'mfeeney@proguardplans.com' },
]

export function teamNameForEmail(email: string | null | undefined): string {
  if (!email) return '—'
  const user = TEAM.find((u) => u.email === email.toLowerCase())
  return user?.name ?? email
}
