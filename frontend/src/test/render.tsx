import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import { AppRoutes } from '../App'
import type { JobCard, PublicJob } from '../api'

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

/** Replaces fetch; returns the mock so tests can look at the requests. */
export function fakeApi(handler: Handler) {
  const mock = vi.fn(async (url: string, init?: RequestInit) => {
    const { status = 200, body } = handler(url, init)
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
      { id: 11, kind: 'LABOUR', description: 'Brake service', quantity: 1, unitPriceSen: 6000, taxable: true, subtotalSen: 6000, taxSen: 480 },
      { id: 12, kind: 'PART', description: 'Brake pads', quantity: 2, unitPriceSen: 6425, taxable: true, subtotalSen: 12850, taxSen: 1028 },
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
    ...over,
  }
}
