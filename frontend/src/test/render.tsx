import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import { AppRoutes } from '../App'
import type { JobCard, Me, Part, Photo, PublicJob, StaffMember } from '../api'

/** The app at [path] with a fresh cache (no retries, so errors show at once). */
export function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

type Handler = (url: string, init: RequestInit | undefined) => { status?: number; body: unknown }

export const ADVISOR: Me = { id: 1, username: 'advisor', name: 'Test Advisor', role: 'ADVISOR' }
export const TECH: Me = { id: 2, username: 'tech', name: 'Test Tech', role: 'TECHNICIAN' }

export const STAFF: StaffMember[] = [
  { id: 1, username: 'advisor', name: 'Test Advisor', role: 'ADVISOR', active: true },
  { id: 2, username: 'tech', name: 'Test Tech', role: 'TECHNICIAN', active: true },
  { id: 3, username: 'tech2', name: 'Other Tech', role: 'TECHNICIAN', active: true },
  { id: 4, username: 'gone', name: 'Left Tech', role: 'TECHNICIAN', active: false },
]

export const PARTS: Part[] = [
  { id: 31, sku: 'BP-MYV-F', name: 'Front brake pads (set)', unitPriceSen: 12800, onHand: 6, reorderLevel: 2, low: false },
  { id: 32, sku: 'OIL-5W30-4', name: 'Engine oil 5W-30, 4 L', unitPriceSen: 11500, onHand: -1, reorderLevel: 4, low: true },
]

/**
 * Replaces fetch (photos of a job: [photos], or null to let [handler] answer); returns the mock so tests can look at the requests. Sign-in calls and the staff
 * list (GET /api/staff) are answered here: signed in as [me] (an advisor by default; null = not
 * signed in).
 */
export function fakeApi(
  handler: Handler,
  {
    me = ADVISOR,
    staff = STAFF,
    parts = PARTS,
    photos = [],
  }: { me?: Me | null; staff?: StaffMember[]; parts?: Part[]; photos?: Photo[] | null } = {},
) {
  const mock = vi.fn(async (url: string, init?: RequestInit) => {
    const auth =
      url === '/api/staff' && (init?.method ?? 'GET') === 'GET'
        ? { status: 200, body: staff }
        : url === '/api/parts' && (init?.method ?? 'GET') === 'GET'
        ? { status: 200, body: parts }
        : /^\/api\/jobs\/\d+\/photos$/.test(url) && (init?.method ?? 'GET') === 'GET' && photos
        ? { status: 200, body: photos }
        : url === '/api/auth/me'
        ? me
          ? { status: 200, body: me }
          : { status: 401, body: { detail: 'Please sign in to continue.' } }
        : url === '/api/auth/csrf'
          ? { status: 200, body: { headerName: 'X-XSRF-TOKEN', token: 'test-csrf' } }
          : null
    const { status = 200, body } = auth ?? handler(url, init)
    if (status === 204) return new Response(null, { status })
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': status < 400 ? 'application/json' : 'application/problem+json' },
    })
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

export function job(over: Partial<JobCard> = {}): JobCard {
  return {
    id: 7,
    number: 'KK-2026-0007',
    status: 'INSPECTING',
    next: ['QUOTED', 'CANCELLED'],
    complaint: 'Brakes squeak',
    mileageKm: 84210,
    createdAt: '2026-11-26T02:00:00Z',
    vehicle: { id: 1, plate: 'PKR 1234', make: 'Perodua', model: 'Myvi', year: 2019 },
    customer: { id: 1, name: 'Test Customer', phone: '012-0000001' },
    quoteVersion: 0,
    lines: [
      { id: 11, kind: 'LABOUR', description: 'Brake service', quantity: 1, unitPriceSen: 6000, taxable: true, subtotalSen: 6000, taxSen: 480, partId: null, partSku: null },
      { id: 12, kind: 'PART', description: 'Brake pads', quantity: 2, unitPriceSen: 6425, taxable: true, subtotalSen: 12850, taxSen: 1028, partId: null, partSku: null },
    ],
    subtotalSen: 18850,
    taxSen: 1508,
    totalSen: 20358,
    sstRatePercent: 8,
    publicToken: 'TestTokenTestTokenTest01',
    events: [
      { from: null, to: 'RECEIVED', at: '2026-11-26T02:00:00Z', note: null, by: 'STAFF' },
      { from: 'RECEIVED', to: 'INSPECTING', at: '2026-11-26T02:10:00Z', note: 'Bay 2', by: 'STAFF' },
    ],
    assignedTo: null,
    ...over,
  }
}

export function publicJob(over: Partial<PublicJob> = {}): PublicJob {
  return {
    workshop: 'Demo Auto Workshop',
    number: 'KK-2026-0007',
    status: 'QUOTED',
    plate: 'PKR 1234',
    vehicle: 'Perodua Myvi',
    complaint: 'Brakes squeak',
    checkedInAt: '2026-11-26T02:00:00Z',
    quoteVisible: true,
    quoteVersion: 2,
    lines: [
      { kind: 'LABOUR', description: 'Brake service', quantity: 1, unitPriceSen: 6000, taxable: true, subtotalSen: 6000, taxSen: 480 },
      { kind: 'PART', description: 'Brake pads', quantity: 2, unitPriceSen: 6425, taxable: true, subtotalSen: 12850, taxSen: 1028 },
    ],
    subtotalSen: 18850,
    taxSen: 1508,
    totalSen: 20358,
    sstRatePercent: 8,
    canAnswer: true,
    timeline: [
      { status: 'RECEIVED', at: '2026-11-26T02:00:00Z', by: 'STAFF' },
      { status: 'INSPECTING', at: '2026-11-26T02:10:00Z', by: 'STAFF' },
      { status: 'QUOTED', at: '2026-11-26T03:00:00Z', by: 'STAFF' },
    ],
    photos: [],
    ...over,
  }
}
