import { createContext, useContext } from 'react'
import type { Assignee, Me } from './api'
import type { JobStatus } from './status'

export const MeContext = createContext<Me | null>(null)

/** The signed-in staff member (inside the AuthGate there always is one). */
export function useMe(): Me {
  const me = useContext(MeContext)
  if (!me) throw new Error('useMe outside AuthGate')
  return me
}

/** Moves a technician may make (from -> to); the server checks the same rule. */
const TECHNICIAN_MOVES = ['RECEIVED>INSPECTING', 'APPROVED>IN_PROGRESS', 'IN_PROGRESS>READY']

export function mayMove(me: Me, from: JobStatus, to: JobStatus): boolean {
  return me.role === 'ADVISOR' || TECHNICIAN_MOVES.includes(`${from}>${to}`)
}

/** A technician works only on jobs that are theirs or not assigned yet; the server checks the same rule. */
export function mayWorkOn(me: Me, assignedTo: Assignee | null): boolean {
  return me.role === 'ADVISOR' || assignedTo === null || assignedTo.id === me.id
}
