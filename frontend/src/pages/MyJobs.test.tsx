import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { JobSummary } from '../api'
import { fakeApi, renderAt, TECH } from '../test/render'

const row = (id: number, status: JobSummary['status'], plate: string): JobSummary => ({
  id,
  number: `KK-2026-000${id}`,
  status,
  plate,
  vehicle: 'Perodua Myvi',
  customer: 'Test Customer',
  complaint: 'Noise',
  createdAt: '2026-11-26T02:00:00Z',
  assignedTo: { id: 2, name: 'Test Tech' },
})

describe('My jobs', () => {
  it('asks only for my jobs and puts work in progress first, waiting cars apart', async () => {
    const api = fakeApi(
      () => ({
        body: [
          row(1, 'RECEIVED', 'AAA 1'),
          row(2, 'IN_PROGRESS', 'BBB 2'),
          row(3, 'QUOTED', 'CCC 3'),
          row(4, 'APPROVED', 'DDD 4'),
          row(5, 'COLLECTED', 'EEE 5'),
          row(6, 'READY', 'FFF 6'),
        ],
      }),
      { me: TECH },
    )
    renderAt('/my-jobs')
    expect(await screen.findByText('3 to work on · 2 waiting · 1 finished')).toBeInTheDocument()
    expect(api.mock.calls.some(([u]) => u === '/api/jobs?mine=true')).toBe(true)
    const plates = (name: string) =>
      within(screen.getByRole('region', { name })).getAllByRole('link').map((l) => l.textContent?.slice(0, 5))
    expect(plates('To work on')).toEqual(['BBB 2', 'DDD 4', 'AAA 1'])
    expect(plates('Waiting for the customer or advisor')).toEqual(['CCC 3', 'FFF 6'])
    expect(screen.queryByText('EEE 5')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'My jobs' })).toHaveAttribute('aria-current', 'page')
  })

  it('explains how to get a car when there is none', async () => {
    fakeApi(() => ({ body: [] }), { me: TECH })
    renderAt('/my-jobs')
    expect(await screen.findByText(/Starting the inspection of an unassigned car/)).toBeInTheDocument()
  })

  it('the advisor has check-in in the menu instead of My jobs', async () => {
    fakeApi(() => ({ body: [] }))
    renderAt('/')
    expect(await screen.findByRole('link', { name: 'Check in a car' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'My jobs' })).not.toBeInTheDocument()
  })
})
