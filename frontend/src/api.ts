import type { JobStatus } from './status'

export type LineKind = 'LABOUR' | 'PART'

/** The technician a job is assigned to (null = nobody yet). */
export interface Assignee {
  id: number
  name: string
}

export interface JobSummary {
  id: number
  number: string
  status: JobStatus
  plate: string
  vehicle: string
  customer: string
  complaint: string
  createdAt: string
  assignedTo: Assignee | null
}

export interface QuoteLine {
  id: number
  kind: LineKind
  description: string
  quantity: number
  unitPriceSen: number
  taxable: boolean
  subtotalSen: number
  taxSen: number
}

export interface JobCard {
  id: number
  number: string
  status: JobStatus
  next: JobStatus[]
  complaint: string
  mileageKm: number | null
  createdAt: string
  vehicle: { id: number; plate: string; make: string; model: string; year: number | null }
  customer: { id: number; name: string; phone: string }
  quoteVersion: number
  lines: QuoteLine[]
  subtotalSen: number
  taxSen: number
  totalSen: number
  sstRatePercent: number
  /** Key of the customer's progress link (/t/<token>). */
  publicToken: string
  events: { from: JobStatus | null; to: JobStatus; at: string; note: string | null; by: Actor }[]
  assignedTo: Assignee | null
}

export type Actor = 'STAFF' | 'CUSTOMER'
export type Decision = 'APPROVE' | 'DECLINE'

/** What the customer's progress link shows (no ids, no personal details, no staff notes). */
export interface PublicJob {
  workshop: string
  number: string
  status: JobStatus
  plate: string
  vehicle: string
  complaint: string
  checkedInAt: string
  quoteVisible: boolean
  quoteVersion: number
  lines: Omit<QuoteLine, 'id'>[]
  subtotalSen: number
  taxSen: number
  totalSen: number
  sstRatePercent: number
  canAnswer: boolean
  timeline: { status: JobStatus; at: string; by: Actor }[]
}

export interface CheckIn {
  customerName: string
  phone: string
  plate: string
  make: string
  model: string
  year?: number
  mileageKm?: number
  complaint: string
}

export interface NewLine {
  kind: LineKind
  description: string
  quantity: number
  unitPriceSen: number
  taxable: boolean
}

/** An error from the API (RFC 9457 problem+json), with a message per field for a 400. */
export class ApiError extends Error {
  readonly status: number
  readonly fields: Record<string, string>

  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message)
    this.status = status
    this.fields = fields
  }
}

export type Role = 'ADVISOR' | 'TECHNICIAN'

/** The signed-in staff member. */
export interface Me {
  id: number
  username: string
  name: string
  role: Role
}

/** A member of staff as the advisor sees them (no password, ever). */
export interface StaffMember {
  id: number
  username: string
  name: string
  role: Role
  active: boolean
}

export interface NewStaff {
  username: string
  name: string
  role: Role
  password: string
}

/** Fired when the server says the session is gone, so the app shows the sign-in form. */
export const SIGNED_OUT_EVENT = 'kadkerja:signed-out'

// CSRF: the server sets the XSRF-TOKEN cookie; every change sends it back as X-XSRF-TOKEN.
// If the cookie is not there yet (first visit, or just after signing in), ask for one.
let fetchedToken: string | null = null

function cookieToken(): string | null {
  const m = /(?:^|;\s*)XSRF-TOKEN=([^;]+)/.exec(document.cookie)
  return m ? decodeURIComponent(m[1]) : null
}

async function csrfToken(): Promise<string> {
  const fromCookie = cookieToken()
  if (fromCookie) return fromCookie
  if (!fetchedToken) fetchedToken = (await call<{ token: string }>('/api/auth/csrf')).token
  return fetchedToken
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? 'GET'
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' }
  // The customer link has no session, so it needs no CSRF token.
  if (method !== 'GET' && !path.startsWith('/api/public/')) headers['X-XSRF-TOKEN'] = await csrfToken()
  let res: Response
  try {
    res = await fetch(path, { ...init, headers, credentials: 'same-origin' })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check that it is running.')
  }
  if (res.status === 401 && !path.startsWith('/api/auth/') && !path.startsWith('/api/public/')) {
    window.dispatchEvent(new Event(SIGNED_OUT_EVENT))
  }
  if (res.status === 204) return undefined as T
  if (res.ok) return (await res.json()) as T
  let body: { detail?: string; fields?: Record<string, string> } = {}
  try {
    body = await res.json()
  } catch {
    // Not problem+json (a proxy error page, say): fall back to the status text.
  }
  throw new ApiError(res.status, body.detail ?? `${res.status} ${res.statusText}`.trim(), body.fields ?? {})
}

const post = <T>(path: string, body: unknown) =>
  call<T>(path, { method: 'POST', body: JSON.stringify(body) })

/** Signing in or out changes the CSRF token: forget the one we fetched. */
const freshSession = <T>(p: Promise<T>) =>
  p.finally(() => {
    fetchedToken = null
  })

export const api = {
  me: () => call<Me>('/api/auth/me'),
  login: (username: string, password: string) => freshSession(post<Me>('/api/auth/login', { username, password })),
  logout: () => freshSession(post<void>('/api/auth/logout', {})),
  jobs: () => call<JobSummary[]>('/api/jobs'),
  myJobs: () => call<JobSummary[]>('/api/jobs?mine=true'),
  staff: () => call<StaffMember[]>('/api/staff'),
  addStaff: (body: NewStaff) => post<StaffMember>('/api/staff', body),
  deactivateStaff: (id: number) => post<StaffMember>(`/api/staff/${id}/deactivate`, {}),
  activateStaff: (id: number) => post<StaffMember>(`/api/staff/${id}/activate`, {}),
  setStaffPassword: (id: number, password: string) => post<StaffMember>(`/api/staff/${id}/password`, { password }),
  changePassword: (currentPassword: string, newPassword: string) =>
    post<void>('/api/auth/password', { currentPassword, newPassword }),
  assign: (id: number, staffId: number | null) =>
    call<JobCard>(`/api/jobs/${id}/assignee`, { method: 'PUT', body: JSON.stringify({ staffId }) }),
  job: (id: number) => call<JobCard>(`/api/jobs/${id}`),
  checkIn: (body: CheckIn) => post<JobCard>('/api/jobs', body),
  addLine: (id: number, line: NewLine) => post<JobCard>(`/api/jobs/${id}/lines`, line),
  removeLine: (id: number, lineId: number) =>
    call<JobCard>(`/api/jobs/${id}/lines/${lineId}`, { method: 'DELETE' }),
  move: (id: number, to: JobStatus, note?: string) =>
    post<JobCard>(`/api/jobs/${id}/moves`, { to, note: note || undefined }),
  resetLink: (id: number) => post<JobCard>(`/api/jobs/${id}/link`, {}),
  publicJob: (token: string) => call<PublicJob>(`/api/public/jobs/${encodeURIComponent(token)}`),
  answer: (token: string, decision: Decision, quoteVersion: number, note?: string) =>
    post<PublicJob>(`/api/public/jobs/${encodeURIComponent(token)}/answer`, {
      decision,
      quoteVersion,
      note: note || undefined,
    }),
}
