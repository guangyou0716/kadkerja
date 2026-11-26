import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { fakeApi, PARTS, renderAt, TECH } from '../test/render'

const bodyOf = (init: RequestInit | undefined) => JSON.parse(String(init?.body))
const posts = (api: ReturnType<typeof fakeApi>, url: string) =>
  api.mock.calls.filter(([u, i]) => u === url && i?.method === 'POST').map(([, i]) => bodyOf(i))

describe('Parts page', () => {
  it('lists the shelf with counts; a count below zero says how many to order', async () => {
    fakeApi(() => ({ body: {} }))
    renderAt('/parts')
    const table = await screen.findByRole('table')
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((r) => r.querySelector('td')?.textContent)).toEqual(['BP-MYV-F', 'OIL-5W30-4'])
    expect(screen.getByTestId('on-hand-OIL-5W30-4')).toHaveTextContent('-1')
    expect(within(rows[1]).getByText('1 to order')).toBeInTheDocument()
    expect(within(rows[0]).queryByText('Low')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Parts' })).toHaveAttribute('aria-current', 'page')
  })

  it('a technician sees the shelf and history but cannot change it', async () => {
    const user = userEvent.setup()
    fakeApi((url) =>
      url === '/api/parts/31/movements'
        ? { body: [{ id: 1, at: '2026-11-27T01:00:00Z', change: -2, reason: 'TAKEN', jobId: 7, jobNumber: 'KK-2026-0007', by: null }] }
        : { body: {} },
    { me: TECH })
    renderAt('/parts')
    await screen.findByRole('table')
    expect(screen.queryByRole('button', { name: 'Receive BP-MYV-F' })).not.toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Add a part' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'History of BP-MYV-F' }))
    const link = await screen.findByRole('link', { name: 'Taken for KK-2026-0007 (customer approved)' })
    expect(link).toHaveAttribute('href', '/jobs/7')
    expect(screen.getByText('-2')).toBeInTheDocument()
  })

  it('receives a delivery and refreshes the shelf', async () => {
    const user = userEvent.setup()
    let received = false
    const api = fakeApi((url, init) => {
      if (url === '/api/parts/31/receive' && init?.method === 'POST') {
        received = true
        return { body: { ...PARTS[0], onHand: 10 } }
      }
      return { body: {} }
    }, { parts: PARTS })
    renderAt('/parts')
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: 'Receive BP-MYV-F' }))
    const qty = screen.getByLabelText('How many BP-MYV-F arrived?')
    await user.clear(qty)
    await user.click(screen.getByRole('button', { name: 'Add to stock' }))
    expect(await screen.findByText('At least 1')).toBeInTheDocument()
    expect(received).toBe(false)
    await user.type(qty, '4')
    await user.click(screen.getByRole('button', { name: 'Add to stock' }))
    await waitFor(() => expect(posts(api, '/api/parts/31/receive')).toEqual([{ quantity: 4 }]))
    // The form closes and the list is asked for again.
    await waitFor(() => expect(screen.queryByLabelText('How many BP-MYV-F arrived?')).not.toBeInTheDocument())
    expect(api.mock.calls.filter(([u, i]) => u === '/api/parts' && (i?.method ?? 'GET') === 'GET').length).toBeGreaterThan(1)
  })

  it('a stocktake starts from the current count (zero when below zero)', async () => {
    const user = userEvent.setup()
    const api = fakeApi(() => ({ body: { ...PARTS[1], onHand: 2 } }))
    renderAt('/parts')
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: 'Count OIL-5W30-4' }))
    const count = screen.getByLabelText('How many OIL-5W30-4 are on the shelf?')
    expect(count).toHaveValue(0)
    await user.clear(count)
    await user.type(count, '2')
    await user.click(screen.getByRole('button', { name: 'Save count' }))
    await waitFor(() => expect(posts(api, '/api/parts/32/count')).toEqual([{ onHand: 2 }]))
  })

  it('adds a part, showing a taken part number next to the field', async () => {
    const user = userEvent.setup()
    let taken = true
    const api = fakeApi((url, init) => {
      if (url === '/api/parts' && init?.method === 'POST') {
        if (taken) {
          taken = false
          return { status: 409, body: { detail: 'Some fields need fixing.', fields: { sku: 'this part number is already in stock' } } }
        }
        return { status: 201, body: { id: 40, sku: 'WIP-14', name: 'Wiper blade 14"', unitPriceSen: 2500, onHand: 8, reorderLevel: 2, low: false } }
      }
      return { body: {} }
    })
    renderAt('/parts')
    await screen.findByRole('table')
    await user.type(screen.getByLabelText('Part number'), ' wip-14 ')
    await user.type(screen.getByLabelText('Part name'), 'Wiper blade 14"')
    await user.type(screen.getByLabelText('Price (RM)'), '25')
    await user.clear(screen.getByLabelText('On hand now'))
    await user.type(screen.getByLabelText('On hand now'), '8')
    await user.clear(screen.getByLabelText('Low at'))
    await user.type(screen.getByLabelText('Low at'), '2')
    await user.click(screen.getByRole('button', { name: 'Add part' }))
    expect(await screen.findByText('this part number is already in stock')).toBeInTheDocument()
    expect(screen.getByLabelText('Part number')).toHaveAttribute('aria-invalid', 'true')
    await user.click(screen.getByRole('button', { name: 'Add part' }))
    expect(await screen.findByText('WIP-14 added with 8 on hand.')).toBeInTheDocument()
    expect(posts(api, '/api/parts').at(-1)).toEqual({ sku: 'wip-14', name: 'Wiper blade 14"', unitPriceSen: 2500, onHand: 8, reorderLevel: 2 })
  })

  it('refuses a price it cannot read without calling the server', async () => {
    const user = userEvent.setup()
    const api = fakeApi(() => ({ body: {} }))
    renderAt('/parts')
    await screen.findByRole('table')
    await user.type(screen.getByLabelText('Part number'), 'X-1')
    await user.type(screen.getByLabelText('Part name'), 'X')
    await user.type(screen.getByLabelText('Price (RM)'), 'abc')
    await user.click(screen.getByRole('button', { name: 'Add part' }))
    expect(await screen.findByText('Use an amount like 45 or 45.50')).toBeInTheDocument()
    expect(posts(api, '/api/parts')).toEqual([])
  })
})
