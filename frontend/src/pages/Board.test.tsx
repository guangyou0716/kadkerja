import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { JobSummary } from '../api'
import { fakeApi, renderAt } from '../test/render'

const row = (id: number, status: JobSummary['status'], plate: string): JobSummary => ({
  id,
  number: `KK-2026-000${id}`,
  status,
  plate,
  vehicle: 'Perodua Myvi',
  customer: 'Test Customer',
  complaint: 'Noise',
  createdAt: '2026-11-26T02:00:00Z',
})

describe('Board', () => {
  it('puts open jobs in workshop columns and leaves finished ones out', async () => {
    fakeApi(() => ({
      body: [
        row(1, 'RECEIVED', 'AAA 1'),
        row(2, 'QUOTED', 'BBB 2'),
        row(3, 'IN_PROGRESS', 'CCC 3'),
        row(4, 'DECLINED', 'DDD 4'),
        row(5, 'COLLECTED', 'EEE 5'),
        row(6, 'CANCELLED', 'FFF 6'),
      ],
    }))
    renderAt('/')
    expect(await screen.findByText('4 open · 2 collected or cancelled')).toBeInTheDocument()
    const col = (name: string) => screen.getByRole('region', { name })
    expect(within(col('Checked in')).getByText('AAA 1')).toBeInTheDocument()
    expect(within(col('Waiting for customer')).getByText('BBB 2')).toBeInTheDocument()
    expect(within(col('In the workshop')).getByText('CCC 3')).toBeInTheDocument()
    expect(within(col('Ready to collect')).getByText('DDD 4')).toBeInTheDocument()
    expect(screen.queryByText('EEE 5')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /AAA 1/ })).toHaveAttribute('href', '/jobs/1')
  })

  it('says so when a column is empty', async () => {
    fakeApi(() => ({ body: [] }))
    renderAt('/')
    expect(await screen.findAllByText('Nothing here.')).toHaveLength(4)
  })

  it('shows the server problem instead of an empty board', async () => {
    fakeApi(() => ({ status: 500, body: { detail: 'Database is down' } }))
    renderAt('/')
    expect(await screen.findByRole('alert')).toHaveTextContent('Database is down')
  })
})
