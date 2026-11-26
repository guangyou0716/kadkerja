import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { fakeApi, job, renderAt, TECH } from '../test/render'

const bodyOf = (init: RequestInit | undefined) => JSON.parse(String(init?.body))

describe('JobPage', () => {
  it('shows the car, the quote with SST and the timeline', async () => {
    fakeApi(() => ({ body: job() }))
    renderAt('/jobs/7')
    expect(await screen.findByRole('heading', { name: 'PKR 1234' })).toBeInTheDocument()
    expect(screen.getByText('Perodua Myvi (2019)')).toBeInTheDocument()
    expect(screen.getByText('84,210 km')).toBeInTheDocument()
    expect(screen.getByText('RM 188.50')).toBeInTheDocument()
    expect(screen.getByText('SST 8%')).toBeInTheDocument()
    expect(screen.getByTestId('total')).toHaveTextContent('RM 203.58')
    expect(screen.getByText('Bay 2')).toBeInTheDocument()
  })

  it('adds a line with the price in sen and shows the saved card', async () => {
    const user = userEvent.setup()
    const api = fakeApi((url, init) =>
      init?.method === 'POST' && url.endsWith('/lines')
        ? { body: job({ subtotalSen: 23400, totalSen: 25272, taxSen: 1872 }) }
        : { body: job() },
    )
    renderAt('/jobs/7')
    await screen.findByRole('heading', { name: 'PKR 1234' })
    await user.type(screen.getByLabelText('Description'), 'Engine oil 4 L')
    await user.type(screen.getByLabelText('Unit price (RM)'), '45.50')
    await user.click(screen.getByRole('checkbox', { name: 'SST applies' }))
    await user.click(screen.getByRole('button', { name: 'Add line' }))
    await waitFor(() => expect(screen.getByTestId('total')).toHaveTextContent('RM 252.72'))
    const [, init] = api.mock.calls.find(([u, i]) => u === '/api/jobs/7/lines' && i?.method === 'POST')!
    expect(bodyOf(init)).toEqual({
      kind: 'PART',
      description: 'Engine oil 4 L',
      quantity: 1,
      unitPriceSen: 4550,
      taxable: false,
    })
  })

  it('refuses a price it cannot read without calling the server', async () => {
    const user = userEvent.setup()
    const api = fakeApi(() => ({ body: job() }))
    renderAt('/jobs/7')
    await screen.findByRole('heading', { name: 'PKR 1234' })
    await user.type(screen.getByLabelText('Unit price (RM)'), '12.345')
    await user.click(screen.getByRole('button', { name: 'Add line' }))
    expect(screen.getByText('Use an amount like 45 or 45.50')).toBeInTheDocument()
    expect(screen.getByLabelText('Unit price (RM)')).toHaveAttribute('aria-invalid', 'true')
    expect(api.mock.calls.filter(([, i]) => i?.method === 'POST')).toHaveLength(0)
  })

  it('removes a line', async () => {
    const user = userEvent.setup()
    const api = fakeApi((_, init) =>
      init?.method === 'DELETE' ? { body: job({ lines: [job().lines[1]] }) } : { body: job() },
    )
    renderAt('/jobs/7')
    await user.click(await screen.findByRole('button', { name: 'Remove Brake service' }))
    await waitFor(() => expect(screen.queryByText('Brake service')).not.toBeInTheDocument())
    expect(api.mock.calls.some(([u, i]) => u === '/api/jobs/7/lines/11' && i?.method === 'DELETE')).toBe(true)
  })

  it('moves the job with a note, forward steps first and cancel last', async () => {
    const user = userEvent.setup()
    const api = fakeApi((url) =>
      url.endsWith('/moves')
        ? { body: job({ status: 'QUOTED', next: ['APPROVED', 'DECLINED', 'INSPECTING', 'CANCELLED'], quoteVersion: 1 }) }
        : { body: job() },
    )
    renderAt('/jobs/7')
    await screen.findByRole('heading', { name: 'PKR 1234' })
    const buttons = screen.getAllByRole('button').map((b) => b.textContent)
    expect(buttons.indexOf('Send quote')).toBeLessThan(buttons.indexOf('Cancel job'))
    await user.type(screen.getByLabelText('Note (optional)'), ' Pads at 2 mm ')
    await user.click(screen.getByRole('button', { name: 'Send quote' }))
    expect(await screen.findByText('Quote (version 1)')).toBeInTheDocument()
    const [, init] = api.mock.calls.find(([u]) => u === '/api/jobs/7/moves')!
    expect(bodyOf(init)).toEqual({ to: 'QUOTED', note: 'Pads at 2 mm' })
    // Sent: the quote is locked and the next steps are the customer's answer or a redo.
    expect(screen.getByText(/quote is locked once sent/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add line' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Customer approved' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Redo quote' })).toBeInTheDocument()
    const order = screen.getAllByRole('button').map((b) => b.textContent)
    expect(order.indexOf('Customer approved')).toBeLessThan(order.indexOf('Redo quote'))
    expect(order.indexOf('Redo quote')).toBeLessThan(order.indexOf('Cancel job'))
    expect(screen.getByLabelText('Note (optional)')).toHaveValue('')
  })

  it('shows why the server refused a move and keeps the card as it was', async () => {
    const user = userEvent.setup()
    fakeApi((url) =>
      url.endsWith('/moves')
        ? { status: 409, body: { title: 'Not allowed', detail: 'Add at least one quote line before sending the quote.' } }
        : { body: job({ lines: [], subtotalSen: 0, taxSen: 0, totalSen: 0 }) },
    )
    renderAt('/jobs/7')
    await user.click(await screen.findByRole('button', { name: 'Send quote' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Add at least one quote line')
    expect(screen.getByRole('button', { name: 'Send quote' })).toBeEnabled()
    expect(screen.getByRole('heading', { name: 'Quote' })).toBeInTheDocument()
  })

  it('a finished job has no buttons', async () => {
    fakeApi(() => ({ body: job({ status: 'COLLECTED', next: [] }) }))
    renderAt('/jobs/7')
    expect(await screen.findByText('This job is collected. Nothing more to do.')).toBeInTheDocument()
  })

  it('an unknown job shows the 404 message', async () => {
    fakeApi(() => ({ status: 404, body: { detail: 'There is no job card 99.' } }))
    renderAt('/jobs/99')
    expect(await screen.findByRole('alert')).toHaveTextContent('There is no job card 99.')
  })
})

describe('JobPage customer link', () => {
  it('shows the link and a WhatsApp message for the customer', async () => {
    fakeApi(() => ({ body: job({ status: 'QUOTED', next: ['APPROVED', 'DECLINED', 'INSPECTING', 'CANCELLED'] }) }))
    renderAt('/jobs/7')
    const input = await screen.findByRole('textbox', { name: 'Customer link' })
    expect(input).toHaveValue(`${window.location.origin}/t/TestTokenTestTokenTest01`)
    const wa = screen.getByRole('link', { name: 'Send on WhatsApp' })
    expect(wa.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/60120000001\?text=/)
    expect(decodeURIComponent(wa.getAttribute('href')!)).toContain('RM 203.58 incl. SST')
    expect(wa).toHaveAttribute('rel', 'noreferrer')
  })

  it('makes a new link only after confirming', async () => {
    const user = userEvent.setup()
    const api = fakeApi((url, init) =>
      init?.method === 'POST' && url.endsWith('/link')
        ? { body: job({ publicToken: 'NewTokenNewTokenNewTok02' }) }
        : { body: job() },
    )
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    renderAt('/jobs/7')
    await user.click(await screen.findByRole('button', { name: 'New link' }))
    expect(api.mock.calls.some(([u]) => u === '/api/jobs/7/link')).toBe(false)
    await user.click(screen.getByRole('button', { name: 'New link' }))
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Customer link' })).toHaveValue(
        `${window.location.origin}/t/NewTokenNewTokenNewTok02`,
      ),
    )
    expect(confirm).toHaveBeenCalledTimes(2)
    confirm.mockRestore()
  })

  it('marks moves the customer made through the link', async () => {
    fakeApi(() =>
      ({
        body: job({
          status: 'APPROVED',
          next: ['IN_PROGRESS'],
          events: [
            ...job().events,
            { from: 'INSPECTING', to: 'QUOTED', at: '2026-11-26T03:00:00Z', note: null, by: 'STAFF' },
            { from: 'QUOTED', to: 'APPROVED', at: '2026-11-26T03:05:00Z', note: null, by: 'CUSTOMER' },
          ],
        }),
      }),
    )
    renderAt('/jobs/7')
    expect(await screen.findByText('by customer (link)')).toBeInTheDocument()
  })
})

describe('JobPage technician', () => {
  it('the advisor gives the car to an active technician', async () => {
    const user = userEvent.setup()
    const api = fakeApi((_, init) =>
      init?.method === 'PUT' ? { body: job({ assignedTo: { id: 3, name: 'Other Tech' } }) } : { body: job() },
    )
    renderAt('/jobs/7')
    const select = await screen.findByRole('combobox', { name: 'Assigned to' })
    await waitFor(() => expect(select).toBeEnabled())
    const options = Array.from((select as HTMLSelectElement).options).map((o) => o.textContent)
    // Only active technicians (no advisors, nobody who has left).
    expect(options).toEqual(['Nobody yet', 'Test Tech', 'Other Tech'])
    expect(screen.getByRole('button', { name: 'Assign' })).toBeDisabled()
    await user.selectOptions(select, 'Other Tech')
    await user.click(screen.getByRole('button', { name: 'Assign' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Assign' })).toBeDisabled())
    const [, init] = api.mock.calls.find(([u, i]) => u === '/api/jobs/7/assignee' && i?.method === 'PUT')!
    expect(bodyOf(init)).toEqual({ staffId: 3 })
    expect(screen.getByRole('region', { name: 'Car and customer' })).toHaveTextContent('TechnicianOther Tech')
    expect(select).toHaveValue('3')
  })

  it('keeps showing a technician who has since left, and can take the car back', async () => {
    const user = userEvent.setup()
    const api = fakeApi((_, init) =>
      init?.method === 'PUT' ? { body: job() } : { body: job({ assignedTo: { id: 4, name: 'Left Tech' } }) },
    )
    renderAt('/jobs/7')
    const select = await screen.findByRole('combobox', { name: 'Assigned to' })
    await waitFor(() => expect(select).toHaveValue('4'))
    expect(screen.getByRole('option', { name: 'Left Tech (no longer active)' })).toBeInTheDocument()
    await user.selectOptions(select, 'Nobody yet')
    await user.click(screen.getByRole('button', { name: 'Unassign' }))
    await waitFor(() => expect(screen.getByRole('region', { name: 'Car and customer' })).toHaveTextContent('TechnicianNot assigned'))
    const [, init] = api.mock.calls.find(([u, i]) => u === '/api/jobs/7/assignee' && i?.method === 'PUT')!
    expect(bodyOf(init)).toEqual({ staffId: null })
  })

  it("a technician can look at another technician's car but not change it", async () => {
    const api = fakeApi(() => ({ body: job({ status: 'RECEIVED', next: ['INSPECTING', 'CANCELLED'], assignedTo: { id: 3, name: 'Other Tech' } }) }), { me: TECH })
    renderAt('/jobs/7')
    expect(await screen.findByText(/This job is assigned to Other Tech/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start inspection' })).not.toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Add a quote line' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Assigned to' })).not.toBeInTheDocument()
    // A technician never asks for the staff list (the server would refuse it).
    expect(api.mock.calls.some(([u]) => u === '/api/staff')).toBe(false)
  })

  it('a technician works on their own car and on an unassigned one', async () => {
    fakeApi(() => ({ body: job({ status: 'RECEIVED', next: ['INSPECTING', 'CANCELLED'], assignedTo: { id: 2, name: 'Test Tech' } }) }), { me: TECH })
    const { unmount } = renderAt('/jobs/7')
    expect(await screen.findByRole('button', { name: 'Start inspection' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Car and customer' })).toHaveTextContent('Test Tech (you)')
    expect(screen.getByRole('form', { name: 'Add a quote line' })).toBeInTheDocument()
    unmount()
    fakeApi(() => ({ body: job({ status: 'RECEIVED', next: ['INSPECTING', 'CANCELLED'] }) }), { me: TECH })
    renderAt('/jobs/7')
    expect(await screen.findByRole('button', { name: 'Start inspection' })).toBeInTheDocument()
  })

  it('picks a part from stock: it fills the line and sends the part id', async () => {
    const user = userEvent.setup()
    const api = fakeApi((url, init) =>
      init?.method === 'POST' && url.endsWith('/lines') ? { body: job() } : { body: job() },
    )
    renderAt('/jobs/7')
    await screen.findByRole('heading', { name: 'PKR 1234' })
    const picker = await screen.findByLabelText('From stock')
    await screen.findByRole('option', { name: 'BP-MYV-F · Front brake pads (set) (6 on hand)' })
    await user.selectOptions(picker, '31')
    expect(screen.getByLabelText('Description')).toHaveValue('Front brake pads (set)')
    expect(screen.getByLabelText('Unit price (RM)')).toHaveValue('128.00')
    await user.clear(screen.getByLabelText('Unit price (RM)'))
    await user.type(screen.getByLabelText('Unit price (RM)'), '120')
    await user.click(screen.getByRole('button', { name: 'Add line' }))
    await waitFor(() => expect(api.mock.calls.some(([u, i]) => u === '/api/jobs/7/lines' && i?.method === 'POST')).toBe(true))
    const [, init] = api.mock.calls.find(([u, i]) => u === '/api/jobs/7/lines' && i?.method === 'POST')!
    expect(bodyOf(init)).toEqual({ kind: 'PART', description: 'Front brake pads (set)', quantity: 1, unitPriceSen: 12000, taxable: true, partId: 31 })
    // The form is empty again after saving.
    await waitFor(() => expect(screen.getByLabelText('From stock')).toHaveValue(''))
  })

  it('switching to labour drops the stock part', async () => {
    const user = userEvent.setup()
    const api = fakeApi(() => ({ body: job() }))
    renderAt('/jobs/7')
    await screen.findByRole('option', { name: 'BP-MYV-F · Front brake pads (set) (6 on hand)' })
    await user.selectOptions(screen.getByLabelText('From stock'), '31')
    await user.selectOptions(screen.getByLabelText('Kind'), 'LABOUR')
    expect(screen.getByLabelText('From stock')).toHaveValue('')
    await user.click(screen.getByRole('button', { name: 'Add line' }))
    await waitFor(() => expect(api.mock.calls.some(([u, i]) => u === '/api/jobs/7/lines' && i?.method === 'POST')).toBe(true))
    const [, init] = api.mock.calls.find(([u, i]) => u === '/api/jobs/7/lines' && i?.method === 'POST')!
    expect(bodyOf(init)).not.toHaveProperty('partId')
  })

  it('marks a line that takes a stock part', async () => {
    const base = job()
    fakeApi(() => ({ body: job({ lines: [base.lines[0], { ...base.lines[1], partId: 31, partSku: 'BP-MYV-F' }] }) }))
    renderAt('/jobs/7')
    expect(await screen.findByText('stock BP-MYV-F')).toBeInTheDocument()
  })
})
