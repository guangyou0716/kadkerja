import type { MessageKey } from './i18n/core'

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

/** The status as staff read it (see i18n/en.ts for the words). */
export const STATUS_KEY: Record<JobStatus, MessageKey> = {
  RECEIVED: 'status.RECEIVED',
  INSPECTING: 'status.INSPECTING',
  QUOTED: 'status.QUOTED',
  APPROVED: 'status.APPROVED',
  DECLINED: 'status.DECLINED',
  IN_PROGRESS: 'status.IN_PROGRESS',
  READY: 'status.READY',
  COLLECTED: 'status.COLLECTED',
  CANCELLED: 'status.CANCELLED',
}

/** What the button that moves a job to this status says (nothing moves a job back to RECEIVED). */
export const MOVE_KEY: Record<JobStatus, MessageKey> = {
  RECEIVED: 'status.RECEIVED',
  INSPECTING: 'move.INSPECTING',
  QUOTED: 'move.QUOTED',
  APPROVED: 'move.APPROVED',
  DECLINED: 'move.DECLINED',
  IN_PROGRESS: 'move.IN_PROGRESS',
  READY: 'move.READY',
  COLLECTED: 'move.COLLECTED',
  CANCELLED: 'move.CANCELLED',
}

/** Board columns: the open statuses, in workshop order. */
export const BOARD_COLUMNS: { title: MessageKey; statuses: JobStatus[] }[] = [
  { title: 'column.checkedIn', statuses: ['RECEIVED', 'INSPECTING'] },
  { title: 'column.waiting', statuses: ['QUOTED'] },
  { title: 'column.workshop', statuses: ['APPROVED', 'IN_PROGRESS'] },
  { title: 'column.ready', statuses: ['READY', 'DECLINED'] },
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
