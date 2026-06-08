export const AST_PIPELINES: string[] = [
  'AST Oil Visible Claims',
  'AST Proactive Replacement Claims',
]

// Boundary values — all stages between (inclusive) are considered open
export const AST_OPEN_STAGES: string[] = ['New', 'Ready for Benefit Payment']

export const AST_COMPLETED_STAGES: string[] = ['Complete']

export const AST_DENIED_STAGES: string[] = ['Claim Denied']

export const UST_PIPELINE: string = 'UST Claims'

export const UST_PRE_TANK_STAGES: string[] = [
  'Needs Analysis',
  'Service Fee Billed',
  'Attendance Deployed',
]

// Boundary values — all stages between (inclusive) are open,
// AND Proceed_to_Remediation must equal 'Yes'
export const UST_OPEN_STAGES: string[] = [
  'Claim Form Completed',
  'Remediation Completed',
]

export const UST_CLOSED_STAGES: string[] = ['Completed']

export type ClaimStatus =
  | 'ast_open'
  | 'ast_completed'
  | 'ast_denied'
  | 'ust_pre_tank'
  | 'ust_open'
  | 'ust_closed'
