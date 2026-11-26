export const STATUSES = [
  'RECEIVED',
  'INSPECTING',
  'QUOTED',
  'APPROVED',
  'DECLINED',
  'IN_PROGRESS',
  'READY',
  'COLLECTED',
  'CANCELLED',
] as const

export type JobStatus = (typeof STATUSES)[number]

export const STATUS_LABEL: Record<JobStatus, string> = {
  RECEIVED: 'Received',
  INSPECTING: 'Inspecting',
  QUOTED: 'Waiting for customer',
  APPROVED: 'Approved',
  DECLINED: 'Declined',
  IN_PROGRESS: 'In progress',
  READY: 'Ready to collect',
  COLLECTED: 'Collected',
  CANCELLED: 'Cancelled',
}

/** What the button that moves a job to this status says. */
export const MOVE_LABEL: Record<JobStatus, string> = {
  RECEIVED: 'Received',
  INSPECTING: 'Start inspection',
  QUOTED: 'Send quote',
  APPROVED: 'Customer approved',
  DECLINED: 'Customer declined',
  IN_PROGRESS: 'Start repair',
  READY: 'Ready to collect',
  COLLECTED: 'Handed back',
  CANCELLED: 'Cancel job',
}

/** Board columns: the open statuses, in workshop order. */
export const BOARD_COLUMNS: { title: string; statuses: JobStatus[] }[] = [
  { title: 'Checked in', statuses: ['RECEIVED', 'INSPECTING'] },
  { title: 'Waiting for customer', statuses: ['QUOTED'] },
  { title: 'In the workshop', statuses: ['APPROVED', 'IN_PROGRESS'] },
  { title: 'Ready to collect', statuses: ['READY', 'DECLINED'] },
]

/** Badge colours with at least 4.5:1 contrast for the text. */
export const STATUS_BADGE: Record<JobStatus, string> = {
  RECEIVED: 'bg-slate-100 text-slate-800',
  INSPECTING: 'bg-sky-100 text-sky-900',
  QUOTED: 'bg-amber-100 text-amber-900',
  APPROVED: 'bg-indigo-100 text-indigo-900',
  DECLINED: 'bg-rose-100 text-rose-900',
  IN_PROGRESS: 'bg-violet-100 text-violet-900',
  READY: 'bg-emerald-100 text-emerald-900',
  COLLECTED: 'bg-zinc-100 text-zinc-700',
  CANCELLED: 'bg-zinc-100 text-zinc-700',
}
