import type { JobStatus } from './status'

export type LineKind = 'LABOUR' | 'PART'

export interface JobSummary {
  id: number
  number: string
  status: JobStatus
  plate: string
  vehicle: string
  customer: string
  complaint: string
  createdAt: string
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
  events: { from: JobStatus | null; to: JobStatus; at: string; note: string | null }[]
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

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check that it is running.')
  }
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

export const api = {
  jobs: () => call<JobSummary[]>('/api/jobs'),
  job: (id: number) => call<JobCard>(`/api/jobs/${id}`),
  checkIn: (body: CheckIn) => post<JobCard>('/api/jobs', body),
  addLine: (id: number, line: NewLine) => post<JobCard>(`/api/jobs/${id}/lines`, line),
  removeLine: (id: number, lineId: number) =>
    call<JobCard>(`/api/jobs/${id}/lines/${lineId}`, { method: 'DELETE' }),
  move: (id: number, to: JobStatus, note?: string) =>
    post<JobCard>(`/api/jobs/${id}/moves`, { to, note: note || undefined }),
}
